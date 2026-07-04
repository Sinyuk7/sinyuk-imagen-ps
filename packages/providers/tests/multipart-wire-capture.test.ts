import { describe, expect, it } from 'vitest';
import { httpRequest } from '../src/transport/image-endpoint/http.js';
import { buildEditMultipartBodyForCodec } from '../src/transport/image-endpoint/build-request.js';
import { parseMultipartBody, withCapturedRequest } from './multipart-wire-harness.js';

describe('multipart wire capture characterization (Node FormData only)', () => {
  it('captures multipart boundary and normalized parts via a local Node HTTP server', async () => {
    await withCapturedRequest(async (serverUrl, readCaptured) => {
      const body = buildEditMultipartBodyForCodec(
        {
          operation: 'image_edit',
          prompt: 'wire capture',
          images: [
            { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png', name: 'first.png' },
            { type: 'image', data: 'd29ybGQ=', mimeType: 'image/jpeg', name: 'second.jpg' },
          ],
          maskImage: { type: 'image', data: 'bWFzaw==', mimeType: 'image/png', name: 'mask.png' },
          output: {
            count: 2,
            outputFormat: 'png',
          },
        },
        'multipart-bracket',
        'gpt-image-2',
      );

      await httpRequest({
        url: `${serverUrl}/capture`,
        method: 'POST',
        body,
      }, { maxRetries: 0, baseDelayMs: 0, factor: 1 });

      const captured = await readCaptured();
      const contentType = Array.isArray(captured.headers['content-type'])
        ? captured.headers['content-type'][0]
        : captured.headers['content-type'];
      const parsed = parseMultipartBody(contentType, captured.body);

      expect(contentType).toContain(`boundary=${parsed.boundary}`);
      expect(parsed.parts.every((part) => part.contentDisposition.startsWith('form-data;'))).toBe(true);
      expect(parsed.parts.map((part) => part.name)).toEqual([
        'model',
        'prompt',
        'n',
        'output_format',
        'image[]',
        'image[]',
        'mask',
      ]);
      expect(parsed.parts[4]).toMatchObject({
        name: 'image[]',
        filename: 'first.png',
        mimeType: 'image/png',
        size: 5,
        order: 4,
      });
      expect(parsed.parts[5]).toMatchObject({
        name: 'image[]',
        filename: 'second.jpg',
        mimeType: 'image/jpeg',
        size: 5,
        order: 5,
      });
      expect(parsed.parts[6]).toMatchObject({
        name: 'mask',
        filename: 'mask.png',
        mimeType: 'image/png',
        size: 4,
        order: 6,
      });
      expect(parsed.parts[4]?.sha256).toHaveLength(64);
      expect(parsed.parts[5]?.sha256).toHaveLength(64);
      expect(parsed.parts[6]?.sha256).toHaveLength(64);
    });
  });
});
