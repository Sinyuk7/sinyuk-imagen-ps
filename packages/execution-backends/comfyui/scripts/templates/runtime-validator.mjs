const MAX_DOCUMENT_BYTES = 65_536;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function failure(code) {
  return { ok: false, error: { code, messageKey: `contract.${code}` } };
}

function isRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function parseDocument(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (utf8Bytes(value) > MAX_DOCUMENT_BYTES) return failure('oversized');
    try {
      parsed = JSON.parse(value);
    } catch {
      return failure('malformed');
    }
  }
  if (!isRecord(parsed)) return failure('malformed');
  let serialized;
  try {
    serialized = JSON.stringify(parsed);
  } catch {
    return failure('malformed');
  }
  if (utf8Bytes(serialized) > MAX_DOCUMENT_BYTES) return failure('oversized');
  return { ok: true, value: parsed };
}

function schemaFacts(schema) {
  if (!isRecord(schema) || !isRecord(schema.$defs)) return undefined;
  const defs = schema.$defs;
  const binding = defs.bindingContract;
  const type = defs.typeContract;
  const locator = defs.locator;
  if (!isRecord(binding) || !isRecord(type) || !isRecord(locator)) return undefined;
  const version = binding.properties?.schemaVersion?.const;
  const typeVersion = type.properties?.schemaVersion?.const;
  const roles = defs.role?.enum;
  const dataTypes = defs.dataType?.enum;
  const encodings = defs.maskEncoding?.enum;
  const operations = type.properties?.operation?.enum;
  const maxEntries = binding.properties?.bindings?.maxItems;
  const maxLocatorChars = locator.properties?.nodeId?.maxLength;
  if (
    version !== 1
    || typeVersion !== version
    || !Array.isArray(roles)
    || !Array.isArray(dataTypes)
    || !Array.isArray(encodings)
    || !Array.isArray(operations)
    || !Number.isInteger(maxEntries)
    || !Number.isInteger(maxLocatorChars)
  ) return undefined;
  return {
    version,
    roles: new Set(roles),
    dataTypes: new Set(dataTypes),
    encodings: new Set(encodings),
    operations: new Set(operations),
    maxEntries,
    maxLocatorChars,
  };
}

function validLocator(locator, maxChars) {
  return exactKeys(locator, ['nodeId', 'fieldName'])
    && typeof locator.nodeId === 'string'
    && typeof locator.fieldName === 'string'
    && locator.nodeId.length > 0
    && locator.fieldName.length > 0
    && [...locator.nodeId].length <= maxChars
    && [...locator.fieldName].length <= maxChars
    && !CONTROL_CHARS.test(locator.nodeId)
    && !CONTROL_CHARS.test(locator.fieldName);
}

function keyOf(entry) {
  return `${entry.role}\u0000${entry.slot}`;
}

function continuous(entries, role) {
  const slots = entries
    .filter((entry) => entry.role === role)
    .map((entry) => entry.slot)
    .sort((left, right) => left - right);
  return slots.every((slot, index) => slot === index);
}

function canonicalOrder(left, right) {
  const rank = { prompt: 0, image: 1, mask: 2, 'output-image': 3 };
  return rank[left.role] - rank[right.role] || left.slot - right.slot;
}

