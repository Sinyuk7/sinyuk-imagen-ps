export const BRIDGE_CHANNEL = 'imagen-comfyui-frontend-bridge';
export const BRIDGE_PROTOCOL_VERSION = '1.0';
export const BRIDGE_VERSION = '1.0.0';
export const FRONTEND_API_TARGET_VERSION = '1.45.20';
export const COMFY_CORE_TARGET_VERSION = '0.27.1';
export const BRIDGE_SOURCE_ID = 'imagen-comfyui-page';
export const MAX_MESSAGE_BYTES = 2_000_000;
export const MAX_GRAPH_BYTES = 1_750_000;
export const MAX_EXTRA_DATA_BYTES = 65_536;
export const MAX_EXTRA_DATA_DEPTH = 16;
export const MAX_WORKFLOW_PATH_BYTES = 512;
export const MAX_WORKFLOW_LIST_ITEMS = 1_000;

export const BRIDGE_COMMANDS = Object.freeze([
  'handshake',
  'list-workflows',
  'prepare-workflow',
  'reset',
  'dispose',
]);

export const REQUIRED_COMPILE_ONLY_CAPABILITIES = Object.freeze([
  'workflow-list',
  'workflow-open',
  'runtime-readiness',
  'widget-mutation',
  'native-prequeue',
  'compile-api-graph',
  'reset',
  'dispose',
]);

const COMMAND_SET = new Set(BRIDGE_COMMANDS);
const MAX_WIDGET_MUTATIONS = 16;
const NATIVE_PREPARATION_SEQUENCE = Object.freeze([
  'beforeQueued',
  'promoted-controls',
  'graphToPrompt',
]);
const encoder = new TextEncoder();

export class BridgeCommandError extends Error {
  constructor(code) {
    super(`Imagen bridge command failed: ${code}.`);
    this.name = 'BridgeCommandError';
    this.code = code;
  }
}

export function jsonByteLength(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : encoder.encode(serialized).byteLength;
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLoadId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}

export function parseBridgeRequest(data) {
  const size = jsonByteLength(data);
  if (size === undefined) return { ok: false, code: 'invalid-message' };
  if (size > MAX_MESSAGE_BYTES) return { ok: false, code: 'oversized-message' };
  if (!isRecord(data)
    || data.channel !== BRIDGE_CHANNEL
    || data.protocolVersion !== BRIDGE_PROTOCOL_VERSION
    || !validLoadId(data.loadId)
    || data.type !== 'bridge.request'
    || !isRecord(data.payload)) {
    return { ok: false, code: 'invalid-message' };
  }
  const request = data.payload;
  if (!validRequestId(request.requestId)
    || !isRecord(request.identity)
    || typeof request.identity.origin !== 'string'
    || request.identity.origin.length === 0
    || request.identity.origin === 'null'
    || request.identity.sourceId !== BRIDGE_SOURCE_ID
    || request.identity.loadId !== data.loadId
    || typeof request.command !== 'string'
    || (Object.prototype.hasOwnProperty.call(request, 'payload') && !isRecord(request.payload))) {
    return { ok: false, code: 'invalid-message' };
  }
  if (!COMMAND_SET.has(request.command)) return { ok: false, code: 'unsupported-command' };
  return {
    ok: true,
    request: {
      requestId: request.requestId,
      identity: {
        origin: request.identity.origin,
        sourceId: request.identity.sourceId,
        loadId: request.identity.loadId,
      },
      command: request.command,
      ...(Object.prototype.hasOwnProperty.call(request, 'payload') ? { payload: request.payload } : {}),
    },
  };
}

