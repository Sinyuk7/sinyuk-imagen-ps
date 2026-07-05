import { describe, expect, it } from 'vitest';
import { httpRequest } from '../../../src/transport/image-endpoint/http.js';
import { buildEditMultipartBodyForCodec } from '../../../src/transport/image-endpoint/build-request.js';
import { parseMultipartBody, withCapturedRequest } from '../../multipart-wire-harness.js';
import { imageEndpointModel } from '../../model-execution.js';
import { outputWithResolvedRequest } from '../../resolved-output.js';

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
          output: outputWithResolvedRequest({
            providerId: 'image-endpoint',
            modelId: 'gpt-image-2',
            operation: 'image_edit',
            imageSize: 'auto',
            ratio: 'auto',
            outputFormat: 'png',
            output: { count: 2 },
          }),
          model: imageEndpointModel('gpt-image-2'),
        },
        'multipart-bracket',
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
        'size',
        'output_format',
        'image[]',
        'image[]',
        'mask',
      ]);
      expect(parsed.parts[5]).toMatchObject({
        name: 'image[]',
        filename: 'first.png',
        mimeType: 'image/png',
        size: 5,
        order: 5,
      });
      expect(parsed.parts[6]).toMatchObject({
        name: 'image[]',
        filename: 'second.jpg',
        mimeType: 'image/jpeg',
        size: 5,
        order: 6,
      });
      expect(parsed.parts[7]).toMatchObject({
        name: 'mask',
        filename: 'mask.png',
        mimeType: 'image/png',
        size: 4,
        order: 7,
      });
      expect(parsed.parts[5]?.sha256).toHaveLength(64);
      expect(parsed.parts[6]?.sha256).toHaveLength(64);
      expect(parsed.parts[7]?.sha256).toHaveLength(64);
    });
  });
});