/** 验证并合并两个 canonical workflow contract 文档。 */
export function validateWorkflowContractDocuments(bindingInput, typeInput, schema) {
  const facts = schemaFacts(schema);
  if (facts === undefined) return failure('malformed-schema');
  const parsedBinding = parseDocument(bindingInput);
  if (!parsedBinding.ok) return parsedBinding;
  const parsedType = parseDocument(typeInput);
  if (!parsedType.ok) return parsedType;
  const binding = parsedBinding.value;
  const type = parsedType.value;

  if (binding.schemaVersion !== facts.version || type.schemaVersion !== facts.version) {
    return failure('unsupported-version');
  }
  if (!exactKeys(binding, ['schemaVersion', 'bindings']) || !Array.isArray(binding.bindings)) {
    return failure('malformed');
  }
  if (!exactKeys(type, ['schemaVersion', 'operation', 'entries']) || !Array.isArray(type.entries)) {
    return failure('malformed');
  }
  if (!facts.operations.has(type.operation)) return failure('invalid-operation');
  if (
    binding.bindings.length === 0
    || binding.bindings.length > facts.maxEntries
    || type.entries.length === 0
    || type.entries.length > facts.maxEntries
    || binding.bindings.length !== type.entries.length
  ) return failure('invalid-cardinality');

  const bindings = new Map();
  const locators = new Set();
  for (const entry of binding.bindings) {
    if (
      !exactKeys(entry, ['role', 'slot', 'locator'])
      || !facts.roles.has(entry.role)
      || !Number.isInteger(entry.slot)
      || entry.slot < 0
      || entry.slot >= facts.maxEntries
      || !validLocator(entry.locator, facts.maxLocatorChars)
    ) return failure('malformed');
    const key = keyOf(entry);
    const locatorKey = `${entry.locator.nodeId}\u0000${entry.locator.fieldName}`;
    if (bindings.has(key) || locators.has(locatorKey)) return failure('duplicate-key');
    bindings.set(key, entry);
    locators.add(locatorKey);
  }

  const types = new Map();
  for (const entry of type.entries) {
    if (
      !exactKeys(entry, ['role', 'slot', 'required', 'dataType'], ['maskEncoding'])
      || !facts.roles.has(entry.role)
      || !Number.isInteger(entry.slot)
      || entry.slot < 0
      || entry.slot >= facts.maxEntries
      || typeof entry.required !== 'boolean'
      || !facts.dataTypes.has(entry.dataType)
    ) return failure('malformed');
    if (entry.role === 'mask') {
      if (!facts.encodings.has(entry.maskEncoding)) return failure('invalid-encoding');
    } else if (entry.maskEncoding !== undefined) {
      return failure('invalid-encoding');
    }
    const key = keyOf(entry);
    if (types.has(key)) return failure('duplicate-key');
    types.set(key, entry);
  }

  if (bindings.size !== types.size || [...bindings.keys()].some((key) => !types.has(key))) {
    return failure('key-mismatch');
  }

  const entries = [];
  for (const [key, bindingEntry] of bindings) {
    const typeEntry = types.get(key);
    if (typeEntry === undefined) return failure('key-mismatch');
    const expectedType = bindingEntry.role === 'prompt'
      ? 'text'
      : bindingEntry.role === 'mask'
        ? 'mask'
        : 'image';
    if (typeEntry.dataType !== expectedType) return failure('invalid-type');
    entries.push({
      role: bindingEntry.role,
      slot: bindingEntry.slot,
      required: typeEntry.required,
      dataType: typeEntry.dataType,
      locator: {
        nodeId: bindingEntry.locator.nodeId,
        fieldName: bindingEntry.locator.fieldName,
      },
      ...(typeEntry.maskEncoding !== undefined ? { maskEncoding: typeEntry.maskEncoding } : {}),
    });
  }

  const prompts = entries.filter((entry) => entry.role === 'prompt');
  const masks = entries.filter((entry) => entry.role === 'mask');
  const outputs = entries.filter((entry) => entry.role === 'output-image');
  const images = entries.filter((entry) => entry.role === 'image');
  if (prompts.length !== 1 || prompts[0].slot !== 0 || !prompts[0].required) {
    return failure('invalid-cardinality');
  }
  if (masks.length > 1 || (masks.length === 1 && masks[0].slot !== 0)) {
    return failure('invalid-cardinality');
  }
  if (!continuous(entries, 'image') || !continuous(entries, 'output-image')) {
    return failure('invalid-cardinality');
  }
  if (outputs.length === 0 || !outputs.some((entry) => entry.required)) {
    return failure('invalid-cardinality');
  }
  if (type.operation === 'text-to-image' && (images.length > 0 || masks.length > 0)) {
    return failure('invalid-operation');
  }
  if (type.operation === 'image-edit' && !images.some((entry) => entry.required)) {
    return failure('invalid-operation');
  }

  entries.sort(canonicalOrder);
  return {
    ok: true,
    value: {
      schemaVersion: facts.version,
      operation: type.operation,
      entries,
    },
  };
}

/** 验证跨 runtime 传入的 canonical workflow contract。 */
export function validateCanonicalWorkflowContract(value, schema) {
  if (!exactKeys(value, ['schemaVersion', 'operation', 'entries']) || !Array.isArray(value.entries)) {
    return failure('malformed');
  }
  const binding = {
    schemaVersion: value.schemaVersion,
    bindings: [],
  };
  const type = {
    schemaVersion: value.schemaVersion,
    operation: value.operation,
    entries: [],
  };
  for (const entry of value.entries) {
    if (!exactKeys(entry, ['role', 'slot', 'required', 'dataType', 'locator'], ['maskEncoding'])) {
      return failure('malformed');
    }
    binding.bindings.push({ role: entry.role, slot: entry.slot, locator: entry.locator });
    type.entries.push({
      role: entry.role,
      slot: entry.slot,
      required: entry.required,
      dataType: entry.dataType,
      ...(entry.maskEncoding !== undefined ? { maskEncoding: entry.maskEncoding } : {}),
    });
  }
  return validateWorkflowContractDocuments(binding, type, schema);
}
