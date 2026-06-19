import { describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import { httpRequest } from '../src/transport/image-endpoint/http.js';

describe('image endpoint HTTP logging', () => {
  it('logs retry events with transport context', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_http',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'retry later' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const result = await httpRequest(
      { url: 'https://api.example.com/v1/models', method: 'GET' },
      { maxRetries: 1, baseDelayMs: 0, factor: 1 },
      undefined,
      logger,
    );

    expect(result.response.status).toBe(200);
    const retry = sink.records.find((record) => record.event === 'retry');
    expect(retry).toMatchObject({
      package: 'providers',
      component: 'transport',
      trace_id: 'tr_http',
    });
    fetchSpy.mockRestore();
  });

  it('does not pass AbortSignal-like values without listener methods to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await httpRequest(
      { url: 'https://api.example.com/v1/models', method: 'GET' },
      { maxRetries: 0, baseDelayMs: 0, factor: 1 },
      { aborted: false } as AbortSignal,
    );

    expect(result.response.status).toBe(200);
    expect(fetchSpy.mock.calls[0]?.[1]).not.toHaveProperty('signal');
    fetchSpy.mockRestore();
  });
});
