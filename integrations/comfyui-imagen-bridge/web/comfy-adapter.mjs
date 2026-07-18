import {
  assertCanonicalWorkflowPath,
  BridgeProtocolError,
} from './bridge-runtime.mjs';
import {
  validateCanonicalWorkflowContract,
  validateWorkflowContractDocuments,
} from './generated/runtime-validator.mjs';
import { observeNativeQueueReceipt } from './queue-observer.mjs';

const BINDING_CLASS_ID = 'ImagenWorkflowBindingContract';
const TYPE_CLASS_ID = 'ImagenWorkflowTypeContract';
const CONTRACT_NODE_BYTES = 65_536;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new BridgeProtocolError('invalid-contract');
  }
}

function decodeContract(value) {
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > CONTRACT_NODE_BYTES) {
      throw new BridgeProtocolError('invalid-contract');
    }
    try {
      value = JSON.parse(value);
    } catch {
      throw new BridgeProtocolError('invalid-contract');
    }
  }
  if (!isPlainObject(value) || jsonBytes(value) > CONTRACT_NODE_BYTES) {
    throw new BridgeProtocolError('invalid-contract');
  }
  return value;
}

function exactClassId(node) {
  const candidates = [node?.comfyClass, node?.type, node?.class_type].filter(
    (value) => typeof value === 'string',
  );
  const known = candidates.filter((value) => value === BINDING_CLASS_ID || value === TYPE_CLASS_ID);
  if (known.length === 0) return null;
  if (new Set(known).size !== 1) throw new BridgeProtocolError('invalid-contract');
  return known[0];
}

function extractCanvasContract(node) {
  if (!Array.isArray(node.widgets)) throw new BridgeProtocolError('invalid-contract');
  const widgets = node.widgets.filter((widget) => widget?.name === 'contract');
  if (widgets.length !== 1) throw new BridgeProtocolError('invalid-contract');
  return decodeContract(widgets[0].value);
}

function extractStoredContract(node) {
  if (isPlainObject(node.inputs) && Object.prototype.hasOwnProperty.call(node.inputs, 'contract')) {
    return decodeContract(node.inputs.contract);
  }
  if (Array.isArray(node.widgets_values) && node.widgets_values.length === 1) {
    return decodeContract(node.widgets_values[0]);
  }
  throw new BridgeProtocolError('invalid-contract');
}

function contractFromNodes(nodes, extract, schema) {
  if (!Array.isArray(nodes)) throw new BridgeProtocolError('invalid-workflow');
  const bindingNodes = [];
  const typeNodes = [];
  for (const node of nodes) {
    const classId = exactClassId(node);
    if (classId === BINDING_CLASS_ID) bindingNodes.push(node);
    if (classId === TYPE_CLASS_ID) typeNodes.push(node);
  }
  if (bindingNodes.length !== 1 || typeNodes.length !== 1) {
    throw new BridgeProtocolError('invalid-contract');
  }
  const result = validateWorkflowContractDocuments(
    extract(bindingNodes[0]),
    extract(typeNodes[0]),
    schema,
  );
  if (!result || result.ok !== true) throw new BridgeProtocolError('invalid-contract');
  return result.value;
}

async function responseJson(value, maxBytes) {
  if (value && typeof value.text === 'function') {
    if (value.ok !== true) throw new BridgeProtocolError('invalid-workflow');
    const text = await value.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new BridgeProtocolError('limit-exceeded');
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new BridgeProtocolError('invalid-workflow');
    }
  }
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > maxBytes) {
      throw new BridgeProtocolError('limit-exceeded');
    }
    try {
      return JSON.parse(value);
    } catch {
      throw new BridgeProtocolError('invalid-workflow');
    }
  }
  if (jsonBytes(value) > maxBytes) throw new BridgeProtocolError('limit-exceeded');
  return value;
}

function normalizeListedPath(entry) {
  const candidate = typeof entry === 'string' ? entry : entry?.path;
  if (typeof candidate !== 'string') throw new BridgeProtocolError('invalid-workflow');
  return candidate.startsWith('workflows/') ? candidate.slice('workflows/'.length) : candidate;
}

