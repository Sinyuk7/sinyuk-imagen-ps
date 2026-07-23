import assert from 'node:assert/strict';
import test from 'node:test';
import { attachBridgeWindow, createBridgeRuntime } from '../web/bridge-runtime.mjs';

const identity = { origin: 'com.imagen.ps', sourceId: 'source', loadId: 'load' };
const config = { capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true }, limits: { maxMessageBytes: 2_000_000, maxWorkflowPathBytes: 512, maxWorkflowListEntries: 1000, maxMutations: 16, maxIdChars: 128, maxConfigureTimeoutMs: 30_000 } };
const compatibility = { protocolVersion: 1, bridgeVersion: '1.0.0', frontendVersion: 'unknown', coreVersion: 'unknown' };
function request(command, payload = {}) { return { requestId: `request-${command}`, identity, command, payload }; }

test('bridge allowlist handshakes, lists, submits once, and disposes', async () => {
  let queues = 0;
  let resets = 0;
  let restores = 0;
  let disposes = 0;
  const runtimeSource = {};
  const runtime = createBridgeRuntime({ identity, compatibility, config, expectedSource: runtimeSource, adapter: {
    async getVersions() { return { frontendVersion: 'unknown', coreVersion: 'unknown' }; },
    async discoverWorkflows() { return [{ workflowId: 'workflow:a', displayName: 'a', remotePath: 'a.json', revision: 'rev-a' }]; },
    async openWorkflow() { return {}; },
    async setValues() { return async () => { restores += 1; }; },
    async queueNativeOnce() { queues += 1; return { promptId: 'prompt-1', acknowledgedAt: 1 }; },
    async resetOperation() { resets += 1; },
    async dispose() { disposes += 1; },
  } });
  const event = (data) => ({ source: runtimeSource, origin: identity.origin, data });
  assert.equal((await runtime.handleMessage(event(request('handshake', compatibility)))).ok, true);
  const listed = await runtime.handleMessage(event(request('list-workflows')));
  assert.equal(listed.payload.workflows.length, 1);
  const payload = { workflowId: 'workflow:a', revision: 'rev-a', remotePath: 'a.json', operationId: 'op-1', mutations: [], configureTimeoutMs: 100, receiptTimeoutMs: 100 };
  const first = await runtime.handleMessage(event(request('submit', payload)));
  const second = await runtime.handleMessage(event({ ...request('submit', payload), requestId: 'request-submit-2' }));
  assert.equal(first.payload.promptId, 'prompt-1');
  assert.equal(second.payload.promptId, 'prompt-1');
  assert.equal(queues, 1);
  assert.equal(restores, 1);
  assert.equal(resets, 1);
  assert.deepEqual((await runtime.handleMessage(event(request('dispose')))).payload, { disposed: true });
  assert.equal(disposes, 1);
  assert.equal((await runtime.handleMessage(event(request('list-workflows')))).errorCode, 'bridge-incompatible');
});

test('bridge bounds native queue rejection and releases operation lease', async () => {
  let queues = 0;
  let resets = 0;
  let restores = 0;
  const runtimeSource = {};
  const runtime = createBridgeRuntime({ identity, compatibility, config, expectedSource: runtimeSource, adapter: {
    async discoverWorkflows() { return []; },
    async openWorkflow() { return {}; },
    async setValues() { return async () => { restores += 1; }; },
    async queueNativeOnce() { queues += 1; throw new Error('raw native details'); },
    async resetOperation() { resets += 1; },
    async dispose() {},
  } });
  const event = (data) => ({ source: runtimeSource, origin: identity.origin, data });
  await runtime.handleMessage(event(request('handshake', compatibility)));
  const payload = { workflowId: 'workflow:a', revision: 'rev-a', remotePath: 'a.json', operationId: 'op-fail', mutations: [], configureTimeoutMs: 100, receiptTimeoutMs: 100 };
  const response = await runtime.handleMessage(event(request('submit', payload)));
  assert.equal(response.errorCode, 'submission-unknown');
  assert.equal(queues, 1);
  assert.equal(restores, 1);
  assert.equal(resets, 1);
  assert.equal(runtime.inspect().lease.owner, null);
});

