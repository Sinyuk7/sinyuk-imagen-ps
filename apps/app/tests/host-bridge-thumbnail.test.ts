import { describe, expect, it } from 'vitest';
import {
  createFakeModules,
  createThumbnailGenerator,
  realPngWithSize,
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
