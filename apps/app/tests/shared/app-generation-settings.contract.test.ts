import { describe, expect, it } from 'vitest';
import {
  createMemoryGenerationSettingsStore,
  normalizeAppGenerationSettings,
} from '../../src/shared/ports/app-generation-settings';

describe('app generation settings normalization', () => {
  it('normalizes generation preferences', async () => {
    expect(normalizeAppGenerationSettings({})).toEqual({
      providerInputSizePreset: '1k',
    });
    expect(normalizeAppGenerationSettings({ providerInputSizePreset: '2k' })).toEqual({
      providerInputSizePreset: '2k',
    });
    expect(normalizeAppGenerationSettings({ providerInputSizePreset: '4k' })).toEqual({
      providerInputSizePreset: '4k',
    });

    const store = createMemoryGenerationSettingsStore();
    await store.save({
      providerInputSizePreset: '4k',
    });

    expect(await store.load()).toEqual({
      providerInputSizePreset: '4k',
    });
  });
});
