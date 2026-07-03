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

  it('removes all Content-Type variants when body is FormData', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = new FormData();
    body.append('prompt', 'test');

    await httpRequest({
      url: 'https://api.example.com/v1/images/edits',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        Accept: 'application/json',
        'X-Test': '1',
        'Content-Type': 'text/plain',
        'content-type': 'application/xml',
      },
      body,
    });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.body).toBe(body);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test',
      Accept: 'application/json',
      'X-Test': '1',
    });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    expect(init?.headers).not.toHaveProperty('content-type');
    fetchSpy.mockRestore();
  });

  it('keeps JSON requests on application/json', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await httpRequest({
      url: 'https://api.example.com/v1/images/generations',
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: { prompt: 'test' },
    });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe(JSON.stringify({ prompt: 'test' }));
    fetchSpy.mockRestore();
  });

  it('logs multipart request and response summaries without leaking payload values', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_http_summary',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ url: 'https://example.com/out.png' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = new FormData();
    body.append('prompt', 'make it blue');
    body.append('image[]', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'input.png');

    await httpRequest(
      {
        url: 'https://api.example.com/v1/images/edits',
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-secret',
          Accept: 'application/json',
          'Content-Type': 'text/plain',
        },
        body,
      },
      { maxRetries: 0, baseDelayMs: 0, factor: 1 },
      undefined,
      logger,
    );

    const requestSummary = sink.records.find((record) => record.event === 'transport.request_summary');
    expect(requestSummary?.attrs).toMatchObject({
      method: 'POST',
      targetHost: 'api.example.com',
      targetPath: '/v1/images/edits',
      requestContentTypeMode: 'multipart-auto',
      removedExplicitContentType: true,
      bodyKind: 'multipart',
      bodyConstructorName: 'FormData',
      bodyFieldNames: ['prompt', 'image[]'],
      bodyTextFieldNames: ['prompt'],
      bodyFileFieldNames: ['image[]'],
      bodyFileFieldCounts: { 'image[]': 1 },
    });

    const responseSummary = sink.records.find((record) => record.event === 'transport.response_summary');
    expect(responseSummary?.attrs).toMatchObject({
      statusCode: 200,
      ok: true,
      targetHost: 'api.example.com',
      targetPath: '/v1/images/edits',
      responseContentType: 'application/json',
      parsedResponseKind: 'json',
      responseBodyKind: 'object',
      responseBodyTopLevelKeys: ['data'],
    });

    const serialized = JSON.stringify(sink.records);
    expect(serialized).not.toContain('make it blue');
    expect(serialized).not.toContain('test-secret');
    expect(serialized).not.toContain('input.png');
    fetchSpy.mockRestore();
  });
});