export function normalizeWorkflowPath(value) {
  if (typeof value !== 'string' || value.length === 0 || encoder.encode(value).byteLength > MAX_WORKFLOW_PATH_BYTES) {
    throw new BridgeCommandError('invalid-workflow-path');
  }
  if (/[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('/') || value.endsWith('/')) {
    throw new BridgeCommandError('invalid-workflow-path');
  }
  const segments = value.split('/');
  if (segments[0] === 'workflows'
    || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    || !segments.at(-1).toLowerCase().endsWith('.json')) {
    throw new BridgeCommandError('invalid-workflow-path');
  }
  return segments.join('/');
}

export function validateCanonicalGraph(value) {
  if (!isRecord(value)) throw new BridgeCommandError('invalid-canonical-graph');
  const size = jsonByteLength(value);
  if (size === undefined || size > MAX_GRAPH_BYTES) throw new BridgeCommandError('oversized-canonical-graph');
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 4_096) throw new BridgeCommandError('invalid-canonical-graph');
  for (const [nodeId, node] of entries) {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(nodeId)
      || !isRecord(node)
      || typeof node.class_type !== 'string'
      || node.class_type.length === 0
      || node.class_type.length > 256
      || !isRecord(node.inputs)) {
      throw new BridgeCommandError('invalid-canonical-graph');
    }
  }
  return value;
}

export function validateCanonicalExtraData(value) {
  if (value === undefined) return undefined;
  const seen = new WeakSet();
  const validate = (candidate, depth) => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return true;
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (depth >= MAX_EXTRA_DATA_DEPTH || typeof candidate !== 'object' || candidate === null || seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.every((item) => validate(item, depth + 1));
    if (!isRecord(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) return false;
    return Object.entries(candidate).every(([key, item]) => key.length <= 256 && validate(item, depth + 1));
  };
  if (!isRecord(value) || !validate(value, 0)) throw new BridgeCommandError('invalid-extra-data');
  const size = jsonByteLength(value);
  if (size === undefined || size > MAX_EXTRA_DATA_BYTES) throw new BridgeCommandError('oversized-extra-data');
  return JSON.parse(JSON.stringify(value));
}

function responseEnvelope(request, body) {
  return {
    channel: BRIDGE_CHANNEL,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    loadId: request.identity.loadId,
    type: 'bridge.response',
    payload: {
      requestId: request.requestId,
      identity: request.identity,
      ...body,
    },
  };
}

function boundedResponse(request, body) {
  const response = responseEnvelope(request, body);
  const size = jsonByteLength(response);
  if (size !== undefined && size <= MAX_MESSAGE_BYTES) return response;
  return responseEnvelope(request, {
    ok: false,
    errorCode: 'compile-failed',
  });
}

function propertyCanBePatched(target, key) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return false;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) return Object.isExtensible(target);
  return descriptor.configurable === true || ('writable' in descriptor && descriptor.writable === true);
}

function installMethodPatch(target, key, replacement) {
  if (!propertyCanBePatched(target, key)) throw new BridgeCommandError('native-prepare-unavailable');
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, key);
  const original = target[key];
  try {
    Object.defineProperty(target, key, {
      configurable: ownDescriptor?.configurable ?? true,
      enumerable: ownDescriptor?.enumerable ?? false,
      writable: ownDescriptor && 'writable' in ownDescriptor ? ownDescriptor.writable : true,
      value: replacement,
    });
  } catch {
    throw new BridgeCommandError('native-prepare-unavailable');
  }
  if (target[key] !== replacement) throw new BridgeCommandError('native-prepare-unavailable');
  return () => {
    if (ownDescriptor) Object.defineProperty(target, key, ownDescriptor);
    else delete target[key];
    if (target[key] !== original) throw new BridgeCommandError('native-prepare-restore-failed');
  };
}

export function nativePrepareCapability(app, api) {
  const queueUi = app?.ui?.queue;
  return typeof app?.queuePrompt === 'function'
    && typeof api?.queuePrompt === 'function'
    && typeof queueUi?.update === 'function'
    && propertyCanBePatched(api, 'queuePrompt')
    && propertyCanBePatched(queueUi, 'update');
}

