const COMMANDS = new Set([
  'handshake',
  'list-workflows',
  'submit-workflow',
  'reset',
  'dispose',
]);

const COMPATIBILITY_KEYS = [
  'protocolVersion',
  'bridgeVersion',
  'frontendVersion',
  'coreVersion',
  'contractSchemaVersion',
  'contractSchemaSha256',
];

const SAFE_ERROR_CODES = new Set([
  'bridge-incompatible',
  'identity-mismatch',
  'invalid-contract',
  'invalid-request',
  'invalid-workflow',
  'limit-exceeded',
  'submission-rejected',
  'submission-unknown',
  'unsupported-command',
]);

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const VALUE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const PLUGIN_ID = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/u;

export class BridgeProtocolError extends Error {
  constructor(code, options = {}) {
    super(code);
    this.name = 'BridgeProtocolError';
    this.code = SAFE_ERROR_CODES.has(code) ? code : 'bridge-incompatible';
    this.fatalCanvas = options.fatalCanvas === true;
  }
}

function fail(code) {
  throw new BridgeProtocolError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, code = 'invalid-request') {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
}

function serializedBytes(value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') fail('invalid-request');
    return new TextEncoder().encode(serialized).byteLength;
  } catch (error) {
    if (error instanceof BridgeProtocolError) throw error;
    fail('invalid-request');
  }
}

function assertBoundedId(value, limits) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > limits.maxIdChars ||
    CONTROL_CHARACTERS.test(value)
  ) {
    fail('invalid-request');
  }
  return value;
}

function assertBoundedLocatorPart(value, limits) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > limits.maxIdChars ||
    CONTROL_CHARACTERS.test(value)
  ) {
    fail('invalid-request');
  }
  return value;
}

export function assertCanonicalWorkflowPath(value, limits) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > limits.maxWorkflowPathBytes ||
    CONTROL_CHARACTERS.test(value) ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes('\\') ||
    value.includes('%') ||
    !value.endsWith('.json')
  ) {
    fail('invalid-workflow');
  }
  const segments = value.split('/');
  if (
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
    /^[A-Za-z]:/u.test(segments[0])
  ) {
    fail('invalid-workflow');
  }
  return value;
}

function assertCompatibilityShape(compatibility) {
  assertExactKeys(compatibility, COMPATIBILITY_KEYS, 'bridge-incompatible');
  if (
    compatibility.protocolVersion !== 1 ||
    typeof compatibility.bridgeVersion !== 'string' ||
    typeof compatibility.frontendVersion !== 'string' ||
    typeof compatibility.coreVersion !== 'string' ||
    compatibility.contractSchemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/u.test(compatibility.contractSchemaSha256)
  ) {
    fail('bridge-incompatible');
  }
}

function assertConfigShape(config) {
  assertExactKeys(config, ['capabilities', 'limits']);
  assertExactKeys(config.capabilities, ['nativeQueue', 'receiptObserver', 'workflowDiscovery']);
  for (const value of Object.values(config.capabilities)) {
    if (value !== true) fail('bridge-incompatible');
  }
  assertExactKeys(config.limits, [
    'maxMessageBytes',
    'maxWorkflowPathBytes',
    'maxWorkflowListEntries',
    'maxMutations',
    'maxIdChars',
    'maxConfigureTimeoutMs',
  ]);
  const expectedLimits = {
    maxMessageBytes: 2_000_000,
    maxWorkflowPathBytes: 512,
    maxWorkflowListEntries: 1_000,
    maxMutations: 16,
    maxIdChars: 128,
    maxConfigureTimeoutMs: 30_000,
  };
  for (const [key, value] of Object.entries(expectedLimits)) {
    if (config.limits[key] !== value) fail('bridge-incompatible');
  }
}

/** 判断 canonical HTTP(S) message origin。 */
export function isCanonicalHttpOrigin(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value;
  } catch {
    return false;
  }
}

