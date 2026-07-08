import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { parseGeminiGenerateContentResponse } from '../src/transport/gemini-generate-content/parse-response.js';

function pngBytes(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

describe('parseGeminiGenerateContentResponse', () => {
  it('derives output metadata from inline image bytes', () => {
    const parsed = parseGeminiGenerateContentResponse({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: Buffer.from(pngBytes(1408, 768)).toString('base64'),
            },
          }],
        },
      }],
    });

    expect(parsed.metadata).toEqual({
      size: '1408x768',
      outputFormat: 'png',
    });
  });

  it('keeps output format metadata for file image references', () => {
    const parsed = parseGeminiGenerateContentResponse({
      candidates: [{
        content: {
          parts: [{
            fileData: {
              mimeType: 'image/jpeg',
              fileUri: 'https://example.com/generated.jpg',
            },
          }],
        },
      }],
    });

    expect(parsed.metadata).toEqual({
      outputFormat: 'jpeg',
    });
  });
});