export async function prepareWithNativeQueueLifecycle(app, api) {
  if (!nativePrepareCapability(app, api)) throw new BridgeCommandError('native-prepare-unavailable');
  if (app.processingQueue === true || (Array.isArray(app.queueItems) && app.queueItems.length > 0)) {
    throw new BridgeCommandError('frontend-busy');
  }
  const queueUi = app.ui.queue;
  let captured;
  let captureCount = 0;
  let restoreQueuePrompt;
  let restoreQueueUpdate;
  try {
    restoreQueuePrompt = installMethodPatch(api, 'queuePrompt', async (_number, promptData) => {
      captureCount += 1;
      if (captureCount !== 1 || !isRecord(promptData)) throw new BridgeCommandError('native-prepare-invalid-capture');
      captured = {
        graph: promptData.output,
        ...(Object.prototype.hasOwnProperty.call(promptData, 'extra_data')
          ? { extraData: promptData.extra_data }
          : {}),
      };
      return { prompt_id: undefined, node_errors: {} };
    });
    restoreQueueUpdate = installMethodPatch(queueUi, 'update', async () => undefined);
    await app.queuePrompt(0, 1);
  } finally {
    let restoreError;
    try {
      restoreQueueUpdate?.();
    } catch (error) {
      restoreError = error;
    }
    try {
      restoreQueuePrompt?.();
    } catch (error) {
      restoreError ??= error;
    }
    if (restoreError) throw restoreError;
  }
  if (captureCount !== 1) throw new BridgeCommandError('native-prepare-invalid-capture');
  if (!isRecord(captured)) throw new BridgeCommandError('native-prepare-invalid-capture');
  return {
    graph: validateCanonicalGraph(captured.graph),
    ...(captured.extraData === undefined ? {} : { extraData: validateCanonicalExtraData(captured.extraData) }),
  };
}

function replyTargetForEvent(windowObject, event) {
  const uxpHost = windowObject.uxpHost;
  if (uxpHost && event.source === uxpHost && typeof uxpHost.postMessage === 'function') {
    return {
      kind: 'uxp',
      send: (message) => uxpHost.postMessage(message),
    };
  }
  if (windowObject.parent && windowObject.parent !== windowObject
    && event.source === windowObject.parent
    && typeof windowObject.parent.postMessage === 'function') {
    return {
      kind: 'parent',
      send: (message) => windowObject.parent.postMessage(message, event.origin),
    };
  }
  return undefined;
}

function boundedWorkflowList(entries) {
  if (!Array.isArray(entries)) throw new BridgeCommandError('workflow-list-unavailable');
  const workflows = [];
  for (const entry of entries) {
    if (workflows.length >= MAX_WORKFLOW_LIST_ITEMS) break;
    if (!isRecord(entry)) continue;
    try {
      if (typeof entry.path !== 'string') continue;
      const candidate = entry.path.startsWith('workflows/')
        ? entry.path.slice('workflows/'.length)
        : entry.path;
      const remotePath = normalizeWorkflowPath(candidate);
      const size = Number(entry.size);
      const modified = Number(entry.modified);
      if (!Number.isFinite(size) || size < 0 || !Number.isFinite(modified) || modified < 0) continue;
      workflows.push({ remotePath, size, modified });
    } catch {
      // 列表中无效 path 不得污染可选 identity。
    }
  }
  workflows.sort((a, b) => a.remotePath.localeCompare(b.remotePath));
  return workflows;
}

function parseWidgetMutations(widgetIntent) {
  if (widgetIntent === undefined) return [];
  if (!isRecord(widgetIntent)
    || Object.keys(widgetIntent).length !== 1
    || !Array.isArray(widgetIntent.mutations)
    || widgetIntent.mutations.length > MAX_WIDGET_MUTATIONS) {
    throw new BridgeCommandError('widget-intent-unavailable');
  }
  const locators = new Set();
  return widgetIntent.mutations.map((mutation) => {
    const scalar = typeof mutation?.value === 'string'
      || typeof mutation?.value === 'boolean'
      || (typeof mutation?.value === 'number' && Number.isFinite(mutation.value));
    if (!isRecord(mutation)
      || Object.keys(mutation).length !== 3
      || typeof mutation.nodeId !== 'string'
      || !/^[A-Za-z0-9_.:-]{1,128}$/.test(mutation.nodeId)
      || typeof mutation.widgetName !== 'string'
      || mutation.widgetName.length === 0
      || mutation.widgetName.length > 256
      || !scalar) {
      throw new BridgeCommandError('widget-intent-unavailable');
    }
    const locator = `${mutation.nodeId}\u0000${mutation.widgetName}`;
    if (locators.has(locator)) throw new BridgeCommandError('widget-intent-unavailable');
    locators.add(locator);
    return {
      nodeId: mutation.nodeId,
      widgetName: mutation.widgetName,
      value: mutation.value,
    };
  });
}

