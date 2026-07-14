import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_VERSION,
  BRIDGE_SOURCE_ID,
  COMFY_CORE_TARGET_VERSION,
  FRONTEND_API_TARGET_VERSION,
  MAX_GRAPH_BYTES,
  MAX_EXTRA_DATA_BYTES,
  MAX_EXTRA_DATA_DEPTH,
  MAX_MESSAGE_BYTES,
  MAX_WORKFLOW_PATH_BYTES,
  REQUIRED_COMPILE_ONLY_CAPABILITIES,
  BridgeCommandError,
  createImagenBridgeRuntime,
  normalizeWorkflowPath,
  parseBridgeRequest,
  validateCanonicalExtraData,
  validateCanonicalGraph,
} from '../web/protocol.js';

function request(loadId, requestId, command, payload) {
  return {
    channel: BRIDGE_CHANNEL,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    loadId,
    type: 'bridge.request',
    payload: {
      requestId,
      identity: {
        origin: 'https://comfy.example.test',
        sourceId: BRIDGE_SOURCE_ID,
        loadId,
      },
      command,
      ...(payload === undefined ? {} : { payload }),
    },
  };
}

function preparePayload(remotePath, overrides = {}) {
  return {
    remotePath,
    compileOnly: true,
    nativePreparationSequence: ['beforeQueued', 'promoted-controls', 'graphToPrompt'],
    ...overrides,
  };
}

class FakeWindow {
  constructor() {
    this.listeners = new Set();
    this.location = { origin: 'https://comfy.example.test' };
    this.__COMFYUI_FRONTEND_VERSION__ = FRONTEND_API_TARGET_VERSION;
    this.parent = {
      messages: [],
      postMessage: (message, targetOrigin) => this.parent.messages.push({ message, targetOrigin }),
    };
    this.uxpHost = {
      messages: [],
      postMessage: (message) => this.uxpHost.messages.push(message),
    };
  }

  addEventListener(type, listener) {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'message') this.listeners.delete(listener);
  }

  emit({ origin = 'https://host.example.test', source = this.parent, data }) {
    for (const listener of this.listeners) listener({ origin, source, data });
  }
}

function createBaseApi(overrides = {}) {
  return {
    async getSystemStats() {
      return {
        system: {
          comfyui_frontend_version: FRONTEND_API_TARGET_VERSION,
          comfyui_version: COMFY_CORE_TARGET_VERSION,
        },
      };
    },
    async listUserDataFullInfo() {
      return [];
    },
    async getUserData() {
      throw new Error('unused');
    },
    async queuePrompt() {
      throw new Error('real queuePrompt must not be called');
    },
    ...overrides,
  };
}

function createBaseApp(api, overrides = {}) {
  return {
    ui: {
      queue: {
        async update() {},
      },
    },
    queueItems: [],
    processingQueue: false,
    async queuePrompt() {
      const graph = { '1': { class_type: 'TestNode', inputs: {} } };
      await api.queuePrompt(0, { output: graph, workflow: {} });
      await this.ui.queue.update();
      return true;
    },
    async loadGraphData() {},
    clean() {},
    ...overrides,
  };
}

async function handshake(runtime, windowObject, source = windowObject.parent, loadId = 'load-a') {
  windowObject.emit({
    source,
    data: request(loadId, 'request-handshake', 'handshake'),
  });
  await runtime.whenIdle();
}

test('normalizes bounded workflow identities and rejects traversal/control paths', () => {
  assert.equal(normalizeWorkflowPath('team/portrait.json'), 'team/portrait.json');
  for (const invalid of [
    '../workflows/a.json',
    'workflows/../a.json',
    'workflows/a.json',
    'workflows\\a.json',
    'workflows/a.txt',
    '/workflows/a.json',
    'workflows/a\u0000.json',
  ]) {
    assert.throws(() => normalizeWorkflowPath(invalid), BridgeCommandError);
  }
});

