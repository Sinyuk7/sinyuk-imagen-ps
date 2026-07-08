import { describe, expect, it } from 'vitest';
import {
  createMemoryGenerationSettingsStore,
  normalizeAppGenerationSettings,
} from '../../src/shared/ports/app-generation-settings';

describe('app generation settings normalization', () => {
  it('treats missing onboarding version as unseen and preserves saved seen state', async () => {
    expect(normalizeAppGenerationSettings({})).toEqual({
      providerInputSizePreset: '1k',
    });
    expect(normalizeAppGenerationSettings({
      providerInputSizePreset: '2k',
      settingsOnboardingSeenVersion: 1,
    })).toEqual({
      providerInputSizePreset: '2k',
      settingsOnboardingSeenVersion: 1,
    });
    expect(normalizeAppGenerationSettings({
      providerInputSizePreset: '4k',
      settingsOnboardingSeenVersion: 0,
    })).toEqual({
      providerInputSizePreset: '4k',
    });

    const store = createMemoryGenerationSettingsStore();
    await store.save({
      providerInputSizePreset: '4k',
      settingsOnboardingSeenVersion: 1,
    });

    expect(await store.load()).toEqual({
      providerInputSizePreset: '4k',
      settingsOnboardingSeenVersion: 1,
    });
  });
});
