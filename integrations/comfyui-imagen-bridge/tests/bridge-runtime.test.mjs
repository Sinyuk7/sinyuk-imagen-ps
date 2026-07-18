import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCanonicalWorkflowPath,
  BridgeProtocolError,
  createBridgeRuntime,
  isCanonicalPluginId,
} from '../web/bridge-runtime.mjs';

const source = {};
const identity = {
  origin: 'https://app.example.test',
  sourceId: 'source-1',
  loadId: 'load-1',
};
const compatibility = {
  protocolVersion: 1,
  bridgeVersion: '1.0.0',
  frontendVersion: '1.45.20',
  coreVersion: '0.27.1',
  contractSchemaVersion: 1,
  contractSchemaSha256: 'a'.repeat(64),
};
const config = {
  capabilities: {
    nativeQueue: true,
    receiptObserver: true,
    workflowDiscovery: true,
  },
  limits: {
    maxMessageBytes: 2_000_000,
    maxWorkflowPathBytes: 512,
    maxWorkflowListEntries: 1_000,
    maxMutations: 16,
    maxIdChars: 128,
    maxConfigureTimeoutMs: 30_000,
  },
};
const contract = {
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: [
    {
      role: 'prompt',
      slot: 0,
      required: true,
      dataType: 'text',
      locator: { nodeId: '10', fieldName: 'text' },
    },
    {
      role: 'output-image',
      slot: 0,
      required: true,
      dataType: 'image',
      locator: { nodeId: '20', fieldName: 'images' },
    },
  ],
};

