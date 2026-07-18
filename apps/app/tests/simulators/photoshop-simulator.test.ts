import { describe, expect, it } from 'vitest';
import { createInMemoryAssetStore } from '../../src/adapters/uxp/in-memory-host-storage';
import { createPhotoshopSimulator } from '../../src/simulators/photoshop/simulator';

describe('Photoshop simulator ComfyUI capture', () => {
  it('materializes one raster image without mask data', async () => {
    const assetStore = createInMemoryAssetStore();
    const simulator = createPhotoshopSimulator(assetStore, 'comfyui-image');

    const capture = await simulator.captureActiveImage({ maxSide: 2_048 });
    const stored = capture.image.asset.storedRef;

    expect(capture).not.toHaveProperty('mask');
    expect(capture.image.asset.mimeType).toBe('image/png');
    expect(capture.image.metadata).toMatchObject({ width: 256, height: 160 });
    expect(stored).toMatchObject({ mimeType: 'image/png' });
    await expect(assetStore.resolve(stored!)).resolves.toBeInstanceOf(ArrayBuffer);
  });
});