function applyWidgetMutations(app, mutations) {
  if (mutations.length === 0) return;
  if (typeof app?.graph?.getNodeById !== 'function') {
    throw new BridgeCommandError('widget-intent-unavailable');
  }
  for (const mutation of mutations) {
    const node = app.graph.getNodeById(mutation.nodeId);
    if (!node || String(node.id) !== mutation.nodeId || !Array.isArray(node.widgets)) {
      throw new BridgeCommandError('widget-intent-unavailable');
    }
    const widget = node.widgets.find((candidate) => candidate?.name === mutation.widgetName);
    if (!widget) throw new BridgeCommandError('widget-intent-unavailable');
    try {
      widget.value = mutation.value;
    } catch {
      throw new BridgeCommandError('widget-intent-unavailable');
    }
  }
}

async function readWorkflow(api, remotePath) {
  let response;
  try {
    response = await api.getUserData(`workflows/${remotePath}`);
  } catch {
    throw new BridgeCommandError('workflow-unavailable');
  }
  if (!response || response.ok !== true) throw new BridgeCommandError('workflow-unavailable');
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_MESSAGE_BYTES) throw new BridgeCommandError('oversized-workflow');
  let text;
  try {
    text = await response.text();
  } catch {
    throw new BridgeCommandError('workflow-load-failed');
  }
  if (encoder.encode(text).byteLength > MAX_MESSAGE_BYTES) throw new BridgeCommandError('oversized-workflow');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BridgeCommandError('invalid-workflow');
  }
  if (!isRecord(parsed)) throw new BridgeCommandError('invalid-workflow');
  return parsed;
}

async function versionFacts(api, windowObject) {
  try {
    const stats = await api.getSystemStats();
    const statsFrontendVersion = typeof stats?.system?.comfyui_frontend_version === 'string'
      && stats.system.comfyui_frontend_version.length > 0
      ? stats.system.comfyui_frontend_version
      : undefined;
    const runtimeFrontendVersion = typeof windowObject?.__COMFYUI_FRONTEND_VERSION__ === 'string'
      && windowObject.__COMFYUI_FRONTEND_VERSION__.length > 0
      ? windowObject.__COMFYUI_FRONTEND_VERSION__
      : undefined;
    const reportedFrontendVersion = statsFrontendVersion ?? runtimeFrontendVersion;
    const reportedCoreVersion = stats?.system?.comfyui_version;
    return {
      frontendVersion: reportedFrontendVersion ?? 'unavailable',
      comfyCoreVersion: reportedCoreVersion ?? 'unavailable',
      frontendVersionEvidence: statsFrontendVersion
        ? 'system-stats'
        : runtimeFrontendVersion
          ? 'runtime-global'
          : 'unavailable',
      versionCompatible: reportedFrontendVersion === FRONTEND_API_TARGET_VERSION
        && reportedCoreVersion === COMFY_CORE_TARGET_VERSION,
    };
  } catch {
    const runtimeFrontendVersion = typeof windowObject?.__COMFYUI_FRONTEND_VERSION__ === 'string'
      && windowObject.__COMFYUI_FRONTEND_VERSION__.length > 0
      ? windowObject.__COMFYUI_FRONTEND_VERSION__
      : undefined;
    return {
      frontendVersion: runtimeFrontendVersion ?? 'unavailable',
      comfyCoreVersion: 'unavailable',
      frontendVersionEvidence: runtimeFrontendVersion ? 'runtime-global' : 'unavailable',
      versionCompatible: false,
    };
  }
}

