import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachBridgeWindow,
  createBridgeRuntime,
} from '../web/bridge-runtime.mjs';
import { resolvePageHostTransport } from '../web/host-transport.mjs';

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
const identity = {
  origin: 'com.imagen-ps.plugin',
  sourceId: 'uxp-source-1',
  loadId: 'uxp-load-1',
};

function createWindowHarness() {
  const listeners = new Map();
  const posted = [];
  const windowObject = {
    parent: null,
    uxpHost: {
      postMessage(...args) {
        posted.push(args);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    async emit(type, event) {
      const listener = listeners.get(type);
      if (listener) await listener(event);
    },
  };
  windowObject.parent = windowObject;
  return { windowObject, posted, listeners };
}

function request(command, payload, overrides = {}) {
  return {
    requestId: overrides.requestId ?? `request-${command}`,
    identity: overrides.identity ?? identity,
    command,
    payload,
  };
}

test('UXP transport pins uxpHost source and replies through one-argument postMessage', async () => {
  const harness = createWindowHarness();
  const transport = resolvePageHostTransport(harness.windowObject, identity);
  assert.equal(transport.kind, 'uxp');
  assert.equal(transport.expectedSource, harness.windowObject.uxpHost);

  let disposeCalls = 0;
  const runtime = createBridgeRuntime({
    identity,
    compatibility,
    config,
    expectedSource: transport.expectedSource,
    adapter: {
      async getVersions() {
        return { frontendVersion: '1.45.20', coreVersion: '0.27.1' };
      },
      async dispose() {
        disposeCalls += 1;
      },
    },
  });
  const detach = attachBridgeWindow({
    runtime,
    windowObject: harness.windowObject,
    reply: transport.reply,
  });

  await harness.windowObject.emit('message', {
    origin: identity.origin,
    source: harness.windowObject.uxpHost,
    data: request('handshake', compatibility),
  });
  assert.equal(harness.posted.length, 1);
  assert.equal(harness.posted[0].length, 1);
  assert.equal(harness.posted[0][0].ok, true);
  assert.deepEqual(harness.posted[0][0].payload.identity, identity);

  await harness.windowObject.emit('message', {
    origin: identity.origin,
    source: {},
    data: request('handshake', compatibility, { requestId: 'wrong-source' }),
  });
  await harness.windowObject.emit('message', {
    origin: 'com.other.plugin',
    source: harness.windowObject.uxpHost,
    data: request('handshake', compatibility, { requestId: 'wrong-origin' }),
  });
  assert.equal(harness.posted.length, 1);

  for (const [field, value] of [
    ['origin', 'com.other.plugin'],
    ['sourceId', 'other-source'],
    ['loadId', 'other-load'],
  ]) {
    await harness.windowObject.emit('message', {
      origin: identity.origin,
      source: harness.windowObject.uxpHost,
      data: request('handshake', compatibility, {
        requestId: `nested-${field}`,
        identity: { ...identity, [field]: value },
      }),
    });
    assert.equal(harness.posted.at(-1)[0].errorCode, 'identity-mismatch');
  }

  await harness.windowObject.emit('message', {
    origin: identity.origin,
    source: harness.windowObject.uxpHost,
    data: request('dispose', {}),
  });
  assert.equal(harness.posted[4][0].ok, true);
  assert.deepEqual(harness.posted[4][0].payload, { disposed: true });
  assert.equal(runtime.inspect().disposed, true);
  assert.equal(disposeCalls, 1);
  assert.equal(harness.listeners.has('message'), false);

  detach();
  assert.equal(harness.listeners.has('message'), false);
});

test('iframe transport keeps exact parent source and target origin reply', () => {
  const calls = [];
  const parent = { postMessage: (...args) => calls.push(args) };
  const windowObject = { parent };
  const iframeIdentity = { ...identity, origin: 'https://app.example.test' };
  const transport = resolvePageHostTransport(windowObject, iframeIdentity);
  assert.equal(transport.kind, 'iframe');
  assert.equal(transport.expectedSource, parent);
  transport.reply({ origin: iframeIdentity.origin }, { ok: true });
  assert.deepEqual(calls, [[{ ok: true }, iframeIdentity.origin]]);

  assert.equal(
    resolvePageHostTransport(
      { parent: null, uxpHost: { postMessage: 'not-a-function' } },
      identity,
    ),
    undefined,
  );
});