test('bridge keeps a valid receipt when post-queue cleanup fails', async () => {
  let queues = 0;
  const runtimeSource = {};
  const runtime = createBridgeRuntime({ identity, compatibility, config, expectedSource: runtimeSource, adapter: {
    async discoverWorkflows() { return []; },
    async openWorkflow() { return {}; },
    async setValues() { return async () => { throw new Error('restore failed'); }; },
    async queueNativeOnce() { queues += 1; return { promptId: 'prompt-cleanup', acknowledgedAt: 2 }; },
    async resetOperation() { throw new Error('reset failed'); },
    async dispose() {},
  } });
  const event = (data) => ({ source: runtimeSource, origin: identity.origin, data });
  await runtime.handleMessage(event(request('handshake', compatibility)));
  const payload = { workflowId: 'workflow:a', revision: 'rev-a', remotePath: 'a.json', operationId: 'op-cleanup', mutations: [], configureTimeoutMs: 100, receiptTimeoutMs: 100 };

  const first = await runtime.handleMessage(event(request('submit', payload)));
  const second = await runtime.handleMessage(event({ ...request('submit', payload), requestId: 'request-submit-cleanup-2' }));

  assert.equal(first.ok, true);
  assert.equal(first.payload.promptId, 'prompt-cleanup');
  assert.equal(second.payload.promptId, 'prompt-cleanup');
  assert.equal(queues, 1);
  assert.equal(runtime.inspect().lease.owner, null);
});

test('bridge preserves submission-unknown when malformed receipt cleanup also fails', async () => {
  let queues = 0;
  const runtimeSource = {};
  const runtime = createBridgeRuntime({ identity, compatibility, config, expectedSource: runtimeSource, adapter: {
    async discoverWorkflows() { return []; },
    async openWorkflow() { return {}; },
    async setValues() { return async () => { throw new Error('restore failed'); }; },
    async queueNativeOnce() { queues += 1; return { promptId: '', acknowledgedAt: 'invalid' }; },
    async resetOperation() { throw new Error('reset failed'); },
    async dispose() {},
  } });
  const event = (data) => ({ source: runtimeSource, origin: identity.origin, data });
  await runtime.handleMessage(event(request('handshake', compatibility)));
  const payload = { workflowId: 'workflow:a', revision: 'rev-a', remotePath: 'a.json', operationId: 'op-malformed', mutations: [], configureTimeoutMs: 100, receiptTimeoutMs: 100 };

  const first = await runtime.handleMessage(event(request('submit', payload)));
  const second = await runtime.handleMessage(event({ ...request('submit', payload), requestId: 'request-submit-malformed-2' }));

  assert.equal(first.errorCode, 'submission-unknown');
  assert.equal(second.errorCode, 'submission-unknown');
  assert.equal(queues, 1);
  assert.equal(runtime.inspect().lease.owner, null);
});

test('bridge listener reports received and replied protocol messages', async () => {
  const runtimeSource = {};
  const listeners = new Set();
  const windowObject = {
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  const runtime = createBridgeRuntime({ identity, compatibility, config, expectedSource: runtimeSource, adapter: {
    async getVersions() { return { frontendVersion: 'unknown', coreVersion: 'unknown' }; },
    async discoverWorkflows() { return []; },
    async openWorkflow() { return {}; },
    async setValues() { return async () => {}; },
    async queueNativeOnce() { return { promptId: 'prompt-1', acknowledgedAt: 1 }; },
    async resetOperation() {},
    async dispose() {},
  } });
  let received = 0;
  let replied = 0;
  const responses = [];
  const detach = attachBridgeWindow({
    runtime,
    windowObject,
    reply(_event, response) { responses.push(response); },
    onMessage() { received += 1; },
    onResponse() { replied += 1; },
  });
  for (const listener of listeners) await listener({ source: runtimeSource, origin: identity.origin, data: request('handshake', compatibility) });
  assert.equal(received, 1);
  assert.equal(replied, 1);
  assert.equal(responses[0].ok, true);
  detach();
});
