import { describe, expect, it } from 'vitest';
import {
  LEGACY_TRUNCATED_MOCK_PNG,
  VALID_TRANSPARENT_PNG,
  VALID_1024_JPEG,
  arrayBufferFromBytes,
  createBridge,
  createFakeModules,
  pngWithSize,
  providerPolicy,
  realJpegWithSize,
  realPngWithSize,
  realRgbPngWithSize,
  resolveAssetBytes,
  withObjectUrlMock,
} from './host-bridge-harness';

describe('PhotoshopHostBridge fake harness — local file', () => {
  it('通过 UXP file picker 读取 image file', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile({ maxSide: 1024 });

    expect(spies.getFileForOpening).toHaveBeenCalledWith({
      types: ['png', 'jpg', 'jpeg', 'webp'],
      allowMultiple: false,
    });
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'picked.png',
      mimeType: 'image/png',
    });
    expect(asset?.asset.data).toBeUndefined();
    expect(asset?.asset.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/png', name: 'picked.png' });
    expect(asset?.metadata.source).toBe('file');
  });

  it('按 picker 文件名推断 JPEG MIME，避免后续 PNG 预检误判', async () => {
    const { modules } = createFakeModules({
      pickedFileName: 'picked.JPG',
      pickedFileData: arrayBufferFromBytes(VALID_1024_JPEG),
    });
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile({ maxSide: 1024 });

    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'picked.JPG',
      mimeType: 'image/jpeg',
    });
    expect(asset?.asset.data).toBeUndefined();
    expect(asset?.asset.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/jpeg', name: 'picked.JPG' });
  });

  it('拒绝 structurally unsafe picker image，避免坏 bytes 进入会话 attachment', async () => {
    const { modules } = createFakeModules({
      pickedFileName: 'picked.png',
      pickedFileData: arrayBufferFromBytes(LEGACY_TRUNCATED_MOCK_PNG),
    });
    const { bridge } = createBridge(modules);

    await expect(bridge.pickImageFile(providerPolicy)).rejects.toThrow('PNG asset chunk CRC is invalid.');
  });

  it('uses the app-local PNG derivative path for resized local files', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'tiny.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(512, 512)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Normalize local image for provider input' });
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.asset.storedRef).toMatchObject({
      kind: 'hostObject',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
      name: 'tiny.png',
    });
    expect(asset?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(asset?.asset.data).toBeUndefined();
  });

  it('uses the app-local JPEG derivative path for resized local files', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'tiny.jpg',
      pickedFileData: arrayBufferFromBytes(realJpegWithSize(512, 512)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Normalize local image for provider input' });
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
      name: 'tiny.png',
    });
    expect(asset?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('normalizes RGB PNG local files into RGBA before app-local resize', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'rgb.png',
      pickedFileData: arrayBufferFromBytes(realRgbPngWithSize(224, 225)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'rgb.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2016,
      height: 2025,
      mimeType: 'image/png',
      name: 'rgb.png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('downscales very large local files within the selected provider max side', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'large.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(3000, 1800)),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
  });

  it('routes oversized app-local PNG normalization through the host targetSize path', async () => withObjectUrlMock(async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'huge.png',
      pickedFileData: arrayBufferFromBytes(pngWithSize(4097, 4097)),
    });
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile({ maxSide: 1024 });

    expect(spies.openDocument).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenCalledWith(expect.objectContaining({
      documentID: 99,
      targetSize: { width: 256, height: 256 },
    }));
    expect(spies.getPixels).toHaveBeenCalledWith(expect.objectContaining({
      documentID: 99,
      targetSize: { width: 1024, height: 1024 },
    }));
    expect(spies.closeTempDocument).toHaveBeenCalledTimes(1);
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 1024,
      height: 1024,
      mimeType: 'image/png',
      name: 'huge.png',
    });
    expect(asset?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 1024,
      height: 1024,
      mimeType: 'image/png',
    });
  }));

  it('normalizes local files when only provider multiple/min-side policy changes size', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'wide.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(1201, 800)),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
  });

  it('为无需 provider resize 的本地文件仍生成 bounded thumbnail preview', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'ready.png',
      pickedFileData: arrayBufferFromBytes(pngWithSize(2048, 2048)),
    });
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(asset?.preview).toMatchObject({ kind: 'object-url', url: 'blob:thumb-1' });
    expect(asset?.asset.storedRef).toMatchObject({ name: 'ready.png', mimeType: 'image/png' });
    expect(create).toHaveBeenCalledTimes(1);
    asset?.preview.dispose?.();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('keeps WEBP on the host-native temp-document path until app-local support is proven', async () => withObjectUrlMock(async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x03, 0x00, 0xff, 0x03, 0x00,
    ]);
    const { modules, spies } = createFakeModules({
      pickedFileName: 'picked.webp',
      pickedFileData: arrayBufferFromBytes(webpBytes),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenCalled();
    expect(spies.closeTempDocument).toHaveBeenCalledTimes(1);
  }));
});
