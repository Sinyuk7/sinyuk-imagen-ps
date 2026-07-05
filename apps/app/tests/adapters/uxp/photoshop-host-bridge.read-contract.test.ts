import { describe, expect, it } from 'vitest';
import {
  LEGACY_TRUNCATED_MOCK_PNG,
  VALID_TRANSPARENT_PNG,
  VALID_1024_JPEG,
  arrayBufferFromBytes,
  createBridge,
  createFakeModules,
  createThumbnailGenerator,
  decodePng,
  decodedPngRgbAt,
  providerPolicy,
  pngWithSize,
  realJpegWithSize,
  realPngWithSize,
  realRgbPngWithSize,
  resolveAssetBytes,
  rgbFilterRegressionPng,
  withObjectUrlMock,
} from '../../helpers/host-bridge-harness';

describe('PhotoshopHostBridge fake harness — layer read', () => {
  it('为图层列表按需生成可释放的小尺寸缩略图', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const thumbnail = await bridge.getLayerThumbnail(2, 48);

    expect(thumbnail).toBeDefined();
    expect(thumbnail!.url).toBe('blob:thumb-1');
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Get thumbnail for layer Child' });
    expect(spies.getPixels).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 48, height: 48 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });

    thumbnail!.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('未知图层或空 bounds 图层不生成缩略图', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.getLayerThumbnail(999)).resolves.toBeUndefined();
    await expect(bridge.getLayerThumbnail(3)).resolves.toBeUndefined();
    expect(spies.getPixels).not.toHaveBeenCalled();
  });

  it('列出 Photoshop layer tree 并保留 mask/visible 元数据', async () => {
    const { modules } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.listLayers()).resolves.toEqual([
      {
        id: 1,
        name: 'Group',
        kind: 'group',
        visible: true,
        children: [
          {
            id: 2,
            name: 'Child',
            kind: 'pixel',
            visible: false,
            hasUserMask: true,
            bounds: { left: 0, top: 0, right: 64, bottom: 64 },
          },
          {
            id: 3,
            name: 'Empty',
            kind: 'pixel',
            visible: true,
            bounds: { left: 0, top: 0, right: 0, bottom: 0 },
          },
        ],
      },
    ]);
  });

  it('通过 imaging 读取 layer，并在 mask 为 grayscale 时安全跳过预览编码', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const layerAsset = await bridge.readLayerAsAsset(2, providerPolicy);
    expect(layerAsset).toMatchObject({
      asset: { type: 'image', name: 'layer-2.png', mimeType: 'image/png' },
      metadata: { source: 'layer', name: 'layer-2.png', mimeType: 'image/png' },
      payload: { kind: 'host-object' },
      photoshopPlacement: {
        snapshot: {
          documentId: 42,
          documentSize: { width: 512, height: 384 },
          layerId: 2,
          layerBoundsNoEffects: { left: 0, top: 0, right: 64, bottom: 64 },
          selectionBounds: null,
        },
        placementRect: { left: 0, top: 0, right: 64, bottom: 64 },
        providerInputPlan: expect.objectContaining({
          sourceWidth: 64,
          sourceHeight: 64,
          targetWidth: 2048,
          targetHeight: 2048,
          fit: 'preserve-ratio',
          maxSideBucket: 2048,
          effectiveMultiple: 2,
          maxSide: 2048,
          wasUpscaled: true,
        }),
      },
    });
    expect(layerAsset.asset.data).toBeUndefined();
    expect((await resolveAssetBytes(assetStore, layerAsset.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    await expect(bridge.readLayerMaskAsAsset(2)).resolves.toBeUndefined();

    expect(spies.getPixels).toHaveBeenNthCalledWith(1, {
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 64, height: 64 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, {
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 2048, height: 2048 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    expect(spies.getLayerMask).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      kind: 'user',
      componentSize: 8,
    });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer pixels' });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer mask' });
    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(2);
    expect(spies.disposeMask).toHaveBeenCalledTimes(1);
  });

  it('为 Photoshop 图层独立生成 bounded thumbnail derivative 和 provider derivative', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules({
      activeLayerBounds: { _left: 0, _top: 0, _right: 3000, _bottom: 1500 },
    });
    const { bridge } = createBridge(modules);

    const layerAsset = await bridge.readLayerAsAsset(2, providerPolicy);

    expect(layerAsset.resource.derivatives.thumbnail).toMatchObject({
      kind: 'ready',
      role: 'thumbnail',
      mimeType: 'image/png',
    });
    expect(layerAsset.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 1024,
      mimeType: 'image/png',
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 256, height: 128 },
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 2048, height: 1024 },
    }));
    expect(layerAsset.preview).toMatchObject({ kind: 'object-url', url: 'blob:thumb-1' });
    expect(create).toHaveBeenCalledTimes(1);
    layerAsset.preview.dispose?.();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('layer pixels 未转成 RGB 时返回清晰错误并释放 imageData', async () => {
    const { modules, spies } = createFakeModules({ layerColorSpace: 'Lab' });
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(2, providerPolicy)).rejects.toThrow('Photoshop capture requires RGB image data, got Lab.');

    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(1);
  });

  it('layer pixels 未按 8-bit 返回时给出清晰错误并释放 imageData', async () => {
    const { modules, spies } = createFakeModules({ layerData: new Uint16Array(64 * 64 * 4) });
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(2, providerPolicy)).rejects.toThrow('Photoshop capture requires 8-bit component data.');

    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(1);
  });

  it('读取空 bounds 图层前返回清晰错误', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(3, providerPolicy)).rejects.toThrow('Photoshop layer has no readable pixels: Empty');

    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.executeAsModal).not.toHaveBeenCalled();
  });


