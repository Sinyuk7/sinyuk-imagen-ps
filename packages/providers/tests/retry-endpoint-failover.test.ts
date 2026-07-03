import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  endpointRuntimeHealthSizeForTesting,
  executeWithEndpointFailover,
  resetEndpointRuntimeHealthForTesting,
} from '../src/transport/image-endpoint/failover.js';
import { httpRequest } from '../src/transport/image-endpoint/http.js';
import { createCountingFetch } from './counting-transport.js';

const connection = {
  selectionMode: 'manual' as const,
  failoverEnabled: true,
  preferredEndpointId: 'primary',
  endpoints: [
    { id: 'primary', url: 'https://primary.example.com', enabled: true },
    { id: 'secondary', url: 'https://secondary.example.com', enabled: true },
  ],
};

function executeModelsRequest(options?: {
  readonly maxAttempts?: number;
  readonly deadlineMs?: number;
  readonly cooldownMs?: number;
}) {
  return executeWithEndpointFailover({
    connection,
    retryPolicy: { maxRetries: 1, baseDelayMs: 0, factor: 1 },
    retryOptions: { retryability: 'broad' },
    ...options,
    execute: (endpoint) => httpRequest({
      url: `${endpoint.url}/v1/models`,
      method: 'GET',
    }, { maxRetries: 0, baseDelayMs: 0, factor: 1 }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEndpointRuntimeHealthForTesting();
});

describe('endpoint failover executor', () => {
  it('retries 429 on the same endpoint before succeeding', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 429, headers: { 'retry-after': '0' }, data: { error: { message: 'Slow down' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeModelsRequest();

    expect(result.selectedEndpointId).toBe('primary');
    expect(counting.calls).toHaveLength(2);
    expect(counting.calls[0]?.url).toBe('https://primary.example.com/v1/models');
    expect(counting.calls[1]?.url).toBe('https://primary.example.com/v1/models');
    expect(result.attempts.map((attempt) => [attempt.endpointId, attempt.outcome])).toEqual([
      ['primary', 'failure'],
      ['primary', 'success'],
    ]);
  });

  it('falls over to the next endpoint after 503', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 503, data: { error: { message: 'Unavailable' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeModelsRequest({ maxAttempts: 2 });

    expect(result.selectedEndpointId).toBe('secondary');
    expect(counting.calls[0]?.url).toBe('https://primary.example.com/v1/models');
    expect(counting.calls[1]?.url).toBe('https://secondary.example.com/v1/models');
  });

  it('falls over to the next endpoint after network error', async () => {
    const counting = createCountingFetch([
      { kind: 'network_error' },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeModelsRequest({ maxAttempts: 2 });

    expect(result.selectedEndpointId).toBe('secondary');
    expect(counting.calls).toHaveLength(2);
  });

  it('does not fail over after auth failure', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 401, data: { error: { message: 'Unauthorized' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(executeModelsRequest({ maxAttempts: 2 })).rejects.toThrow();
    expect(counting.calls).toHaveLength(1);
  });

  it('does not retry 404 on the same endpoint and may try next endpoint', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 404, data: { error: { message: 'Missing path' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeModelsRequest({ maxAttempts: 2 });

    expect(result.selectedEndpointId).toBe('secondary');
    expect(counting.calls).toHaveLength(2);
    expect(result.attempts[0]?.endpointId).toBe('primary');
    expect(result.attempts[1]?.endpointId).toBe('secondary');
  });

  it('does not fail over after request-invalid 400', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 400, data: { error: { message: 'Invalid size' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(executeModelsRequest({ maxAttempts: 2 })).rejects.toThrow('Invalid size');
    expect(counting.calls).toHaveLength(1);
  });

  it('does not put request-invalid 422 into cooldown for the next request', async () => {
    const first = createCountingFetch([
      { kind: 'response', status: 422, data: { error: { message: 'Invalid request' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', first.fetch);

    await expect(executeModelsRequest({ cooldownMs: 60_000, maxAttempts: 2 })).rejects.toThrow('Invalid request');
    expect(first.calls).toHaveLength(1);

    const second = createCountingFetch([{ kind: 'response', status: 200, data: { ok: true } }]);
    vi.stubGlobal('fetch', second.fetch);

    const result = await executeModelsRequest({ cooldownMs: 60_000, maxAttempts: 2 });
    expect(result.selectedEndpointId).toBe('primary');
    expect(second.calls[0]?.url).toBe('https://primary.example.com/v1/models');
  });

  it('does not fail over after request-invalid 415', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(executeModelsRequest({ maxAttempts: 2 })).rejects.toThrow('Unsupported Media Type');
    expect(counting.calls).toHaveLength(1);
  });

  it('emits endpoint id and attempt index in diagnostics', async () => {
    const counting = createCountingFetch([
      { kind: 'network_error' },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeModelsRequest({ maxAttempts: 2 });
    const attemptDiagnostic = result.diagnostics.find((item) => item.code === 'endpoint.attempt');

    expect(attemptDiagnostic?.details).toMatchObject({
      endpointId: 'primary',
      attemptIndex: 1,
    });
  });

  it('caps nested retry and failover by global maxAttempts', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 429, headers: { 'retry-after': '0' }, data: { error: { message: 'Slow down' } } },
      { kind: 'response', status: 503, data: { error: { message: 'Unavailable' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(executeModelsRequest({ maxAttempts: 1 })).rejects.toThrow();
    expect(counting.calls).toHaveLength(1);
  });

  it('aborts remaining attempts after deadlineMs', async () => {
    vi.useFakeTimers();
    const execute = vi.fn(async (_endpoint, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('Request timed out.');
        error.name = 'TimeoutError';
        reject(error);
      }, { once: true });
    }));

    const pending = executeWithEndpointFailover({
      connection,
      deadlineMs: 5,
      maxAttempts: 3,
      execute,
    });
    await vi.advanceTimersByTimeAsync(30);

    await expect(pending).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skips a cooled-down endpoint on the next request', async () => {
    const counting = createCountingFetch([
      { kind: 'network_error' },
      { kind: 'response', status: 200, data: { ok: true } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await executeModelsRequest({ cooldownMs: 60_000, maxAttempts: 2 });
    const second = await executeModelsRequest({ cooldownMs: 60_000, maxAttempts: 2 });

    expect(second.selectedEndpointId).toBe('secondary');
    expect(counting.calls).toHaveLength(3);
    expect(second.attempts.some((attempt) => attempt.outcome === 'skipped_cooldown')).toBe(true);
  });

  it('cleans stale runtime health entries after connection edits stop referencing them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));
    const staleConnection = {
      ...connection,
      endpoints: [
        { id: 'stale', url: 'https://stale.example.com', enabled: true },
      ],
      preferredEndpointId: 'stale',
    };

    await expect(executeWithEndpointFailover({
      connection: staleConnection,
      cooldownMs: 1_000,
      maxAttempts: 1,
      execute: async () => {
        throw Object.assign(new Error('offline'), { kind: 'network_error' });
      },
    })).rejects.toThrow();
    expect(endpointRuntimeHealthSizeForTesting()).toBe(1);

    vi.setSystemTime(new Date('2026-07-04T00:11:00.000Z'));
    const counting = createCountingFetch([{ kind: 'response', status: 200, data: { ok: true } }]);
    vi.stubGlobal('fetch', counting.fetch);
    await executeModelsRequest({ cooldownMs: 1_000, maxAttempts: 1 });

    expect(endpointRuntimeHealthSizeForTesting()).toBe(1);
    vi.useRealTimers();
  });
});
