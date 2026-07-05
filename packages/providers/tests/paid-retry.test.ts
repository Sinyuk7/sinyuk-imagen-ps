import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIdempotencyKey, resolvePaidRetryConfig, resolveIdempotencyHeader } from './../src/transport/image-endpoint/paid-retry.js';
import { defaultPaidRetryPolicy } from './../src/transport/image-endpoint/retry.js';
import { httpRequest } from './../src/transport/image-endpoint/http.js';
import { executeWithEndpointFailover, resetEndpointRuntimeHealthForTesting } from './../src/transport/image-endpoint/failover.js';
import { createCountingFetch } from './counting-transport.js';
import type { ProviderDescriptor } from './../src/contract/provider.js';

const baseDescriptor: ProviderDescriptor = {
  id: 'test-provider',
  family: 'image-endpoint',
  displayName: 'Test',
  operations: ['text_to_image'],
  invokeMode: 'sync',
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetEndpointRuntimeHealthForTesting();
});

describe('resolvePaidRetryConfig', () => {
  it('defaults to conservative paid policy + no idempotency when transport undeclared', () => {
    const config = resolvePaidRetryConfig(baseDescriptor);
    expect(config.idempotencySupported).toBe(false);
    expect(config.policy).toEqual(defaultPaidRetryPolicy);
  });

  it('reads idempotency supported from descriptor.transport', () => {
    const config = resolvePaidRetryConfig({
      ...baseDescriptor,
      transport: { idempotency: 'supported' },
    });
    expect(config.idempotencySupported).toBe(true);
  });

  it('reads custom retry policy from descriptor.transport', () => {
    const custom = { maxRetries: 1, baseDelayMs: 5, factor: 1 };
    const config = resolvePaidRetryConfig({
      ...baseDescriptor,
      transport: { idempotency: 'unsupported', retryPolicy: custom },
    });
    expect(config.policy).toEqual(custom);
    expect(config.idempotencySupported).toBe(false);
  });
});

describe('buildIdempotencyKey', () => {
  it('is stable for identical canonical requests', () => {
    const request = { operation: 'text_to_image', prompt: 'a cat', model: { modelId: 'gpt-image-1', apiFormat: 'openai-images', requestStrategyId: 'image-endpoint-variant' } };
    expect(buildIdempotencyKey(request)).toBe(buildIdempotencyKey({ ...request }));
  });

  it('differs for different prompts', () => {
    const a = buildIdempotencyKey({ operation: 'text_to_image', prompt: 'a cat' });
    const b = buildIdempotencyKey({ operation: 'text_to_image', prompt: 'a dog' });
    expect(a).not.toBe(b);
  });

  it('differs for different image counts', () => {
    const a = buildIdempotencyKey({ operation: 'image_edit', prompt: 'edit', images: [] });
    const b = buildIdempotencyKey({ operation: 'image_edit', prompt: 'edit', images: [{ data: 'x' }] });
    expect(a).not.toBe(b);
  });

  it('produces a header-safe hex string', () => {
    const key = buildIdempotencyKey({ operation: 'text_to_image', prompt: 'a cat' });
    expect(key).toMatch(/^imagen-[0-9a-f]+$/);
  });
});

describe('resolveIdempotencyHeader', () => {
  it('returns undefined when idempotency unsupported', () => {
    const config = resolvePaidRetryConfig(baseDescriptor);
    expect(resolveIdempotencyHeader(config, { operation: 'text_to_image', prompt: 'a cat' })).toBeUndefined();
  });

  it('returns Idempotency-Key header when supported', () => {
    const config = resolvePaidRetryConfig({ ...baseDescriptor, transport: { idempotency: 'supported' } });
    const header = resolveIdempotencyHeader(config, { operation: 'text_to_image', prompt: 'a cat' });
    expect(header).toEqual({ 'Idempotency-Key': expect.any(String) });
  });
});

describe('httpRequest idempotency-key passthrough across retries', () => {
  it('sends the same Idempotency-Key on every 429 retry attempt when idempotency is supported', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 429, headers: { 'retry-after': '0' }, data: { error: { message: 'Slow down' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const idempotencyKey = 'imagen-stable-key';
    await httpRequest(
      {
        url: 'https://example.local/v1/images/generations',
        method: 'POST',
        headers: { Authorization: 'Bearer sk-test', 'Idempotency-Key': idempotencyKey },
        body: { prompt: 'a cat' },
      },
      { maxRetries: 3, baseDelayMs: 0, factor: 1 },
      undefined,
      undefined,
      { retryability: 'paid', idempotencySupported: true },
    );

    expect(counting.attemptCount()).toBe(2);
    expect(counting.calls[0].headers['Idempotency-Key']).toBe(idempotencyKey);
    expect(counting.calls[1].headers['Idempotency-Key']).toBe(idempotencyKey);
  });

  it('does NOT retry network_error when idempotency unsupported (no double charge)', async () => {
    const counting = createCountingFetch([{ kind: 'network_error' }, { kind: 'response', status: 200 }]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(
      httpRequest(
        {
          url: 'https://example.local/v1/images/generations',
          method: 'POST',
          headers: { Authorization: 'Bearer sk-test' },
          body: { prompt: 'a cat' },
        },
        { maxRetries: 3, baseDelayMs: 0, factor: 1 },
        undefined,
        undefined,
        { retryability: 'paid', idempotencySupported: false },
      ),
    ).rejects.toThrow();

    expect(counting.attemptCount()).toBe(1);
  });

  it('keeps the same Idempotency-Key across endpoint failover inside one logical request', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 503, data: { error: { message: 'Unavailable' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const idempotencyKey = 'imagen-shared-key';
    await executeWithEndpointFailover({
      connection: {
        selectionMode: 'auto',
        endpoints: [
          { id: 'primary', url: 'https://primary.example.com', enabled: true },
          { id: 'secondary', url: 'https://secondary.example.com', enabled: true },
        ],
      },
      maxAttempts: 2,
      retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
      retryOptions: { retryability: 'paid', idempotencySupported: true },
      execute: (endpoint) => httpRequest(
        {
          url: `${endpoint.url}/v1/images/generations`,
          method: 'POST',
          headers: {
            Authorization: 'Bearer sk-test',
            'Idempotency-Key': idempotencyKey,
          },
          body: { prompt: 'a cat' },
        },
        { maxRetries: 0, baseDelayMs: 0, factor: 1 },
        undefined,
        undefined,
        { retryability: 'paid', idempotencySupported: true },
      ),
    });

    expect(counting.attemptCount()).toBe(2);
    expect(counting.calls[0].headers['Idempotency-Key']).toBe(idempotencyKey);
    expect(counting.calls[1].headers['Idempotency-Key']).toBe(idempotencyKey);
  });

  it('does not consume transport retries on 415 request_invalid', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(
      httpRequest(
        {
          url: 'https://example.local/v1/images/edits',
          method: 'POST',
          headers: { Authorization: 'Bearer sk-test', 'Idempotency-Key': 'imagen-key' },
          body: { prompt: 'edit' },
        },
        { maxRetries: 3, baseDelayMs: 0, factor: 1 },
        undefined,
        undefined,
        { retryability: 'paid', idempotencySupported: true },
      ),
    ).rejects.toThrow('Unsupported Media Type');

    expect(counting.attemptCount()).toBe(1);
  });
});
