import { beforeEach, describe, expect, it } from 'vitest';
import { listProfileModels, reconcileProfileModels } from './profile-models.js';
import { setProviderProfileRepository, setUserModelConfigRepository } from '../runtime.js';
import type { ProviderProfile, ProviderProfileRepository, UserModelConfig, UserModelConfigRepository } from './types.js';

const baseProfile: ProviderProfile = {
  profileId: 'profile-a',
  apiFormat: 'openai-images',
  displayName: 'Profile A',
  enabled: true,
  config: { apiFormat: 'openai-images', displayName: 'Profile A' },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

function createProfileRepository(profiles: readonly ProviderProfile[]): ProviderProfileRepository {
  return {
    async list() {
      return profiles;
    },
    async get(profileId) {
      return profiles.find((profile) => profile.profileId === profileId);
    },
    async save() {
      throw new Error('Unexpected profile save.');
    },
    async delete() {
      throw new Error('Unexpected profile delete.');
    },
  };
}

function createUserConfigRepository(configs: readonly UserModelConfig[]): UserModelConfigRepository {
  return {
    async list(profileId) {
      return configs.filter((config) => config.profileId === profileId);
    },
    async get(profileId, modelId) {
      return configs.find((config) => config.profileId === profileId && config.modelId === modelId);
    },
    async save() {
      throw new Error('Unexpected user config save.');
    },
    async delete() {
      throw new Error('Unexpected user config delete.');
    },
    async deleteProfile() {
      throw new Error('Unexpected profile config delete.');
    },
  };
}

function config(profileId: string, modelId: string): UserModelConfig {
  return {
    profileId,
    apiFormat: 'openai-images',
    modelId,
    baseModelId: 'gpt-image-2',
    wireModelId: `${profileId}-${modelId}-wire`,
    requestStrategyId: 'image-endpoint-default',
    outputExposure: {
      kind: 'flexible-pixels',
      sizePresetIds: ['auto', '1k'],
      outputFormats: ['png'],
      allowInputDerivedExactSize: true,
    },
    outputMatrix: [],
  };
}

describe('profile models', () => {
  beforeEach(() => {
    setProviderProfileRepository(createProfileRepository([
      baseProfile,
      {
        ...baseProfile,
        profileId: 'profile-b',
        displayName: 'Profile B',
        config: { apiFormat: 'openai-images', displayName: 'Profile B' },
      },
    ]));
  });

  it('lists only current profile-owned configured models', async () => {
    setUserModelConfigRepository(createUserConfigRepository([
      config('profile-a', 'owned-a'),
      config('profile-b', 'owned-b'),
    ]));

    const result = await listProfileModels('profile-a');

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.map((model) => model.modelId) : []).toEqual(['owned-a']);
    expect(result.ok ? result.value[0] : null).not.toHaveProperty('default');
    expect(result.ok ? result.value[0] : null).not.toHaveProperty('selected');
    expect(result.ok ? result.value[0]?.configSource : null).toBe('user');
  });

  it('does not attach profile-level selection state to configured models', async () => {
    setProviderProfileRepository(createProfileRepository([{ ...baseProfile }]));
    setUserModelConfigRepository(createUserConfigRepository([config('profile-a', 'owned-a')]));

    const result = await listProfileModels('profile-a');

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value[0] : null).not.toHaveProperty('selected');
    expect(result.ok ? result.value[0] : null).not.toHaveProperty('default');
  });

  it('keeps official presets as labels only, not ownership truth', () => {
    const items = reconcileProfileModels({
      userModelConfigs: [config('profile-a', 'owned-a')],
      officialCatalogDisplayNames: new Map([['gpt-image-2', 'GPT Image 2']]),
    });

    expect(items.map((item) => item.modelId)).toEqual(['owned-a']);
    expect(items[0]?.displayName).toBe('GPT Image 2');
    expect(items[0]?.configSource).toBe('user');
  });
});
