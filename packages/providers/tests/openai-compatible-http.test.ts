import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpRequest, type HttpRequest } from '../src/transport/openai-compatible/http.js';
import type { RetryPolicy } from '../src/transport/openai-compatible/retry.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe('openai-compatible HTTP transport', () => {
  it('retries transient network failures and records diagnostics', async () => {
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length < 3) {
        const error = new Error('ECONNRESET');
        throw error;
      }

      return createJsonResponse({ ok: true });
    });

    vi.stubGlobal('fetch', fetchMock);

    const request: HttpRequest = {
      url: 'https://relay.example/v1/images/generations',
      method: 'POST',
      body: { prompt: 'a cat' },
    };

    const policy: RetryPolicy = {
      maxRetries: 2,
      baseDelayMs: 1,
      factor: 1,
    };

    const result = await httpRequest(request, policy);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.response.data).toEqual({ ok: true });
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'retry',
      level: 'info',
      details: {
        attempt: 1,
        delayMs: 1,
        kind: 'network_error',
      },
    });
    expect(result.diagnostics[1]).toMatchObject({
      code: 'retry',
      level: 'info',
      details: {
        attempt: 2,
        delayMs: 1,
        kind: 'network_error',
      },
    });
  });

  it('surfaces timeout aborts without retrying', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise((_, reject) => {
          const signal = init?.signal;

          if (signal?.aborted) {
            const error = new Error('Request aborted.');
            error.name = 'AbortError';
            reject(error);
            return;
          }

          signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('Request aborted.');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const request: HttpRequest = {
      url: 'https://relay.example/v1/images/generations',
      method: 'POST',
      timeoutMs: 5,
      body: { prompt: 'a cat' },
    };

    const promise = httpRequest(request);
    await vi.advanceTimersByTimeAsync(5);

    await expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