test('validates the fixed protocol and bounded canonical graph', () => {
  assert.deepEqual(parseBridgeRequest(request('load-a', 'frontend-bridge:1', 'reset')), {
    ok: true,
    request: {
      requestId: 'frontend-bridge:1',
      identity: {
        origin: 'https://comfy.example.test',
        sourceId: BRIDGE_SOURCE_ID,
        loadId: 'load-a',
      },
      command: 'reset',
    },
  });
  assert.deepEqual(parseBridgeRequest(request('load-a', 'request-a', 'eval')), {
    ok: false,
    code: 'unsupported-command',
  });
  const staleNestedLoad = request('load-a', 'request-a', 'reset');
  staleNestedLoad.payload.identity.loadId = 'load-b';
  assert.deepEqual(parseBridgeRequest(staleNestedLoad), { ok: false, code: 'invalid-message' });
  const foreignSource = request('load-a', 'request-a', 'reset');
  foreignSource.payload.identity.sourceId = 'foreign-page';
  assert.deepEqual(parseBridgeRequest(foreignSource), { ok: false, code: 'invalid-message' });
  const scalarPayload = request('load-a', 'request-a', 'reset', 'not-an-object');
  assert.deepEqual(parseBridgeRequest(scalarPayload), { ok: false, code: 'invalid-message' });
  const oversized = request('load-a', 'request-a', 'reset');
  oversized.payload.payload = { value: 'x'.repeat(MAX_MESSAGE_BYTES) };
  assert.equal(parseBridgeRequest(oversized).code, 'oversized-message');
  const graph = { '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } } };
  assert.equal(validateCanonicalGraph(graph), graph);
  assert.throws(
    () => validateCanonicalGraph({ '1': { class_type: 'Node', inputs: { text: 'x'.repeat(MAX_GRAPH_BYTES) } } }),
    (error) => error.code === 'oversized-canonical-graph',
  );
});

test('validates only bounded JSON extra_data without exposing it in errors', () => {
  assert.deepEqual(validateCanonicalExtraData({ partner: { credential: 'runtime-only' } }), {
    partner: { credential: 'runtime-only' },
  });
  assert.throws(() => validateCanonicalExtraData({ payload: 'x'.repeat(MAX_EXTRA_DATA_BYTES + 1) }), BridgeCommandError);
  assert.throws(() => validateCanonicalExtraData({ invalid: undefined }), BridgeCommandError);
  let nested = {};
  for (let index = 0; index < MAX_EXTRA_DATA_DEPTH + 1; index += 1) nested = { nested };
  assert.throws(() => validateCanonicalExtraData(nested), BridgeCommandError);
});

test('pins first parent handshake and rejects stale, foreign, duplicate, and arbitrary commands', async () => {
  const windowObject = new FakeWindow();
  const api = createBaseApi();
  const app = createBaseApp(api);
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();

  windowObject.emit({ data: request('load-a', 'before-handshake', 'list-workflows') });
  await runtime.whenIdle();
  assert.equal(windowObject.parent.messages.length, 0);

  await handshake(runtime, windowObject);
  assert.equal(windowObject.parent.messages.length, 1);
  assert.deepEqual(windowObject.parent.messages[0], {
    targetOrigin: 'https://host.example.test',
    message: {
      channel: BRIDGE_CHANNEL,
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      loadId: 'load-a',
      type: 'bridge.response',
      payload: {
        requestId: 'request-handshake',
        identity: {
          origin: 'https://comfy.example.test',
          sourceId: BRIDGE_SOURCE_ID,
          loadId: 'load-a',
        },
        ok: true,
        payload: {
          bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
          bridgeVersion: BRIDGE_VERSION,
          frontendVersion: FRONTEND_API_TARGET_VERSION,
          comfyCoreVersion: COMFY_CORE_TARGET_VERSION,
          messageSchemaVersion: 1,
          capabilities: REQUIRED_COMPILE_ONLY_CAPABILITIES,
          limits: {
            maxMessageBytes: MAX_MESSAGE_BYTES,
            maxWorkflowPathBytes: MAX_WORKFLOW_PATH_BYTES,
            maxGraphBytes: MAX_GRAPH_BYTES,
            maxExtraDataBytes: MAX_EXTRA_DATA_BYTES,
            maxExtraDataDepth: MAX_EXTRA_DATA_DEPTH,
          },
          diagnostics: {
            frontendVersionEvidence: 'system-stats',
            frontendPromptCount: 0,
          },
        },
      },
    },
  });

  windowObject.emit({ origin: 'https://foreign.example.test', data: request('load-a', 'foreign-origin', 'reset') });
  windowObject.emit({ source: {}, data: request('load-a', 'foreign-source', 'reset') });
  windowObject.emit({ data: request('stale-load', 'stale-load', 'reset') });
  await runtime.whenIdle();
  assert.equal(windowObject.parent.messages.length, 1);

  windowObject.emit({ data: request('load-a', 'arbitrary', 'eval') });
  windowObject.emit({ data: request('load-a', 'request-handshake', 'handshake') });
  await runtime.whenIdle();
  assert.equal(windowObject.parent.messages.length, 2);
  assert.equal(windowObject.parent.messages[1].message.payload.errorCode, 'runtime-not-ready');
});

test('reports and blocks a frontend version mismatch before workflow reads', async () => {
  let reads = 0;
  const api = createBaseApi({
    async getSystemStats() {
      return { system: { comfyui_frontend_version: '1.49.0', comfyui_version: COMFY_CORE_TARGET_VERSION } };
    },
    async getUserData() {
      reads += 1;
      throw new Error('must not read');
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  assert.equal(windowObject.parent.messages[0].message.payload.payload.frontendVersion, '1.49.0');
  assert.equal(windowObject.parent.messages[0].message.payload.payload.capabilities.includes('native-prequeue'), false);
  windowObject.emit({
    data: request('load-a', 'prepare-version-mismatch', 'prepare-workflow', preparePayload('a.json')),
  });
  await runtime.whenIdle();
  assert.equal(reads, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
});

test('uses the live frontend runtime global when system stats omits its version', async () => {
  const api = createBaseApi({
    async getSystemStats() {
      return { system: { comfyui_frontend_version: null, comfyui_version: COMFY_CORE_TARGET_VERSION } };
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  const handshakePayload = windowObject.parent.messages[0].message.payload.payload;
  assert.equal(handshakePayload.frontendVersion, FRONTEND_API_TARGET_VERSION);
  assert.equal(handshakePayload.diagnostics.frontendVersionEvidence, 'runtime-global');
  assert.equal(handshakePayload.capabilities.includes('native-prequeue'), true);
});

test('blocks an older core version before workflow reads', async () => {
  let reads = 0;
  const api = createBaseApi({
    async getSystemStats() {
      return { system: { comfyui_frontend_version: FRONTEND_API_TARGET_VERSION, comfyui_version: '0.27.0' } };
    },
    async getUserData() {
      reads += 1;
      throw new Error('must not read');
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  windowObject.emit({
    data: request('load-a', 'prepare-core-mismatch', 'prepare-workflow', preparePayload('a.json')),
  });
  await runtime.whenIdle();
  assert.equal(reads, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
});

test('fails closed when frontend version evidence is missing', async () => {
  const api = createBaseApi({
    async getSystemStats() {
      return { system: { comfyui_frontend_version: null, comfyui_version: COMFY_CORE_TARGET_VERSION } };
    },
  });
  const windowObject = new FakeWindow();
  delete windowObject.__COMFYUI_FRONTEND_VERSION__;
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  const handshakePayload = windowObject.parent.messages[0].message.payload.payload;
  assert.equal(handshakePayload.frontendVersion, 'unavailable');
  assert.equal(handshakePayload.diagnostics.frontendVersionEvidence, 'unavailable');
  assert.equal(handshakePayload.capabilities.includes('native-prequeue'), false);
});

test('fails closed when core version evidence is missing or system stats fail', async () => {
  for (const getSystemStats of [
    async () => ({ system: { comfyui_frontend_version: FRONTEND_API_TARGET_VERSION } }),
    async () => { throw new Error('system stats unavailable'); },
  ]) {
    let reads = 0;
    const api = createBaseApi({
      getSystemStats,
      async getUserData() {
        reads += 1;
        throw new Error('must not read');
      },
    });
    const windowObject = new FakeWindow();
    const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
    runtime.start();
    await handshake(runtime, windowObject);

    const handshakePayload = windowObject.parent.messages[0].message.payload.payload;
    assert.equal(handshakePayload.frontendVersion, FRONTEND_API_TARGET_VERSION);
    assert.equal(handshakePayload.comfyCoreVersion, 'unavailable');
    assert.equal(handshakePayload.capabilities.includes('native-prequeue'), false);

    windowObject.emit({
      data: request('load-a', 'prepare-without-core-version', 'prepare-workflow', preparePayload('a.json')),
    });
    await runtime.whenIdle();
    assert.equal(reads, 0);
    assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
  }
});

test('supports UXP host replies without sending to parent', async () => {
  const windowObject = new FakeWindow();
  const api = createBaseApi();
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();

  await handshake(runtime, windowObject, windowObject.uxpHost, 'uxp-load');

  assert.equal(windowObject.parent.messages.length, 0);
  assert.equal(windowObject.uxpHost.messages.length, 1);
  assert.equal(windowObject.uxpHost.messages[0].type, 'bridge.response');
  assert.equal(windowObject.uxpHost.messages[0].payload.payload.bridgeProtocolVersion, BRIDGE_PROTOCOL_VERSION);
});

test('lists only bounded workflow identities through the official user-data API', async () => {
  const calls = [];
  const windowObject = new FakeWindow();
  const api = createBaseApi({
    async listUserDataFullInfo(dir) {
      calls.push(dir);
      return [
        { path: 'z.json', size: 20, modified: 3 },
        { path: 'team/a.json', size: 10, modified: 2 },
        { path: 'workflows/legacy.json', size: 12, modified: 4 },
        { path: 'workflows/../secret.json', size: 1, modified: 1 },
        { path: '../other/not-a-workflow.json', size: 1, modified: 1 },
      ];
    },
  });
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);
  windowObject.emit({ data: request('load-a', 'list-a', 'list-workflows') });
  await runtime.whenIdle();

  assert.deepEqual(calls, ['workflows']);
  assert.deepEqual(windowObject.parent.messages.at(-1).message.payload.payload.paths, [
    'legacy.json',
    'team/a.json',
    'z.json',
  ]);
});

test('prepares through native queue lifecycle while intercepting all frontend POST and queue refresh calls', async () => {
  const order = [];
  let frontendPromptCount = 0;
  let queueRefreshCount = 0;
  const workflow = { version: 0.4, nodes: [] };
  const seedWidget = { name: 'seed', value: 1 };
  const graphNode = { id: '7', widgets: [seedWidget] };
  const graph = { '7': { class_type: 'KSampler', inputs: { seed: 42 } } };
  const api = createBaseApi({
    async getUserData(path) {
      assert.equal(path, 'workflows/team/portrait.json');
      return new Response(JSON.stringify(workflow), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    async queuePrompt() {
      frontendPromptCount += 1;
      throw new Error('real frontend POST was called');
    },
  });
  const originalApiQueuePrompt = api.queuePrompt;
  const queueUi = {
    async update() {
      queueRefreshCount += 1;
      throw new Error('real queue refresh was called');
    },
  };
  const originalQueueUpdate = queueUi.update;
  const app = createBaseApp(api, {
    graph: {
      getNodeById(nodeId) {
        return nodeId === graphNode.id ? graphNode : undefined;
      },
    },
    ui: { queue: queueUi },
    async loadGraphData(data, clean, restoreView, path, options) {
      order.push('load');
      assert.deepEqual(data, workflow);
      assert.equal(clean, true);
      assert.equal(restoreView, true);
      assert.equal(path, 'workflows/team/portrait.json');
      assert.deepEqual(options, {
        deferWarnings: true,
        skipAssetScans: true,
        silentAssetErrors: true,
      });
    },
    async queuePrompt(number, batchCount) {
      assert.equal(number, 0);
      assert.equal(batchCount, 1);
      order.push('beforeQueued');
      order.push('promoted-beforeQueued');
      order.push('graphToPrompt');
      await api.queuePrompt(0, {
        output: { '7': { class_type: 'KSampler', inputs: { seed: seedWidget.value } } },
        extra_data: { partner: { credential: 'runtime-only' } },
        workflow,
      });
      order.push('afterQueued');
      await this.ui.queue.update();
      return true;
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);
  windowObject.emit({
    data: request(
      'load-a',
      'prepare-a',
      'prepare-workflow',
      preparePayload('team/portrait.json', {
        widgetIntent: {
          mutations: [{ nodeId: '7', widgetName: 'seed', value: 42 }],
        },
      }),
    ),
  });
  await runtime.whenIdle();

  assert.deepEqual(order, [
    'load',
    'beforeQueued',
    'promoted-beforeQueued',
    'graphToPrompt',
    'afterQueued',
  ]);
  assert.equal(frontendPromptCount, 0);
  assert.equal(queueRefreshCount, 0);
  assert.equal(api.queuePrompt, originalApiQueuePrompt);
  assert.equal(queueUi.update, originalQueueUpdate);
  assert.deepEqual(windowObject.parent.messages.at(-1).message.payload.payload, {
    remotePath: 'team/portrait.json',
    graph,
    extraData: { partner: { credential: 'runtime-only' } },
    frontendPromptCount: 0,
  });
});

test('fails capability before workflow reads when native queue interception is not replaceable', async () => {
  let reads = 0;
  let nativeQueueCalls = 0;
  const api = createBaseApi({
    async getUserData() {
      reads += 1;
      throw new Error('must not read');
    },
  });
  Object.defineProperty(api, 'queuePrompt', {
    configurable: false,
    writable: false,
    value: async () => undefined,
  });
  const app = createBaseApp(api, {
    async queuePrompt() {
      nativeQueueCalls += 1;
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);
  windowObject.emit({
    data: request('load-a', 'prepare-unavailable', 'prepare-workflow', preparePayload('a.json')),
  });
  await runtime.whenIdle();

  assert.equal(reads, 0);
  assert.equal(nativeQueueCalls, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
});

test('rejects unsupported preparation contracts before workflow reads', async () => {
  let reads = 0;
  const api = createBaseApi({
    async getUserData() {
      reads += 1;
      throw new Error('must not read');
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app: createBaseApp(api), api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  windowObject.emit({
    data: request('load-a', 'prepare-contract-invalid', 'prepare-workflow', {
      remotePath: 'a.json',
      compileOnly: true,
      nativePreparationSequence: ['graphToPrompt'],
    }),
  });
  await runtime.whenIdle();
  assert.equal(reads, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');

  windowObject.emit({
    data: request(
      'load-a',
      'prepare-widget-intent',
      'prepare-workflow',
      preparePayload('a.json', { widgetIntent: { seed: 42 } }),
    ),
  });
  await runtime.whenIdle();
  assert.equal(reads, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
});

test('fails closed and cleans the canvas when a widget locator is missing', async () => {
  let cleanCount = 0;
  let nativeQueueCalls = 0;
  const api = createBaseApi({
    async getUserData() {
      return new Response(JSON.stringify({ version: 0.4, nodes: [] }), { status: 200 });
    },
  });
  const app = createBaseApp(api, {
    graph: { getNodeById: () => undefined },
    async queuePrompt() {
      nativeQueueCalls += 1;
    },
    clean() {
      cleanCount += 1;
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);

  windowObject.emit({
    data: request('load-a', 'prepare-missing-widget', 'prepare-workflow', preparePayload('a.json', {
      widgetIntent: {
        mutations: [{ nodeId: '7', widgetName: 'seed', value: 42 }],
      },
    })),
  });
  await runtime.whenIdle();

  assert.equal(nativeQueueCalls, 0);
  assert.equal(cleanCount, 1);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'runtime-not-ready');
});

test('cleans a partially loaded canvas when native preparation fails', async () => {
  let cleanCount = 0;
  const api = createBaseApi({
    async getUserData() {
      return new Response(JSON.stringify({ version: 0.4, nodes: [] }), { status: 200 });
    },
  });
  const app = createBaseApp(api, {
    async queuePrompt() {
      throw new Error('widget hook failed');
    },
    clean() {
      cleanCount += 1;
    },
  });
  const windowObject = new FakeWindow();
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);
  windowObject.emit({
    data: request('load-a', 'prepare-hook-failed', 'prepare-workflow', preparePayload('a.json')),
  });
  await runtime.whenIdle();

  assert.equal(cleanCount, 1);
  assert.equal(runtime.getCurrentWorkflowPath(), undefined);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.errorCode, 'hook-failed');
});

test('reset and dispose clean canvas and remove the message listener', async () => {
  let cleanCount = 0;
  const windowObject = new FakeWindow();
  const api = createBaseApi();
  const app = createBaseApp(api, { clean: () => { cleanCount += 1; } });
  const runtime = createImagenBridgeRuntime({ app, api, windowObject });
  runtime.start();
  await handshake(runtime, windowObject);
  windowObject.emit({ data: request('load-a', 'reset-a', 'reset') });
  windowObject.emit({ data: request('load-a', 'dispose-a', 'dispose') });
  await runtime.whenIdle();

  assert.equal(cleanCount, 2);
  assert.equal(windowObject.listeners.size, 0);
  assert.equal(windowObject.parent.messages.at(-1).message.payload.payload.disposed, true);
});
