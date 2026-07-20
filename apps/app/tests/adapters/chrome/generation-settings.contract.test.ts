import { describe, expect, it } from 'vitest';
import { createChromeIndexedDbStorage, createMemoryIndexedDbBackend } from '../../../src/adapters/chrome/indexed-db-storage';

describe('Chrome generation settings storage', () => {
  it('reads and saves app settings', async () => {
    const backend = createMemoryIndexedDbBackend({
      initial: {
        appSettings: [
          {
            key: 'generation',
            value: {
              providerInputSizePreset: '2k',
            },
          },
        ],
      },
    });
    const storage = createChromeIndexedDbStorage({ backend });

    expect(await storage.generationSettings.load()).toEqual({ providerInputSizePreset: '2k' });

    await storage.generationSettings.save({ providerInputSizePreset: '4k' });

    expect(await storage.generationSettings.load()).toEqual({ providerInputSizePreset: '4k' });
  });
});