/** 判断 Photoshop UXP plugin-id message origin。 */
export function isCanonicalPluginId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Array.from(value).length <= 128 &&
    PLUGIN_ID.test(value)
  );
}

/** 判断 Bridge 支持的两种 exact message origin。 */
export function isBridgeIdentityOrigin(value) {
  return isCanonicalHttpOrigin(value) || isCanonicalPluginId(value);
}

function assertIdentityShape(identity, limits) {
  assertExactKeys(identity, ['origin', 'sourceId', 'loadId']);
  if (!isBridgeIdentityOrigin(identity.origin)) fail('invalid-request');
  assertBoundedId(identity.sourceId, limits);
  assertBoundedId(identity.loadId, limits);
}

function sameIdentity(left, right) {
  return (
    left.origin === right.origin &&
    left.sourceId === right.sourceId &&
    left.loadId === right.loadId
  );
}

function assertHandshakePayload(payload, compatibility) {
  assertExactKeys(payload, COMPATIBILITY_KEYS);
  for (const key of COMPATIBILITY_KEYS) {
    if (payload[key] !== compatibility[key]) fail('bridge-incompatible');
  }
}

function assertTimeout(value, limits) {
  if (!Number.isInteger(value) || value < 100 || value > limits.maxConfigureTimeoutMs) {
    fail('limit-exceeded');
  }
  return value;
}

function validateMutationPayload(payload, limits) {
  assertExactKeys(payload, [
    'operationId',
    'remotePath',
    'batchCount',
    'mutations',
    'configureTimeoutMs',
    'receiptTimeoutMs',
  ]);
  const operationId = assertBoundedId(payload.operationId, limits);
  const remotePath = assertCanonicalWorkflowPath(payload.remotePath, limits);
  if (payload.batchCount !== 1) fail('invalid-request');
  if (!Array.isArray(payload.mutations) || payload.mutations.length > limits.maxMutations) {
    fail('limit-exceeded');
  }
  if (payload.mutations.length === 0) fail('invalid-request');
  const mutations = payload.mutations.map((mutation) => {
    assertExactKeys(mutation, ['locator', 'value']);
    assertExactKeys(mutation.locator, ['nodeId', 'fieldName']);
    const locator = {
      nodeId: assertBoundedLocatorPart(mutation.locator.nodeId, limits),
      fieldName: assertBoundedLocatorPart(mutation.locator.fieldName, limits),
    };
    if (typeof mutation.value !== 'string' || VALUE_CONTROL_CHARACTERS.test(mutation.value)) {
      fail('invalid-request');
    }
    return { locator, value: mutation.value };
  });
  return {
    operationId,
    remotePath,
    batchCount: 1,
    mutations,
    configureTimeoutMs: assertTimeout(payload.configureTimeoutMs, limits),
    receiptTimeoutMs: assertTimeout(payload.receiptTimeoutMs, limits),
  };
}

function locatorKey(locator) {
  return `${locator.nodeId}\u0000${locator.fieldName}`;
}

function validateContractDerivedMutations(contract, mutations, limits) {
  const inputEntries = contract.entries.filter((entry) => entry.role !== 'output-image');
  const entriesByLocator = new Map();
  for (const entry of inputEntries) {
    const key = locatorKey(entry.locator);
    if (entriesByLocator.has(key)) fail('invalid-contract');
    entriesByLocator.set(key, entry);
  }

  const seen = new Set();
  const plan = mutations.map((mutation) => {
    const key = locatorKey(mutation.locator);
    const entry = entriesByLocator.get(key);
    if (!entry || seen.has(key)) fail('invalid-contract');
    seen.add(key);
    if (mutation.value.length === 0 || (entry.role === 'prompt' && mutation.value.trim().length === 0)) {
      fail('invalid-contract');
    }
    if (
      (entry.role === 'image' || entry.role === 'mask') &&
      (CONTROL_CHARACTERS.test(mutation.value) ||
        new TextEncoder().encode(mutation.value).byteLength > limits.maxWorkflowPathBytes)
    ) {
      fail('limit-exceeded');
    }
    return { entry, locator: mutation.locator, value: mutation.value };
  });

  for (const entry of inputEntries) {
    if (entry.required && !seen.has(locatorKey(entry.locator))) fail('invalid-contract');
  }
  return plan;
}

