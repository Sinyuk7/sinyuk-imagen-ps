import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import { createImageEndpointProvider, imageEndpointDescriptor } from './../src/providers/image-endpoint/index.js';
import { executeWithEndpointFailover, resetEndpointRuntimeHealthForTesting } from './../src/transport/image-endpoint/failover.js';
import { httpRequest } from './../src/transport/image-endpoint/http.js';
import { createCountingFetch } from './counting-transport.js';
import { imageEndpointModel } from './model-execution.js';

const twoEndpointConnection = {
  selectionMode: 'auto' as const,
  endpoints: [
    { id: 'primary', url: 'https://primary.example.com', enabled: true },
    { id: 'secondary', url: 'https://secondary.example.com', enabled: true },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetEndpointRuntimeHealthForTesting();
});

describe('current attempt-sequence characterization', () => {
  it('records single-endpoint codec fallback after 415', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { data: [{ url: 'https://example.com/out.png' }] } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'fallback edit',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
        model: imageEndpointModel('gpt-image-2'),
      }),
    });

    expect(counting.calls.map((call, index) => ({
      endpointId: 'primary',
      codecId: index === 0 ? 'multipart-bracket' : 'json-reference',
      attemptIndex: index + 1,
      reason: index === 0 ? 'initial' : 'codec-fallback',
      failureClassification: index === 0 ? 'request_invalid:415' : 'success',
      nextDecision: index === 0 ? 'codec-fallback' : 'stop',
    }))).toEqual([
      {
        endpointId: 'primary',
        codecId: 'multipart-bracket',
        attemptIndex: 1,
        reason: 'initial',
        failureClassification: 'request_invalid:415',
        nextDecision: 'codec-fallback',
      },
      {
        endpointId: 'primary',
        codecId: 'json-reference',
        attemptIndex: 2,
        reason: 'codec-fallback',
        failureClassification: 'success',
        nextDecision: 'stop',
      },
    ]);
  });

  it('records that multi-endpoint configs stop after 415 and log recovery suppression', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'providers', component: 'attempt-sequence' },
      traceId: 'tr_attempt_sequence_multi_endpoint',
    });
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { data: [{ url: 'https://example.com/out.png' }] } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: twoEndpointConnection,
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    await expect(provider.invoke({
      config,
      logger,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'multi endpoint edit',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
        model: imageEndpointModel('gpt-image-2'),
      }),
    })).rejects.toThrow('Unsupported Media Type');

    expect(counting.calls).toHaveLength(1);
    const suppressionLog = sink.records.find((record) => record.event === 'image-edit.recovery_suppressed');
    expect(suppressionLog?.attrs).toMatchObject({
      endpointId: 'primary',
      codecId: 'multipart-bracket',
      reason: 'no_recovery_path',
    });
  });

  it('records same-endpoint 429 retry as the current paid behavior', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 429, headers: { 'retry-after': '0' }, data: { error: { message: 'Slow down' } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const result = await executeWithEndpointFailover({
      connection: twoEndpointConnection,
      maxAttempts: 2,
      retryPolicy: { maxRetries: 1, baseDelayMs: 0, factor: 1 },
      retryOptions: { retryability: 'paid', idempotencySupported: false },
      execute: (endpoint) => httpRequest({
        url: `${endpoint.url}/v1/models`,
        method: 'GET',
      }, { maxRetries: 0, baseDelayMs: 0, factor: 1 }),
    });

    expect(result.attempts.map((attempt, index) => ({
      endpointId: attempt.endpointId,
      codecId: 'n/a',
      attemptIndex: index + 1,
      reason: index === 0 ? 'initial' : 'retry',
      failureClassification: index === 0 ? `${attempt.kind}:${attempt.statusCode}` : 'success',
      nextDecision: index === 0 ? 'retry-same' : 'stop',
    }))).toEqual([
      {
        endpointId: 'primary',
        codecId: 'n/a',
        attemptIndex: 1,
        reason: 'initial',
        failureClassification: 'rate_limited:429',
        nextDecision: 'retry-same',
      },
      {
        endpointId: 'primary',
        codecId: 'n/a',
        attemptIndex: 2,
        reason: 'retry',
        failureClassification: 'success',
        nextDecision: 'stop',
      },
    ]);
  });

  it.each([
    { status: 502, message: 'Bad Gateway' },
    { status: 503, message: 'Unavailable' },
    { status: 504, message: 'Gateway Timeout' },
  ])('records that paid non-idempotent %s now stop without cross-endpoint failover', async ({ status, message }) => {
    const counting = createCountingFetch([
      { kind: 'response', status, data: { error: { message } } },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    await expect(provider.invoke({
      config: provider.validateConfig({
        providerId: 'image-endpoint',
        displayName: 'Image Endpoint',
        family: 'image-endpoint',
        connection: twoEndpointConnection,
        apiKey: 'test-key',
        defaultModel: 'gpt-image-2',
      }),
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'characterize paid failover',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
        model: imageEndpointModel('gpt-image-2'),
      }),
    })).rejects.toThrow(message);

    expect(counting.calls).toHaveLength(1);
  });

  it('records timeout as a terminal failure with no failover', async () => {
    const counting = createCountingFetch([{ kind: 'timeout' }, { kind: 'response', status: 200, data: { ok: true } }]);
    vi.stubGlobal('fetch', counting.fetch);

    await expect(executeWithEndpointFailover({
      connection: twoEndpointConnection,
      maxAttempts: 2,
      retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
      retryOptions: { retryability: 'paid', idempotencySupported: false },
      execute: (endpoint) => httpRequest({
        url: `${endpoint.url}/v1/images/generations`,
        method: 'POST',
        body: { prompt: 'timeout' },
      }, { maxRetries: 0, baseDelayMs: 0, factor: 1 }),
    })).rejects.toThrow();

    expect(counting.calls).toHaveLength(1);
  });

  it('records that network_error stops without idempotency support', async () => {
    const counting = createCountingFetch([
      { kind: 'network_error' },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    await expect(provider.invoke({
      config: provider.validateConfig({
        providerId: 'image-endpoint',
        displayName: 'Image Endpoint',
        family: 'image-endpoint',
        connection: twoEndpointConnection,
        apiKey: 'test-key',
        defaultModel: 'gpt-image-2',
      }),
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'network-error-no-idem',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
        model: imageEndpointModel('gpt-image-2'),
      }),
    })).rejects.toThrow();

    expect(counting.calls).toHaveLength(1);
  });

  it('records that network_error also stops when idempotency is supported', async () => {
    const counting = createCountingFetch([
      { kind: 'network_error' },
      { kind: 'response', status: 200, data: { ok: true } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const originalTransport = imageEndpointDescriptor.transport;
    try {
      imageEndpointDescriptor.transport = {
        ...originalTransport,
        idempotency: 'supported',
        wire: originalTransport?.wire,
      };
      await expect(provider.invoke({
        config: provider.validateConfig({
          providerId: 'image-endpoint',
          displayName: 'Image Endpoint',
          family: 'image-endpoint',
          connection: twoEndpointConnection,
          apiKey: 'test-key',
          defaultModel: 'gpt-image-2',
        }),
        request: provider.validateRequest({
          operation: 'image_edit',
          prompt: 'network-error-idem',
          images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
          model: imageEndpointModel('gpt-image-2'),
        }),
      })).rejects.toThrow();
    } finally {
      imageEndpointDescriptor.transport = originalTransport;
    }

    expect(counting.calls).toHaveLength(1);
  });
});
