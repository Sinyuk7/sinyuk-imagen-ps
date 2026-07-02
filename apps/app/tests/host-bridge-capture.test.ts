import { describe, expect, it } from 'vitest';
import {
  VALID_TRANSPARENT_PNG,
  createBridge,
  createFakeModules,
  providerPolicy,
  resolveAssetBytes,
} from './host-bridge-harness';

describe('PhotoshopHostBridge fake harness — capture', () => {
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
});