function canvasNodes(app) {
  if (!app.graph || !Array.isArray(app.graph._nodes)) {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  return app.graph._nodes;
}

function assertWidgetCompatible(widget, entry) {
  const type = Array.isArray(widget.type) ? 'combo' : String(widget.type ?? '').toLowerCase();
  if (/^(number|int|float|boolean|toggle)$/u.test(type)) {
    throw new BridgeProtocolError('invalid-contract');
  }
  if (entry.dataType === 'text' && type.length > 0 && !/(string|text|customtext)/u.test(type)) {
    throw new BridgeProtocolError('invalid-contract');
  }
}

/** 创建 pinned ComfyUI frontend adapter；所有 contract 判断委托 generated validator。 */
export function createComfyAdapter({ app, api, schema, versions, limits }) {
  if (
    !app ||
    typeof app.loadGraphData !== 'function' ||
    !api ||
    typeof api.listUserDataFullInfo !== 'function' ||
    typeof api.getUserData !== 'function'
  ) {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  let currentToken = null;

  async function readWorkflow(remotePath) {
    assertCanonicalWorkflowPath(remotePath, limits);
    const response = await api.getUserData(`workflows/${remotePath}`);
    return responseJson(response, limits.maxMessageBytes);
  }

  return {
    async getVersions() {
      return {
        frontendVersion: versions.frontendVersion,
        coreVersion: versions.coreVersion,
      };
    },

    async discoverWorkflows() {
      const listedResult = await api.listUserDataFullInfo('workflows');
      const listed = Array.isArray(listedResult) ? listedResult : listedResult?.files;
      if (!Array.isArray(listed)) throw new BridgeProtocolError('invalid-workflow');
      if (listed.length > limits.maxWorkflowListEntries) {
        throw new BridgeProtocolError('limit-exceeded');
      }
      const workflows = [];
      for (const entry of listed) {
        if (entry?.isDirectory === true || entry?.type === 'directory') continue;
        const remotePath = normalizeListedPath(entry);
        assertCanonicalWorkflowPath(remotePath, limits);
        const workflow = await readWorkflow(remotePath);
        if (!Array.isArray(workflow?.nodes)) {
          throw new BridgeProtocolError('invalid-workflow');
        }
        const hasContractMarker = workflow.nodes.some((node) => exactClassId(node) !== null);
        if (!hasContractMarker) continue;
        const contract = contractFromNodes(workflow.nodes, extractStoredContract, schema);
        workflows.push({ remotePath, contract });
      }
      return workflows;
    },

    async openWorkflow(remotePath, { operationId, signal }) {
      if (signal.aborted) throw new BridgeProtocolError('bridge-incompatible');
      const workflow = await readWorkflow(remotePath);
      if (signal.aborted) throw new BridgeProtocolError('bridge-incompatible');
      await app.loadGraphData(workflow);
      if (signal.aborted) throw new BridgeProtocolError('bridge-incompatible');
      const token = { operationId, remotePath, graph: app.graph };
      currentToken = token;
      return token;
    },

    async waitForConfigure(token, { operationId, signal }) {
      if (
        signal.aborted ||
        currentToken !== token ||
        token.operationId !== operationId ||
        app.graph !== token.graph
      ) {
        throw new BridgeProtocolError('invalid-workflow');
      }
      canvasNodes(app);
    },

    async readWorkflowContract(token) {
      if (currentToken !== token || app.graph !== token.graph) {
        throw new BridgeProtocolError('invalid-workflow');
      }
      return contractFromNodes(canvasNodes(app), extractCanvasContract, schema);
    },

    async validateCanonicalContract(contract) {
      return validateCanonicalWorkflowContract(contract, schema);
    },

    async applyMutations(token, plan, { signal }) {
      if (signal.aborted || currentToken !== token || app.graph !== token.graph) {
        throw new BridgeProtocolError('invalid-workflow');
      }
      const changes = [];
      try {
        for (const mutation of plan) {
          if (signal.aborted || currentToken !== token || app.graph !== token.graph) {
            throw new BridgeProtocolError('invalid-workflow');
          }
          const nodes = canvasNodes(app).filter(
            (node) => String(node.id) === mutation.locator.nodeId,
          );
          if (nodes.length !== 1 || !Array.isArray(nodes[0].widgets)) {
            throw new BridgeProtocolError('invalid-contract');
          }
          const widgets = nodes[0].widgets.filter(
            (widget) => widget?.name === mutation.locator.fieldName,
          );
          if (widgets.length !== 1) throw new BridgeProtocolError('invalid-contract');
          const widget = widgets[0];
          assertWidgetCompatible(widget, mutation.entry);
          changes.push({ widget, previous: widget.value });
          widget.value = mutation.value;
          if (widget.value !== mutation.value) throw new BridgeProtocolError('invalid-contract');
        }
      } catch (error) {
        for (const change of changes.reverse()) change.widget.value = change.previous;
        throw error;
      }
      app.graph.setDirtyCanvas?.(true, true);
      return async () => {
        for (const change of changes.reverse()) change.widget.value = change.previous;
        app.graph?.setDirtyCanvas?.(true, true);
      };
    },

    async queueNativeOnce({ receiptTimeoutMs, signal }) {
      return observeNativeQueueReceipt({
        app,
        api,
        receiptTimeoutMs,
        signal,
        maxIdChars: limits.maxIdChars,
      });
    },

    async resetOperation(operationId, token) {
      if (currentToken === token && token.operationId === operationId) currentToken = null;
    },

    async dispose() {
      currentToken = null;
    },
  };
}
