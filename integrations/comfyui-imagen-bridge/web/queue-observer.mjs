import { BridgeProtocolError } from './bridge-runtime.mjs';

const RECEIPT_OBSERVER = Symbol.for('imagen-ps.comfyui.receipt-observer');

function boundedPromptId(response, maxIdChars) {
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw new BridgeProtocolError('submission-unknown');
  }
  const promptId = response.prompt_id;
  if (
    typeof promptId !== 'string' ||
    promptId.length === 0 ||
    Array.from(promptId).length > maxIdChars ||
    /[\u0000-\u001f\u007f]/u.test(promptId)
  ) {
    throw new BridgeProtocolError('submission-unknown');
  }
  return promptId;
}

function receiptTimeout(promise, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, new BridgeProtocolError('submission-unknown'));
    const timer = setTimeout(onAbort, timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      () => finish(reject, new BridgeProtocolError('submission-unknown')),
    );
  });
}

/**
 * 临时观察 current api.queuePrompt response；保持原 arguments、返回值与真实 POST。
 */
export async function observeNativeQueueReceipt({
  app,
  api,
  receiptTimeoutMs,
  signal,
  maxIdChars,
  now = Date.now,
}) {
  if (!app || typeof app.queuePrompt !== 'function' || !api || typeof api.queuePrompt !== 'function') {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  const current = api.queuePrompt;
  if (current[RECEIPT_OBSERVER] === true) {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  const descriptor = Object.getOwnPropertyDescriptor(api, 'queuePrompt');
  const hadOwnQueuePrompt = descriptor !== undefined;
  if (descriptor && descriptor.writable === false && typeof descriptor.set !== 'function') {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  if (!descriptor && !Object.isExtensible(api)) {
    throw new BridgeProtocolError('bridge-incompatible');
  }

  let callCount = 0;
  let resolveReceipt;
  let rejectReceipt;
  const receiptPromise = new Promise((resolve, reject) => {
    resolveReceipt = resolve;
    rejectReceipt = reject;
  });
  void receiptPromise.catch(() => {});
  function observer(...args) {
    callCount += 1;
    if (callCount !== 1) {
      const error = new BridgeProtocolError('submission-unknown');
      rejectReceipt(error);
      throw error;
    }
    let response;
    try {
      response = Reflect.apply(current, this, args);
    } catch (error) {
      rejectReceipt(error);
      throw error;
    }
    Promise.resolve(response).then(
      (value) => {
        try {
          resolveReceipt({
            promptId: boundedPromptId(value, maxIdChars),
            acknowledgedAt: now(),
          });
        } catch (error) {
          rejectReceipt(error);
        }
      },
      rejectReceipt,
    );
    return response;
  }
  Object.defineProperty(observer, RECEIPT_OBSERVER, { value: true });

  try {
    api.queuePrompt = observer;
  } catch {
    throw new BridgeProtocolError('bridge-incompatible');
  }
  if (api.queuePrompt !== observer) {
    throw new BridgeProtocolError('bridge-incompatible');
  }

  let conflict = false;
  let receipt;
  let thrown;
  try {
    await app.queuePrompt(0, 1);
    receipt = await receiptTimeout(receiptPromise, receiptTimeoutMs, signal);
    if (callCount !== 1) throw new BridgeProtocolError('submission-unknown');
  } catch (error) {
    thrown = error instanceof BridgeProtocolError
      ? error
      : new BridgeProtocolError('submission-unknown');
  } finally {
    if (api.queuePrompt === observer) {
      try {
        if (hadOwnQueuePrompt) {
          api.queuePrompt = current;
        } else {
          delete api.queuePrompt;
        }
      } catch {
        conflict = true;
      }
      if (api.queuePrompt !== current) conflict = true;
    } else {
      conflict = true;
    }
    if (conflict) {
      rejectReceipt(new BridgeProtocolError('submission-unknown'));
    }
  }
  if (conflict) throw new BridgeProtocolError('submission-unknown');
  if (thrown) throw thrown;
  return receipt;
}
