import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { createChromeHostPort } from '../../../src/adapters/chrome/chrome-host-port';
import { createInMemoryAssetStore } from '../../../src/adapters/uxp/in-memory-host-storage';
import { createPhotoshopSimulator } from '../../../src/simulators/photoshop/simulator';

describe('ChromeHostPort', () => {
  it('preserves inspected local image dimensions for ComfyUI execution', async () => {
    const bytes = encode({
      width: 2,
      height: 3,
      data: new Uint8Array(2 * 3 * 4).fill(255),
    });
    const assetStore = createInMemoryAssetStore();
    const file = new File([bytes], 'input.png', { type: 'image/png' });
    const host = createChromeHostPort({
      assetStore,
      filePicker: { async pick() { return file; } },
      simulator: createPhotoshopSimulator(assetStore),
    });

    const image = await host.pickImageFile({ maxSide: 1_024 });

    expect(image?.metadata).toMatchObject({ width: 2, height: 3 });
    expect(image?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      width: 2,
      height: 3,
      storedRef: { name: 'input.png', mimeType: 'image/png' },
    });
  });
});