function advertisedCapabilities(app, api, versionCompatible) {
  const capabilities = [];
  if (typeof api?.listUserDataFullInfo === 'function') capabilities.push('workflow-list');
  if (typeof api?.getUserData === 'function' && typeof app?.loadGraphData === 'function') capabilities.push('workflow-open');
  if (versionCompatible && nativePrepareCapability(app, api)) {
    capabilities.push('runtime-readiness', 'widget-mutation', 'native-prequeue', 'compile-api-graph');
  }
  if (typeof app?.clean === 'function') capabilities.push('reset');
  capabilities.push('dispose');
  return capabilities;
}

function remoteErrorCode(command, error) {
  const code = error instanceof BridgeCommandError ? error.code : undefined;
  if (command === 'handshake') return 'bridge-missing';
  if (command === 'reset') return 'reset-failed';
  if (code === 'invalid-workflow-path' || code === 'workflow-unavailable') return 'workflow-missing';
  if (code === 'native-prepare-unavailable'
    || code === 'frontend-busy'
    || code === 'native-prepare-restore-failed'
    || code === 'unsupported-frontend-version'
    || code === 'invalid-prepare-contract'
    || code === 'widget-intent-unavailable') return 'runtime-not-ready';
  if (code === 'invalid-workflow'
    || code === 'oversized-workflow'
    || code === 'workflow-load-failed') return 'workflow-load-failed';
  if (code === 'hook-failed' || code === 'native-prepare-invalid-capture') return 'hook-failed';
  if (code === 'invalid-canonical-graph'
    || code === 'oversized-canonical-graph'
    || code === 'invalid-extra-data'
    || code === 'oversized-extra-data') return 'api-graph-invalid';
  return command === 'prepare-workflow' ? 'hook-failed' : 'bridge-missing';
}