function sanitizeContractSummary(contract) {
  return {
    schemaVersion: contract.schemaVersion,
    operation: contract.operation,
    entries: contract.entries.map((entry) => ({
      role: entry.role,
      slot: entry.slot,
      required: entry.required,
      dataType: entry.dataType,
      ...(entry.maskEncoding === undefined ? {} : { maskEncoding: entry.maskEncoding }),
      locator: {
        nodeId: entry.locator.nodeId,
        fieldName: entry.locator.fieldName,
      },
    })),
  };
}

function sanitizeError(error, fallback = 'bridge-incompatible') {
  if (error instanceof BridgeProtocolError && SAFE_ERROR_CODES.has(error.code)) return error.code;
  return fallback;
}

function success(requestId, payload) {
  return { requestId, ok: true, payload };
}

function failure(requestId, errorCode) {
  return { requestId, ok: false, errorCode };
}

class CanvasLease {
  constructor() {
    this.owner = null;
    this.waiters = [];
    this.disposed = false;
  }

  acquire(operationId, timeoutMs, signal) {
    if (this.disposed || signal.aborted) return Promise.reject(new BridgeProtocolError('bridge-incompatible'));
    if (this.owner === null) {
      this.owner = operationId;
      return Promise.resolve(() => this.release(operationId));
    }
    return new Promise((resolve, reject) => {
      const waiter = { operationId, resolve, reject, timer: null, abort: null, signal };
      const remove = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        signal.removeEventListener('abort', waiter.abort);
      };
      waiter.abort = () => {
        remove();
        reject(new BridgeProtocolError('bridge-incompatible'));
      };
      waiter.timer = setTimeout(() => {
        remove();
        reject(new BridgeProtocolError('bridge-incompatible'));
      }, timeoutMs);
      signal.addEventListener('abort', waiter.abort, { once: true });
      this.waiters.push(waiter);
    });
  }

  release(operationId) {
    if (this.owner !== operationId) return;
    this.owner = null;
    while (this.waiters.length > 0 && !this.disposed) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener?.('abort', waiter.abort);
      if (waiter.abort === null) continue;
      this.owner = waiter.operationId;
      waiter.resolve(() => this.release(waiter.operationId));
      return;
    }
  }

  dispose() {
    this.disposed = true;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.signal.removeEventListener('abort', waiter.abort);
      waiter.reject(new BridgeProtocolError('bridge-incompatible'));
    }
    this.owner = null;
  }

  snapshot() {
    return { owner: this.owner, waiters: this.waiters.length, disposed: this.disposed };
  }
}

function raceWithTimeout(promise, timeoutMs, controller, code) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(
      reject,
      new BridgeProtocolError('bridge-incompatible', { fatalCanvas: true }),
    );
    const timer = setTimeout(() => {
      finish(reject, new BridgeProtocolError(code, { fatalCanvas: true }));
      controller.abort();
    }, timeoutMs);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function validateReceipt(receipt, operationId, limits) {
  assertExactKeys(receipt, ['promptId', 'acknowledgedAt'], 'submission-unknown');
  const promptId = assertBoundedId(receipt.promptId, limits);
  if (!Number.isFinite(receipt.acknowledgedAt) || receipt.acknowledgedAt < 0) {
    fail('submission-unknown');
  }
  return { operationId, promptId, acknowledgedAt: receipt.acknowledgedAt };
}

