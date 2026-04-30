import { describe, expect, it } from 'vitest';

import { parseResponse } from '../src/transport/openai-compatible/parse-response.js';

describe('parseResponse', () => {
  it('returns assets with png defaults when output_format is absent', () => {
    const result = parseResponse({
      data: [{ url: 'https://example.com/a.png' }],
    });

    expect(result.assets).toEqual([
      {
        type: 'image',
        name: 'generated-1.png',
        url: 'https://example.com/a.png',
        mimeType: 'image/png',
      },
    ]);
    expect('created' in result).toBe(false);
    expect('usage' in result).toBe(false);
    expect('metadata' in result).toBe(false);
  });

  it('derives mimeType and extension from output_format=webp', () => {
    const result = parseResponse({
      data: [{ b64_json: 'AAA' }],
      output_format: 'webp',
    });

    expect(result.assets).toEqual([
      {
        type: 'image',
        name: 'generated-1.webp',
        data: 'AAA',
        mimeType: 'image/webp',
      },
    ]);
    expect(result.metadata).toEqual({ outputFormat: 'webp' });
  });

  it('derives mimeType and extension from output_format=jpeg', () => {
    const result = parseResponse({
      data: [{ b64_json: 'AAA' }],
      output_format: 'jpeg',
    });

    expect(result.assets[0]?.name).toBe('generated-1.jpg');
    expect(result.assets[0]?.mimeType).toBe('image/jpeg');
  });

  it('exposes created, usage, and metadata when upstream provides them', () => {
    const result = parseResponse({
      created: 1713833628,
      data: [{ b64_json: 'AAA' }],
      output_format: 'png',
      quality: 'high',
      size: '1024x1024',
      background: 'transparent',
      usage: {
        input_tokens: 50,
        output_tokens: 50,
        total_tokens: 100,
        input_tokens_details: { image_tokens: 40, text_tokens: 10 },
        output_tokens_details: { image_tokens: 50, text_tokens: 0 },
      },
    });

    expect(result.created).toBe(1713833628);
    expect(result.usage).toEqual({
      inputTokens: 50,
      outputTokens: 50,
      totalTokens: 100,
      inputTokensDetails: { imageTokens: 40, textTokens: 10 },
      outputTokensDetails: { imageTokens: 50, textTokens: 0 },
    });
    expect(result.metadata).toEqual({
      background: 'transparent',
      outputFormat: 'png',
      quality: 'high',
      size: '1024x1024',
    });
  });

  it('omits usage when core fields are missing', () => {
    const result = parseResponse({
      data: [{ b64_json: 'AAA' }],
      usage: { input_tokens: 50 }, // missing output_tokens / total_tokens
    });

    expect('usage' in result).toBe(false);
  });

  it('omits usage details when partial', () => {
    const result = parseResponse({
      data: [{ b64_json: 'AAA' }],
      usage: {
        input_tokens: 50,
        output_tokens: 50,
        total_tokens: 100,
        input_tokens_details: { image_tokens: 40 }, // missing text_tokens
      },
    });

    expect(result.usage).toEqual({
      inputTokens: 50,
      outputTokens: 50,
      totalTokens: 100,
    });
  });

  it('omits metadata entirely when no metadata fields are present', () => {
    const result = parseResponse({
      data: [{ b64_json: 'AAA' }],
    });

    expect('metadata' in result).toBe(false);
  });

  it('throws invalid_response for missing data array', () => {
    expect(() => parseResponse({ created: 1 })).toThrowError(/missing "data"/);
  });

  it('throws invalid_response for non-object root', () => {
    expect(() => parseResponse(null)).toThrowError(/not a JSON object/);
  });

  it('throws invalid_response when an item has neither url nor b64_json', () => {
    expect(() => parseResponse({ data: [{}] })).toThrowError(/missing both "url" and "b64_json"/);
  });
});