/** 创建无任意脚本入口的固定命令 bridge runtime。 */
export function createImagenBridgeRuntime({ app, api, windowObject }) {
  let started = false;
  let disposed = false;
  let pin;
  let commandLease = Promise.resolve();
  const requestIds = new Set();
  let currentWorkflowPath;
  let versionCompatible = false;

  const stop = () => {
    if (!started) return;
    started = false;
    disposed = true;
    windowObject.removeEventListener('message', onMessage);
    requestIds.clear();
  };

  const execute = async (request) => {
    switch (request.command) {
      case 'handshake': {
        const versions = await versionFacts(api, windowObject);
        versionCompatible = versions.versionCompatible;
        return {
          bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
          bridgeVersion: BRIDGE_VERSION,
          frontendVersion: versions.frontendVersion,
          comfyCoreVersion: versions.comfyCoreVersion,
          messageSchemaVersion: 1,
          capabilities: advertisedCapabilities(app, api, versions.versionCompatible),
          limits: {
            maxMessageBytes: MAX_MESSAGE_BYTES,
            maxWorkflowPathBytes: MAX_WORKFLOW_PATH_BYTES,
            maxGraphBytes: MAX_GRAPH_BYTES,
            maxExtraDataBytes: MAX_EXTRA_DATA_BYTES,
            maxExtraDataDepth: MAX_EXTRA_DATA_DEPTH,
          },
          diagnostics: {
            frontendVersionEvidence: versions.frontendVersionEvidence,
            frontendPromptCount: 0,
          },
        };
      }
      case 'list-workflows': {
        const workflows = boundedWorkflowList(await api.listUserDataFullInfo('workflows'));
        return {
          paths: workflows.map((workflow) => workflow.remotePath),
          diagnostics: { entries: workflows },
        };
      }
      case 'prepare-workflow': {
        if (!versionCompatible) throw new BridgeCommandError('unsupported-frontend-version');
        if (!nativePrepareCapability(app, api)) throw new BridgeCommandError('native-prepare-unavailable');
        if (request.payload?.compileOnly !== true
          || !Array.isArray(request.payload?.nativePreparationSequence)
          || request.payload.nativePreparationSequence.length !== NATIVE_PREPARATION_SEQUENCE.length
          || request.payload.nativePreparationSequence.some(
            (step, index) => step !== NATIVE_PREPARATION_SEQUENCE[index],
          )) {
          throw new BridgeCommandError('invalid-prepare-contract');
        }
        const widgetMutations = parseWidgetMutations(request.payload.widgetIntent);
        const remotePath = normalizeWorkflowPath(request.payload?.remotePath);
        const workflow = await readWorkflow(api, remotePath);
        const userDataPath = `workflows/${remotePath}`;
        try {
          try {
            await app.loadGraphData(workflow, true, true, userDataPath, {
              deferWarnings: true,
              skipAssetScans: true,
              silentAssetErrors: true,
            });
          } catch {
            throw new BridgeCommandError('workflow-load-failed');
          }
          applyWidgetMutations(app, widgetMutations);
          currentWorkflowPath = remotePath;
          let prepared;
          try {
            prepared = await prepareWithNativeQueueLifecycle(app, api);
          } catch (error) {
            if (error instanceof BridgeCommandError) throw error;
            throw new BridgeCommandError('hook-failed');
          }
          return {
            remotePath,
            graph: prepared.graph,
            ...(prepared.extraData === undefined ? {} : { extraData: prepared.extraData }),
            frontendPromptCount: 0,
          };
        } catch (error) {
          try {
            app.clean?.();
          } finally {
            currentWorkflowPath = undefined;
          }
          throw error;
        }
      }
      case 'reset':
        if (typeof app?.clean !== 'function') throw new BridgeCommandError('reset-unavailable');
        app.clean();
        currentWorkflowPath = undefined;
        return { reset: true };
      case 'dispose':
        if (typeof app?.clean === 'function') app.clean();
        currentWorkflowPath = undefined;
        return { disposed: true };
      default:
        throw new BridgeCommandError('unsupported-command');
    }
  };

  const processPinnedRequest = async (request, reply) => {
    if (requestIds.has(request.requestId)) {
      reply.send(boundedResponse(request, {
        ok: false,
        errorCode: 'runtime-not-ready',
      }));
      return;
    }
    requestIds.add(request.requestId);
    if (requestIds.size > 128) requestIds.delete(requestIds.values().next().value);
    try {
      const result = await execute(request);
      reply.send(boundedResponse(request, { ok: true, payload: result }));
      if (request.command === 'dispose') stop();
    } catch (error) {
      reply.send(boundedResponse(request, {
        ok: false,
        errorCode: remoteErrorCode(request.command, error),
      }));
    }
  };

  function onMessage(event) {
    if (disposed || typeof event.origin !== 'string' || event.origin.length === 0 || event.origin === 'null') return;
    const reply = replyTargetForEvent(windowObject, event);
    if (!reply) return;
    const parsed = parseBridgeRequest(event.data);
    if (!parsed.ok) return;
    const request = parsed.request;
    if (request.identity.origin !== windowObject.location?.origin) return;
    if (!pin) {
      if (request.command !== 'handshake') return;
      pin = {
        origin: event.origin,
        source: event.source,
        identity: request.identity,
        replyKind: reply.kind,
      };
    } else if (event.origin !== pin.origin
      || event.source !== pin.source
      || request.identity.origin !== pin.identity.origin
      || request.identity.sourceId !== pin.identity.sourceId
      || request.identity.loadId !== pin.identity.loadId
      || reply.kind !== pin.replyKind) {
      return;
    }
    commandLease = commandLease.then(() => processPinnedRequest(request, reply));
  }

  return {
    start() {
      if (started || disposed) return;
      started = true;
      windowObject.addEventListener('message', onMessage);
    },
    dispose: stop,
    whenIdle: () => commandLease,
    getCurrentWorkflowPath: () => currentWorkflowPath,
  };
}
