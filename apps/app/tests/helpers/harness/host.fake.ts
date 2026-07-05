import { vi } from 'vitest';
import { PHOTOSHOP_UXP_RUNTIME_CAPABILITIES, type HostBridge } from '../../../src/app-services/host-bridge';
import { fakeHostImage } from '../fixtures/assets.fixtures';

export function createHostFake() {
  const listLayers = vi.fn(async () => [{ id: 1, name: 'Layer 1', kind: 'pixel', visible: true }]);
  const pickImageFile = vi.fn(async () => fakeHostImage);
  const captureActiveImage = vi.fn(async () => ({
    image: fakeHostImage,
    sourceKind: 'layer' as const,
    placement: {
      snapshot: {
        documentId: 42,
        documentSize: { width: 1024, height: 768 },
        layerId: 1,
        layerBoundsNoEffects: { left: 10, top: 20, right: 266, bottom: 276 },
        selectionBounds: null,
      },
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    },
  }));
  const readLayerAsAsset = vi.fn(async () => ({
    ...fakeHostImage,
    photoshopPlacement: {
      snapshot: {
        documentId: 42,
        documentSize: { width: 1024, height: 768 },
        layerId: 1,
        layerBoundsNoEffects: { left: 10, top: 20, right: 266, bottom: 276 },
        selectionBounds: null,
      },
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    },
  }));
  const placeAssetOnCanvas = vi.fn(async () => undefined);
  const saveAssetToFile = vi.fn(async () => undefined);

  const host: HostBridge = {
    capabilities: PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,
    listLayers,
    pickImageFile,
    captureActiveImage,
    readLayerAsAsset,
    readLayerMaskAsAsset: vi.fn(async () => undefined),
    placeAssetOnCanvas,
    saveAssetToFile,
    getLayerThumbnail: vi.fn(async () => undefined),
  };

  return {
    host,
    spies: {
      listLayers,
      pickImageFile,
      captureActiveImage,
      readLayerAsAsset,
      placeAssetOnCanvas,
      saveAssetToFile,
    },
  };
}
