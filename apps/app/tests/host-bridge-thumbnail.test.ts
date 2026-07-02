import { describe, expect, it } from 'vitest';
import {
  createFakeModules,
  createThumbnailGenerator,
  decodePng,
  decodedPngRgbAt,
  realPngWithSize,
  rgbFilterRegressionPng,
  withObjectUrlMock,
} from './host-bridge-harness';

describe('PhotoshopHostBridge fake harness — provider output thumbnail', () => {
  it('为 PNG storedRef provider output 通过 app-local path 生成 bounded thumbnail', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'echo.png', mimeType: 'image/png' },
      bytes: realPngWithSize(4096, 2048),
      mimeType: 'image/png',
      maxSide: 256,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.writeTempFile).not.toHaveBeenCalled();
    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(spies.deleteTempFile).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    preview?.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('keeps RGB PNG filter 3/4 pixels stable through app-local decode and encode', async () => withObjectUrlMock(async ({ blobs }) => {
    const fixture = rgbFilterRegressionPng();
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'filtered-rgb.png', mimeType: 'image/png' },
      bytes: fixture.bytes,
      mimeType: 'image/png',
      maxSide: 512,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(1);

    const encoded = new Uint8Array(await blobs[0]!.arrayBuffer());
    const decoded = decodePng(encoded);

    expect(decoded.width).toBe(fixture.width);
    expect(decoded.height).toBe(fixture.height);
    expect(decoded.channels === 3 || decoded.channels === 4).toBe(true);
    expect(decodedPngRgbAt(decoded, 0)).toEqual([10, 20, 30]);
    expect(decodedPngRgbAt(decoded, 1)).toEqual([80, 90, 100]);
    expect(decodedPngRgbAt(decoded, 2)).toEqual([130, 140, 150]);
    expect(decodedPngRgbAt(decoded, 3)).toEqual([220, 230, 240]);

    const samplePixels = [0, 1, 4, 7];
    for (const pixel of samplePixels) {
      const source = pixel * 3;
      expect(decodedPngRgbAt(decoded, pixel)).toEqual([
        fixture.pixels[source],
        fixture.pixels[source + 1],
        fixture.pixels[source + 2],
      ]);
    }

    preview?.release();
  }));

  it('为 WEBP storedRef provider output 保留 host-native temp-document thumbnail path', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x03, 0x00, 0xff, 0x03, 0x00,
    ]);
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'echo.webp', mimeType: 'image/webp' },
      bytes: webpBytes,
      mimeType: 'image/webp',
      maxSide: 256,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-thumb-\d+\.webp$/), { overwrite: true });
    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(Uint8Array), { format: 'binary' });
    expect(spies.openDocument).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenCalledWith(expect.objectContaining({
      documentID: 99,
      targetSize: { width: 256, height: 256 },
    }));
    expect(spies.closeTempDocument).toHaveBeenCalledTimes(1);
    expect(spies.deleteTempFile).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    preview?.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));
});