/** 创建固定、bounded、page-load scoped Bridge runtime。 */
export function createBridgeRuntime({ identity, compatibility, config, adapter, expectedSource }) {
  assertCompatibilityShape(compatibility);
  assertConfigShape(config);
  assertIdentityShape(identity, config.limits);
  if (!adapter || (typeof expectedSource !== 'object' && typeof expectedSource !== 'function')) {
    fail('bridge-incompatible');
  }

  const { limits, capabilities } = config;
  const lease = new CanvasLease();
  const operations = new Map();
  const controllers = new Map();
  let handshaken = false;
  let disposed = false;

  async function disposeInternal() {
    if (disposed) return;
    disposed = true;
    for (const controller of controllers.values()) controller.abort();
    lease.dispose();
    operations.clear();
    await adapter.dispose();
  }

  async function executeSubmit(payload) {
    const controller = new AbortController();
    controllers.set(payload.operationId, controller);
    let release = null;
    let opened = null;
    let restore = null;
    let queueStarted = false;
    let result;
    let thrown;
    let poisonRuntime = false;
    try {
      release = await lease.acquire(
        payload.operationId,
        payload.configureTimeoutMs,
        controller.signal,
      );
      opened = await raceWithTimeout(
        adapter.openWorkflow(payload.remotePath, {
          operationId: payload.operationId,
          signal: controller.signal,
        }),
        payload.configureTimeoutMs,
        controller,
        'invalid-workflow',
      );
      await raceWithTimeout(
        adapter.waitForConfigure(opened, {
          operationId: payload.operationId,
          signal: controller.signal,
        }),
        payload.configureTimeoutMs,
        controller,
        'invalid-workflow',
      );
      const contract = await adapter.readWorkflowContract(opened);
      const validation = await adapter.validateCanonicalContract(contract);
      if (!validation || validation.ok !== true) fail('invalid-contract');
      const plan = validateContractDerivedMutations(validation.value, payload.mutations, limits);
      restore = await adapter.applyMutations(opened, plan, {
        operationId: payload.operationId,
        signal: controller.signal,
      });
      if (typeof restore !== 'function') fail('bridge-incompatible');
      queueStarted = true;
      const receipt = await adapter.queueNativeOnce({
        operationId: payload.operationId,
        receiptTimeoutMs: payload.receiptTimeoutMs,
        signal: controller.signal,
      });
      result = validateReceipt(receipt, payload.operationId, limits);
    } catch (error) {
      poisonRuntime = error instanceof BridgeProtocolError && error.fatalCanvas === true;
      thrown = error instanceof BridgeProtocolError
        ? error
        : new BridgeProtocolError(queueStarted ? 'submission-unknown' : 'bridge-incompatible');
    } finally {
      controller.abort();
      try {
        if (typeof restore === 'function') await restore();
        if (opened !== null) await adapter.resetOperation(payload.operationId, opened);
      } catch {
        thrown = new BridgeProtocolError(queueStarted ? 'submission-unknown' : 'bridge-incompatible');
      } finally {
        if (release !== null) release();
        controllers.delete(payload.operationId);
        if (poisonRuntime) await disposeInternal();
      }
    }
    if (thrown) throw thrown;
    return result;
  }

  async function handleCommand(command, payload) {
    if (disposed) fail('bridge-incompatible');
    if (command === 'handshake') {
      assertHandshakePayload(payload, compatibility);
      const versions = await adapter.getVersions();
      assertExactKeys(versions, ['frontendVersion', 'coreVersion'], 'bridge-incompatible');
      if (
        versions.frontendVersion !== compatibility.frontendVersion ||
        versions.coreVersion !== compatibility.coreVersion
      ) {
        fail('bridge-incompatible');
      }
      handshaken = true;
      return { identity: { ...identity }, ...compatibility, capabilities, limits };
    }
    if (!handshaken) fail('bridge-incompatible');

    if (command === 'list-workflows') {
      assertExactKeys(payload, []);
      const discovered = await adapter.discoverWorkflows();
      if (!Array.isArray(discovered)) fail('bridge-incompatible');
      if (discovered.length > limits.maxWorkflowListEntries) fail('limit-exceeded');
      const workflows = [];
      for (const item of discovered) {
        assertExactKeys(item, ['remotePath', 'contract']);
        const remotePath = assertCanonicalWorkflowPath(item.remotePath, limits);
        const validation = await adapter.validateCanonicalContract(item.contract);
        if (!validation || validation.ok !== true) fail('invalid-contract');
        workflows.push({ remotePath, contractSummary: sanitizeContractSummary(validation.value) });
      }
      return { workflows };
    }

    if (command === 'submit-workflow') {
      const validated = validateMutationPayload(payload, limits);
      const fingerprint = JSON.stringify(validated);
      const existing = operations.get(validated.operationId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail('invalid-request');
        return existing.promise;
      }
      if (operations.size >= limits.maxWorkflowListEntries) fail('limit-exceeded');
      const promise = executeSubmit(validated);
      operations.set(validated.operationId, { fingerprint, promise });
      return promise;
    }

    if (command === 'reset') {
      assertExactKeys(payload, ['operationId']);
      const operationId = assertBoundedId(payload.operationId, limits);
      const controller = controllers.get(operationId);
      if (controller) controller.abort();
      return { operationId, reset: controller !== undefined };
    }

    if (command === 'dispose') {
      assertExactKeys(payload, []);
      await disposeInternal();
      return { disposed: true };
    }
    fail('unsupported-command');
  }

  async function handleMessage(event) {
    if (event.source !== expectedSource || event.origin !== identity.origin) return undefined;
    const requestId = isPlainObject(event.data) && typeof event.data.requestId === 'string'
      ? event.data.requestId
      : '';
    try {
      if (serializedBytes(event.data) > limits.maxMessageBytes) fail('limit-exceeded');
      assertExactKeys(event.data, ['requestId', 'identity', 'command', 'payload']);
      assertBoundedId(event.data.requestId, limits);
      assertIdentityShape(event.data.identity, limits);
      if (!sameIdentity(event.data.identity, identity)) fail('identity-mismatch');
      if (typeof event.data.command !== 'string' || !COMMANDS.has(event.data.command)) {
        fail('unsupported-command');
      }
      if (!isPlainObject(event.data.payload)) fail('invalid-request');
      const payload = await handleCommand(event.data.command, event.data.payload);
      const response = success(event.data.requestId, payload);
      if (serializedBytes(response) > limits.maxMessageBytes) {
        return failure(event.data.requestId, 'limit-exceeded');
      }
      return response;
    } catch (error) {
      if (
        requestId.length === 0 ||
        CONTROL_CHARACTERS.test(requestId) ||
        Array.from(requestId).length > limits.maxIdChars
      ) {
        return undefined;
      }
      return failure(requestId, sanitizeError(error));
    }
  }

  return {
    dispose: disposeInternal,
    handleMessage,
    inspect: () => ({
      handshaken,
      disposed,
      operations: operations.size,
      lease: lease.snapshot(),
    }),
  };
}

/** 将 runtime 绑定到单一 window/source，并只向已验证 origin 回包。 */
export function attachBridgeWindow({ runtime, windowObject, reply }) {
  const sendResponse = reply ?? ((event, response) => {
    event.source.postMessage(response, event.origin);
  });
  let attached = true;
  const detach = () => {
    if (!attached) return;
    attached = false;
    windowObject.removeEventListener('message', listener);
  };
  const listener = async (event) => {
    const response = await runtime.handleMessage(event);
    if (response === undefined) return;
    try {
      sendResponse(event, response);
    } finally {
      if (
        event.data?.command === 'dispose' &&
        response.ok === true &&
        response.payload?.disposed === true
      ) {
        detach();
      }
    }
  };
  windowObject.addEventListener('message', listener);
  return detach;
}
