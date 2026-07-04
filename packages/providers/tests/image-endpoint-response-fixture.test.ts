import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseResponse } from '../src/transport/image-endpoint/parse-response.js';
import { httpRequest } from '../src/transport/image-endpoint/http.js';

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'image-endpoint-response', name), 'utf8'),
  );
}

describe('image endpoint response fixtures', () => {
  it('parses success fixtures with data[].url', () => {
    const fixture = loadFixture('success-url.json');
    const parsed = parseResponse(fixture);

    expect(parsed.assets).toEqual([
      {
        type: 'image',
        name: 'generated-1.png',
        url: 'https://example.com/generated.png',
        mimeType: 'image/png',
      },
    ]);
    expect(parsed.created).toBe(1720080000);
  });

  it('parses success fixtures with data[].b64_json', () => {
    const fixture = loadFixture('success-b64-json.json');
    const parsed = parseResponse(fixture);

    expect(parsed.assets).toEqual([
      {
        type: 'image',
        name: 'generated-1.jpg',
        data: 'YWJjMTIz',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(parsed.created).toBe(1720080001);
  });

  it('records current invalid fixture failures for empty data, missing data, and error envelopes', () => {
    expect(() => parseResponse(loadFixture('empty-data.json'))).toThrow('Response "data" array is empty.');
    expect(() => parseResponse(loadFixture('missing-data.json'))).toThrow('Response missing "data" array.');
    expect(() => parseResponse(loadFixture('error-envelope.json'))).toThrow('Response missing "data" array.');
  });

  it('records current invalid input failures for non-object and missing url+b64_json', () => {
    expect(() => parseResponse('not-json-object')).toThrow('Response is not a JSON object.');
    expect(() => parseResponse({ data: [{}] })).toThrow('Response data[0] missing both "url" and "b64_json".');
  });

  it('records the current httpRequest malformed-json fallback behavior', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => {
        throw new Error('decode failed');
      },
      text: async () => '{"broken":',
    } satisfies Partial<Response> as Response)));

    const result = await httpRequest({
      url: 'https://example.com/v1/images/generations',
      method: 'POST',
      body: { prompt: 'bad json' },
    }, { maxRetries: 0, baseDelayMs: 0, factor: 1 });

    expect(result.response.data).toBe('{"broken":');
    vi.unstubAllGlobals();
  });
});
