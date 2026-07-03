import { describe, expect, it } from 'vitest';
import {
  VALID_TRANSPARENT_PNG,
  createBridge,
  createFakeModules,
  providerPolicy,
  resolveAssetBytes,
  withObjectUrlMock,
} from './host-bridge-harness';

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
});
