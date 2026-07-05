import { describe, expect, it } from 'vitest';
import {
  VALID_TRANSPARENT_PNG,
  createBridge,
  createFakeModules,
  providerPolicy,
  resolveAssetBytes,
  withObjectUrlMock,
} from '../../helpers/host-bridge-harness';

describe('PhotoshopHostBridge read contract', () => {
  it('creates releasable thumbnails for readable layers and skips unknown or empty layers', async () => withObjectUrlMock(async ({ revoke }) => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const thumbnail = await bridge.getLayerThumbnail(2, 48);

    expect(thumbnail).toBeDefined();
    expect(thumbnail!.url).toBe('blob:thumb-1');
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

    await expect(bridge.getLayerThumbnail(999)).resolves.toBeUndefined();
    await expect(bridge.getLayerThumbnail(3)).resolves.toBeUndefined();
  }));

  it('lists the layer tree while preserving visibility, hierarchy, bounds, and mask metadata', async () => {
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

  it('reads layer pixels into host-owned assets with placement metadata and provider-input derivatives', async () => {
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
    expect((await resolveAssetBytes(assetStore, layerAsset.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(layerAsset.resource.derivatives.thumbnail).toMatchObject({
      kind: 'ready',
      role: 'thumbnail',
      mimeType: 'image/png',
    });
    expect(layerAsset.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 64, height: 64 },
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 2048, height: 2048 },
    }));
  });

  it('keeps local image ingestion on the app path when possible and rejects structurally unsafe picker assets', async () => {
    const tiny = createFakeModules({
      pickedFileName: 'tiny.png',
      pickedFileData: VALID_TRANSPARENT_PNG.buffer.slice(0),
    });
    const tinyBridge = createBridge(tiny.modules).bridge;

    const tinyAsset = await tinyBridge.pickImageFile(providerPolicy);
    expect(tinyAsset?.asset).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });

    const unsafe = createFakeModules({
      pickedFileName: 'picked.png',
      pickedFileData: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]).buffer,
    });
    const unsafeBridge = createBridge(unsafe.modules).bridge;

    await expect(unsafeBridge.pickImageFile(providerPolicy)).rejects.toThrow();
  });
});