function createAdapter(overrides = {}) {
  const phases = [];
  let queueCalls = 0;
  let active = 0;
  let maxActive = 0;
  const adapter = {
    phases,
    get queueCalls() {
      return queueCalls;
    },
    get maxActive() {
      return maxActive;
    },
    async getVersions() {
      return { frontendVersion: '1.45.20', coreVersion: '0.27.1' };
    },
    async discoverWorkflows() {
      return [{ remotePath: 'nested/workflow.json', contract }];
    },
    async validateCanonicalContract(value) {
      return { ok: true, value };
    },
    async openWorkflow(remotePath, { operationId }) {
      phases.push(`open:${operationId}:${remotePath}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      return { operationId };
    },
    async waitForConfigure(_opened, { operationId }) {
      phases.push(`configure:${operationId}`);
    },
    async readWorkflowContract() {
      return contract;
    },
    async applyMutations(_opened, plan, { operationId }) {
      phases.push(`mutate:${operationId}:${plan.length}`);
      return async () => phases.push(`restore:${operationId}`);
    },
    async queueNativeOnce({ operationId }) {
      queueCalls += 1;
      phases.push(`queue:${operationId}`);
      return { promptId: `prompt-${operationId}`, acknowledgedAt: 100 };
    },
    async resetOperation(operationId) {
      phases.push(`reset:${operationId}`);
      active -= 1;
    },
    async dispose() {
      phases.push('dispose');
    },
    ...overrides,
  };
  return adapter;
}

function createHarness(adapter = createAdapter(), runtimeIdentity = identity, expectedSource = source) {
  const runtime = createBridgeRuntime({
    identity: runtimeIdentity,
    compatibility,
    config,
    adapter,
    expectedSource,
  });
  let requestSequence = 0;
  const send = (command, payload, overrides = {}) => runtime.handleMessage({
    origin: overrides.origin ?? runtimeIdentity.origin,
    source: overrides.source ?? expectedSource,
    data: {
      requestId: overrides.requestId ?? `request-${++requestSequence}`,
      identity: overrides.identity ?? runtimeIdentity,
      command,
      payload,
      ...(overrides.extraEnvelope ?? {}),
    },
  });
  const handshake = () => send('handshake', compatibility);
  return { runtime, adapter, send, handshake };
}

function submitPayload(operationId, overrides = {}) {
  return {
    operationId,
    remotePath: 'nested/workflow.json',
    batchCount: 1,
    mutations: [
      { locator: { nodeId: '10', fieldName: 'text' }, value: 'hello\nworld' },
    ],
    configureTimeoutMs: 100,
    receiptTimeoutMs: 100,
    ...overrides,
  };
}

test('handshake returns exact identity, tuple, capabilities, and limits', async () => {
  const { handshake } = createHarness();
  const response = await handshake();
  assert.equal(response.ok, true);
  assert.deepEqual(response.payload.identity, identity);
  for (const [key, value] of Object.entries(compatibility)) {
    assert.equal(response.payload[key], value);
  }
  assert.deepEqual(response.payload.capabilities, config.capabilities);
  assert.deepEqual(response.payload.limits, config.limits);
});

test('identity accepts exact bounded UXP plugin ids and rejects unsafe forms', async () => {
  const pluginIdentity = { ...identity, origin: 'com.imagen-ps.plugin' };
  const pluginSource = {};
  const harness = createHarness(createAdapter(), pluginIdentity, pluginSource);
  assert.equal((await harness.handshake()).ok, true);
  assert.equal(isCanonicalPluginId('com.imagen-ps.plugin'), true);
  assert.equal(isCanonicalPluginId(`${'a'.repeat(64)}.${'b'.repeat(63)}`), true);
  for (const value of [
    'plugin',
    '.com.plugin',
    'com..plugin',
    'com/plugin',
    'com.plugin/',
    'com._plugin',
    `com.${'a'.repeat(65)}`,
    `${'a'.repeat(64)}.${'b'.repeat(64)}`,
    'com.plugin\nother',
  ]) {
    assert.equal(isCanonicalPluginId(value), false, value);
    assert.throws(
      () => createHarness(createAdapter(), { ...identity, origin: value }, pluginSource),
      (error) => error.code === 'invalid-request',
    );
  }
});

test('source/origin are ignored and nested identity mismatch is bounded', async () => {
  const { send } = createHarness();
  assert.equal(await send('handshake', compatibility, { source: {} }), undefined);
  assert.equal(
    await send('handshake', compatibility, { origin: 'https://other.example.test' }),
    undefined,
  );
  const response = await send('handshake', compatibility, {
    identity: { ...identity, loadId: 'other-load' },
  });
  assert.deepEqual(Object.keys(response).sort(), ['errorCode', 'ok', 'requestId']);
  assert.equal(response.errorCode, 'identity-mismatch');
});

test('unknown envelope fields, commands, and handshake tuple fail closed', async () => {
  const { send } = createHarness();
  const envelope = await send('handshake', compatibility, { extraEnvelope: { graph: {} } });
  assert.equal(envelope.errorCode, 'invalid-request');
  const command = await send('eval-script', {});
  assert.equal(command.errorCode, 'unsupported-command');
  const tuple = await send('handshake', { ...compatibility, coreVersion: 'other' });
  assert.equal(tuple.errorCode, 'bridge-incompatible');
  assert.equal('message' in tuple, false);
});

test('workflow discovery returns bounded summary and rejects unsafe path', async () => {
  const harness = createHarness();
  await harness.handshake();
  const listed = await harness.send('list-workflows', {});
  assert.deepEqual(listed.payload.workflows, [
    { remotePath: 'nested/workflow.json', contractSummary: contract },
  ]);
  assert.equal('graph' in listed.payload.workflows[0], false);

  const unsafe = createHarness(createAdapter({
    async discoverWorkflows() {
      return [{ remotePath: '../workflow.json', contract }];
    },
  }));
  await unsafe.handshake();
  const rejected = await unsafe.send('list-workflows', {});
  assert.equal(rejected.errorCode, 'invalid-workflow');

  const overflow = createHarness(createAdapter({
    async discoverWorkflows() {
      return Array.from({ length: 1_001 }, (_, index) => ({
        remotePath: `workflow-${index}.json`,
        contract,
      }));
    },
  }));
  await overflow.handshake();
  assert.equal((await overflow.send('list-workflows', {})).errorCode, 'limit-exceeded');
});

test('message, list, mutation, id, path, and timeout bounds reject before open', async () => {
  const adapter = createAdapter();
  const harness = createHarness(adapter);
  await harness.handshake();

  const oversized = await harness.send('submit-workflow', submitPayload('op-large', {
    mutations: [{ locator: { nodeId: '10', fieldName: 'text' }, value: 'x'.repeat(2_000_000) }],
  }));
  assert.equal(oversized.errorCode, 'limit-exceeded');

  const mutations = Array.from({ length: 17 }, (_, index) => ({
    locator: { nodeId: String(index), fieldName: 'text' },
    value: 'x',
  }));
  assert.equal(
    (await harness.send('submit-workflow', submitPayload('op-many', { mutations }))).errorCode,
    'limit-exceeded',
  );
  assert.equal(
    (await harness.send('submit-workflow', submitPayload('op-path', { remotePath: '%2e%2e/x.json' }))).errorCode,
    'invalid-workflow',
  );
  assert.equal(
    (await harness.send('submit-workflow', submitPayload('x'.repeat(129)))).errorCode,
    'invalid-request',
  );
  assert.equal(
    (await harness.send('submit-workflow', submitPayload('op-timeout', { configureTimeoutMs: 30_001 }))).errorCode,
    'limit-exceeded',
  );
  assert.equal(
    (await harness.send('submit-workflow', {
      ...submitPayload('op-graph'),
      graph: {},
    })).errorCode,
    'invalid-request',
  );
  assert.equal(
    (await harness.send('submit-workflow', {
      ...submitPayload('op-prompt-id'),
      promptId: 'caller-owned',
    })).errorCode,
    'invalid-request',
  );
  assert.equal(adapter.phases.length, 0);
});

test('workflow path byte limit accepts 512 and rejects 513 bytes', () => {
  const exact = `${'a'.repeat(507)}.json`;
  const oversized = `${'a'.repeat(508)}.json`;
  assert.equal(new TextEncoder().encode(exact).byteLength, 512);
  assert.equal(assertCanonicalWorkflowPath(exact, config.limits), exact);
  assert.throws(
    () => assertCanonicalWorkflowPath(oversized, config.limits),
    (error) => error.code === 'invalid-workflow',
  );
});

test('raw adapter exceptions never enter error envelope', async () => {
  const harness = createHarness(createAdapter({
    async discoverWorkflows() {
      throw new Error('/secret/workflow.json\nstack');
    },
  }));
  await harness.handshake();
  const response = await harness.send('list-workflows', {});
  assert.deepEqual(Object.keys(response).sort(), ['errorCode', 'ok', 'requestId']);
  assert.equal(response.errorCode, 'bridge-incompatible');
  assert.equal(JSON.stringify(response).includes('secret'), false);
});

test('submit mutates declared target, queues once, dedupes, and cleans up', async () => {
  const harness = createHarness();
  await harness.handshake();
  const first = await harness.send('submit-workflow', submitPayload('op-1'));
  const duplicate = await harness.send('submit-workflow', submitPayload('op-1'));
  assert.equal(first.ok, true);
  assert.deepEqual(first.payload, duplicate.payload);
  assert.equal(harness.adapter.queueCalls, 1);
  assert.deepEqual(harness.adapter.phases, [
    'open:op-1:nested/workflow.json',
    'configure:op-1',
    'mutate:op-1:1',
    'queue:op-1',
    'restore:op-1',
    'reset:op-1',
  ]);
  assert.deepEqual(harness.runtime.inspect().lease, {
    owner: null,
    waiters: 0,
    disposed: false,
  });

  const changed = await harness.send(
    'submit-workflow',
    submitPayload('op-1', {
      mutations: [{ locator: { nodeId: '10', fieldName: 'text' }, value: 'different' }],
    }),
  );
  assert.equal(changed.errorCode, 'invalid-request');
  assert.equal(harness.adapter.queueCalls, 1);
});

test('exclusive lease prevents Canvas phases from overlapping', async () => {
  const gates = new Map();
  const adapter = createAdapter({
    async queueNativeOnce({ operationId }) {
      adapter.phases.push(`queue:${operationId}`);
      await new Promise((resolve) => gates.set(operationId, resolve));
      return { promptId: `prompt-${operationId}`, acknowledgedAt: 100 };
    },
  });
  const harness = createHarness(adapter);
  await harness.handshake();
  const first = harness.send('submit-workflow', submitPayload('op-a', { configureTimeoutMs: 1_000 }));
  await new Promise((resolve) => setImmediate(resolve));
  const second = harness.send('submit-workflow', submitPayload('op-b', { configureTimeoutMs: 1_000 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adapter.maxActive, 1);
  assert.equal(adapter.phases.some((phase) => phase.startsWith('open:op-b')), false);
  gates.get('op-a')();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  gates.get('op-b')();
  await second;
  assert.equal(adapter.maxActive, 1);
});

test('configure timeout and receipt unknown release lease without replay', async () => {
  const timeoutHarness = createHarness(createAdapter({
    async waitForConfigure() {
      await new Promise(() => {});
    },
  }));
  await timeoutHarness.handshake();
  const timedOut = await timeoutHarness.send(
    'submit-workflow',
    submitPayload('op-timeout', { configureTimeoutMs: 100 }),
  );
  assert.equal(timedOut.errorCode, 'invalid-workflow');
  assert.equal(timeoutHarness.adapter.queueCalls, 0);
  assert.equal(timeoutHarness.runtime.inspect().lease.owner, null);
  assert.equal(timeoutHarness.runtime.inspect().disposed, true);

  const unknownHarness = createHarness(createAdapter({
    async queueNativeOnce() {
      throw new BridgeProtocolError('submission-unknown');
    },
  }));
  await unknownHarness.handshake();
  const unknown = await unknownHarness.send('submit-workflow', submitPayload('op-unknown'));
  assert.equal(unknown.errorCode, 'submission-unknown');
  const duplicate = await unknownHarness.send('submit-workflow', submitPayload('op-unknown'));
  assert.equal(duplicate.errorCode, 'submission-unknown');
  assert.equal(unknownHarness.runtime.inspect().operations, 1);
});

test('dispose clears state and new load rejects old identity', async () => {
  const first = createHarness();
  await first.handshake();
  await first.send('submit-workflow', submitPayload('op-1'));
  const disposed = await first.send('dispose', {});
  assert.equal(disposed.ok, true);
  assert.equal(first.runtime.inspect().disposed, true);
  assert.equal(first.runtime.inspect().operations, 0);

  const nextIdentity = { ...identity, loadId: 'load-2' };
  const next = createHarness(createAdapter(), nextIdentity);
  const stale = await next.send('handshake', compatibility, { identity });
  assert.equal(stale.errorCode, 'identity-mismatch');
  assert.equal((await next.handshake()).ok, true);
});

test('reset aborts active configure, clears waiter, and poisons ambiguous load', async () => {
  const adapter = createAdapter({
    async waitForConfigure() {
      await new Promise(() => {});
    },
  });
  const harness = createHarness(adapter);
  await harness.handshake();
  const submission = harness.send(
    'submit-workflow',
    submitPayload('op-reset', { configureTimeoutMs: 1_000 }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  const reset = await harness.send('reset', { operationId: 'op-reset' });
  assert.equal(reset.ok, true);
  assert.equal(reset.payload.reset, true);
  const result = await submission;
  assert.equal(result.errorCode, 'bridge-incompatible');
  assert.equal(adapter.queueCalls, 0);
  assert.deepEqual(harness.runtime.inspect().lease, {
    owner: null,
    waiters: 0,
    disposed: true,
  });
});
