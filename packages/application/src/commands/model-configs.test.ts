import { beforeEach, describe, expect, it } from 'vitest';
import { deleteUserModelConfig, getUserModelConfig, listUserModelConfigs, saveUserModelConfig } from './model-configs.js';
import { deleteProviderProfile } from './provider-profiles.js';
import { setProviderProfileRepository, setUserModelConfigRepository } from '../runtime.js';
import type { ProviderProfile, ProviderProfileRepository, UserModelConfig, UserModelConfigRepository } from './types.js';

const openaiProfile: ProviderProfile = {
  profileId: 'profile-openai',
  apiFormat: 'openai-images',
  displayName: 'OpenAI',
  enabled: true,
  config: { apiFormat: 'openai-images', displayName: 'OpenAI' },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

const geminiProfile: ProviderProfile = {
  profileId: 'profile-gemini',
  apiFormat: 'gemini-generate-content',
  displayName: 'Gemini',
  enabled: true,
  config: { apiFormat: 'gemini-generate-content', displayName: 'Gemini' },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

function createProviderProfileRepository(profiles: readonly ProviderProfile[]): {
  readonly repository: ProviderProfileRepository;
  readonly values: readonly ProviderProfile[];
} {
  let values = [...profiles];
  return {
    get values() {
      return values;
    },
    repository: {
      async list() {
        return values;
      },
      async get(profileId) {
        return values.find((profile) => profile.profileId === profileId);
      },
      async save(profile) {
        values = [
          ...values.filter((item) => item.profileId !== profile.profileId),
          profile,
        ];
      },
      async delete(profileId) {
        values = values.filter((profile) => profile.profileId !== profileId);
      },
    },
  };
}

function createUserConfigRepository(initial: readonly UserModelConfig[] = []): {
  readonly repository: UserModelConfigRepository;
  readonly saved: readonly UserModelConfig[];
  readonly deletedProfileIds: readonly string[];
} {
  const values: UserModelConfig[] = [...initial];
  const deletedProfileIds: string[] = [];
  return {
    get saved() {
      return values;
    },
    get deletedProfileIds() {
      return deletedProfileIds;
    },
    repository: {
      async list(profileId) {
        return values.filter((config) => config.profileId === profileId);
      },
      async get(profileId, modelId) {
        return values.find((config) => config.profileId === profileId && config.modelId === modelId);
      },
      async save(config) {
        values.push(config);
      },
      async delete(profileId, modelId) {
        const index = values.findIndex((config) => config.profileId === profileId && config.modelId === modelId);
        if (index >= 0) {
          values.splice(index, 1);
        }
      },
      async deleteProfile(profileId) {
        deletedProfileIds.push(profileId);
        for (let index = values.length - 1; index >= 0; index -= 1) {
          if (values[index]?.profileId === profileId) {
            values.splice(index, 1);
          }
        }
      },
    },
  };
}

describe('model configs', () => {
  let saved: readonly UserModelConfig[];

  beforeEach(() => {
    const state = createUserConfigRepository();
    const profileState = createProviderProfileRepository([openaiProfile, geminiProfile]);
    saved = state.saved;
    setUserModelConfigRepository(state.repository);
    setProviderProfileRepository(profileState.repository);
  });

  it('saves exposure rules and derives runtime output projection', async () => {
    const result = await saveUserModelConfig({
      profileId: 'profile-gemini',
      apiFormat: 'gemini-generate-content',
      modelId: 'limited-gemini',
      baseModelId: 'gemini-3.1-flash-image',
      wireModelId: 'limited-gemini',
      requestStrategyId: 'gemini-generate-content-image-config',
      outputExposure: {
        kind: 'ratio-resolution',
        aspectRatios: ['1:1'],
        resolutions: ['2k'],
        outputFormats: ['png'],
      },
    });

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    const config = result.ok ? result.value : null;
    expect(config?.outputExposure).toEqual({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1'],
      resolutions: ['2k'],
      outputFormats: ['png'],
    });
    expect(config?.outputMatrix.every((matrix) => matrix.cells.every((cell) => {
      if (cell.selection.geometry.kind === 'provider-default') {
        return cell.outputFormat === 'png';
      }
      return cell.selection.geometry.kind === 'ratio-resolution' &&
        cell.selection.geometry.aspectRatio === '1:1' &&
        cell.selection.geometry.resolution === '2k' &&
        cell.outputFormat === 'png';
    }))).toBe(true);
  });

  it('rejects authored outputMatrix on save input', async () => {
    const result = await saveUserModelConfig({
      profileId: 'profile-openai',
      apiFormat: 'openai-images',
      modelId: 'legacy-matrix-author',
      baseModelId: 'gpt-image-2',
      wireModelId: 'legacy-matrix-author',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', 'use-input-size', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
      outputMatrix: [],
    } as Parameters<typeof saveUserModelConfig>[0] & { readonly outputMatrix: readonly [] });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toContain('authored outputMatrix');
  });

  it('requires wireModelId', async () => {
    const result = await saveUserModelConfig({
      profileId: 'profile-openai',
      apiFormat: 'openai-images',
      modelId: 'gpt-image-2',
      baseModelId: 'gpt-image-2',
      wireModelId: '   ',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', 'use-input-size', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toContain('wireModelId');
  });

  it('rejects orphan configs before writing', async () => {
    const result = await saveUserModelConfig({
      profileId: 'missing-profile',
      apiFormat: 'openai-images',
      modelId: 'gpt-image-2',
      baseModelId: 'gpt-image-2',
      wireModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toBe('profile not found');
    expect(saved).toHaveLength(0);
  });

  it('lists and gets configs by profile-owned identity', async () => {
    await saveUserModelConfig({
      profileId: 'profile-openai',
      apiFormat: 'openai-images',
      modelId: 'shared-model',
      baseModelId: 'gpt-image-2',
      wireModelId: 'openai-shared-wire',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
    });
    await saveUserModelConfig({
      profileId: 'profile-gemini',
      apiFormat: 'gemini-generate-content',
      modelId: 'shared-model',
      baseModelId: 'gemini-3.1-flash-image',
      wireModelId: 'gemini-shared-wire',
      requestStrategyId: 'gemini-generate-content-image-config',
      outputExposure: {
        kind: 'ratio-resolution',
        aspectRatios: ['1:1'],
        resolutions: ['1k'],
        outputFormats: ['png'],
      },
    });

    const openaiList = await listUserModelConfigs('profile-openai');
    const geminiConfig = await getUserModelConfig('profile-gemini', 'shared-model');

    expect(openaiList.ok ? openaiList.value.map((config) => config.wireModelId) : []).toEqual(['openai-shared-wire']);
    expect(geminiConfig.ok ? geminiConfig.value?.wireModelId : null).toBe('gemini-shared-wire');
  });

  it('clears profile defaultModelId when deleting the current default config', async () => {
    const config: UserModelConfig = {
      profileId: 'profile-openai',
      apiFormat: 'openai-images',
      modelId: 'gpt-image-2',
      baseModelId: 'gpt-image-2',
      wireModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
      outputMatrix: [],
    };
    const userState = createUserConfigRepository([config]);
    const profileState = createProviderProfileRepository([{ ...openaiProfile, defaultModelId: 'gpt-image-2' }]);
    setUserModelConfigRepository(userState.repository);
    setProviderProfileRepository(profileState.repository);

    const result = await deleteUserModelConfig('profile-openai', 'gpt-image-2');

    expect(result.ok).toBe(true);
    expect(userState.saved).toHaveLength(0);
    expect(profileState.values[0]).not.toHaveProperty('defaultModelId');
  });

  it('cascades user model config deletion when deleting a profile', async () => {
    const userState = createUserConfigRepository([]);
    const profileState = createProviderProfileRepository([openaiProfile]);
    setUserModelConfigRepository(userState.repository);
    setProviderProfileRepository(profileState.repository);

    const result = await deleteProviderProfile('profile-openai');

    expect(result.ok).toBe(true);
    expect(profileState.values).toHaveLength(0);
    expect(userState.deletedProfileIds).toEqual(['profile-openai']);
  });
});
