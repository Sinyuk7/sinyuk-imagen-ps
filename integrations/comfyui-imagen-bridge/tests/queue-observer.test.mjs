import assert from 'node:assert/strict';
import test from 'node:test';

import { observeNativeQueueReceipt } from '../web/queue-observer.mjs';

test('observer calls native app once and preserves api arguments, response, and wrapper', async () => {
  const calls = [];
  const response = Promise.resolve({ prompt_id: 'prompt-1', number: 7 });
  const original = function (...args) {
    calls.push({ thisValue: this, args });
    return response;
  };
  const api = { queuePrompt: original };
  let appCalls = 0;
  let observedResponse;
  const app = {
    async queuePrompt(...args) {
      appCalls += 1;
      assert.deepEqual(args, [0, 1]);
      observedResponse = api.queuePrompt('native-number', 1);
      assert.equal(observedResponse, response);
      await observedResponse;
    },
  };
  const receipt = await observeNativeQueueReceipt({
    app,
    api,
    receiptTimeoutMs: 100,
    signal: new AbortController().signal,
    maxIdChars: 128,
    now: () => 123,
  });
  assert.deepEqual(receipt, { promptId: 'prompt-1', acknowledgedAt: 123 });
  assert.equal(appCalls, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['native-number', 1]);
  assert.equal(calls[0].thisValue, api);
  assert.equal(api.queuePrompt, original);
});

test('observer accepts an omitted abort signal', async () => {
  const api = {
    queuePrompt: () => Promise.resolve({ prompt_id: 'prompt-without-signal' }),
  };
  const receipt = await observeNativeQueueReceipt({
    app: { queuePrompt: () => api.queuePrompt(0, 1) },
    api,
    receiptTimeoutMs: 100,
    maxIdChars: 128,
    now: () => 456,
  });
  assert.deepEqual(receipt, {
    promptId: 'prompt-without-signal',
    acknowledgedAt: 456,
  });
});

test('observer fails before Queue when current function cannot be wrapped', async () => {
  const api = {};
  const current = () => ({ prompt_id: 'prompt-1' });
  Object.defineProperty(api, 'queuePrompt', { value: current, writable: false });
  let appCalls = 0;
  const app = { queuePrompt: () => { appCalls += 1; } };
  await assert.rejects(
    observeNativeQueueReceipt({
      app,
      api,
      receiptTimeoutMs: 10,
      signal: new AbortController().signal,
      maxIdChars: 128,
    }),
    (error) => error.code === 'bridge-incompatible',
  );
  assert.equal(appCalls, 0);
});

test('missing receipt and wrapper conflict are bounded unknown states', async () => {
  const missingApi = { queuePrompt: () => ({ number: 1 }) };
  await assert.rejects(
    observeNativeQueueReceipt({
      app: { queuePrompt: () => missingApi.queuePrompt(0, 1) },
      api: missingApi,
      receiptTimeoutMs: 10,
      signal: new AbortController().signal,
      maxIdChars: 128,
    }),
    (error) => error.code === 'submission-unknown',
  );

  const original = () => Promise.resolve({ prompt_id: 'prompt-1' });
  const replacement = () => Promise.resolve({ prompt_id: 'other' });
  const conflictApi = { queuePrompt: original };
  await assert.rejects(
    observeNativeQueueReceipt({
      app: {
        async queuePrompt() {
          const result = conflictApi.queuePrompt(0, 1);
          conflictApi.queuePrompt = replacement;
          await result;
        },
      },
      api: conflictApi,
      receiptTimeoutMs: 10,
      signal: new AbortController().signal,
      maxIdChars: 128,
    }),
    (error) => error.code === 'submission-unknown',
  );
  assert.equal(conflictApi.queuePrompt, replacement);
});

test('observer restores inherited queuePrompt without leaving own wrapper state', async () => {
  const prototype = {
    queuePrompt: () => Promise.resolve({ prompt_id: 'prompt-inherited' }),
  };
  const api = Object.create(prototype);
  const app = { queuePrompt: () => api.queuePrompt(0, 1) };
  await observeNativeQueueReceipt({
    app,
    api,
    receiptTimeoutMs: 10,
    signal: new AbortController().signal,
    maxIdChars: 128,
  });
  assert.equal(Object.hasOwn(api, 'queuePrompt'), false);
  assert.equal(api.queuePrompt, prototype.queuePrompt);
});