it('captureActiveImage materializes active layer as PNG with placement metadata', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    expect(capture.sourceKind).toBe('layer');
    expect(capture.image.asset).toMatchObject({
      type: 'image',
      name: 'photoshop-layer-2.png',
      mimeType: 'image/png',
    });
    expect(capture.image.asset.data).toBeUndefined();
    expect((await resolveAssetBytes(assetStore, capture.image.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(capture.placement.snapshot).toMatchObject({
      documentId: 42,
      documentSize: { width: 512, height: 384 },
      layerId: 2,
      layerBoundsNoEffects: { left: 0, top: 0, right: 64, bottom: 64 },
      selectionBounds: null,
    });
    expect(capture.placement.placementRect).toEqual({ left: 0, top: 0, right: 64, bottom: 64 });
    expect(capture.placement.providerInputPlan).toMatchObject({
      sourceWidth: 64,
      sourceHeight: 64,
      targetWidth: 2048,
      targetHeight: 2048,
      wasUpscaled: true,
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 64, height: 64 },
      applyAlpha: false,
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 2048, height: 2048 },
      applyAlpha: false,
    }));
    expect(spies.getSelection).not.toHaveBeenCalled();
  });

  it('captureActiveImage pads Photoshop-trimmed pixel results back to requested frame', async () => {
    const { modules } = createFakeModules({
      pixelResultSourceBounds: { left: 8, top: 4, right: 24, bottom: 20 },
      pixelResultSize: { width: 16, height: 16 },
    });
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    const bytes = await resolveAssetBytes(assetStore, capture.image.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('captureActiveImage maps cached sourceBounds by pyramid level before padding', async () => {
    const { modules } = createFakeModules({
      pixelResultSourceBounds: { left: 4, top: 2, right: 12, bottom: 10 },
      pixelResultLevel: 1,
      pixelResultSize: { width: 8, height: 8 },
    });
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    const bytes = await resolveAssetBytes(assetStore, capture.image.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('captureActiveImage applies selection mask when selection bounds exist', async () => {
    const { modules, spies } = createFakeModules({
      selectionBounds: { left: 8, top: 8, right: 40, bottom: 40 },
    });
    const { bridge } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    expect(capture.sourceKind).toBe('selection');
    expect(capture.placement.snapshot.selectionBounds).toEqual({ left: 8, top: 8, right: 40, bottom: 40 });
    expect(capture.placement.placementRect).toEqual({ left: 8, top: 8, right: 40, bottom: 40 });
    expect(spies.getSelection).toHaveBeenCalledWith({
      documentID: 42,
      sourceBounds: { left: 8, top: 8, right: 40, bottom: 40 },
      targetSize: { width: 2048, height: 2048 },
      componentSize: 8,
    });
  });


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

  it('超出 app-local RGBA decode 门禁的 PNG thumbnail 回退到 host targetSize path', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'huge.png', mimeType: 'image/png' },
      bytes: pngWithSize(4097, 4097),
      mimeType: 'image/png',
      maxSide: 256,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-thumb-\d+\.png$/), { overwrite: true });
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
