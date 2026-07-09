import { vi } from 'vitest';
import type {
  OfficialModelPreset,
  ProfileModelItem,
  SaveUserModelConfigInput,
  UserModelConfig,
} from '@imagen-ps/application';
import {
  deleteModelGenerationPreference,
  getModelGenerationSettings,
  saveModelGenerationPreference,
  setModelGenerationPreferenceRepository,
  setUserModelConfigRepository,
} from '@imagen-ps/application';
import { createMemoryModelGenerationPreferenceRepository } from '../../../src/shared/ports/model-generation-preferences';
import {
  fakeOfficialModelConfigPresets,
  fakeUserModelConfigs,
} from '../fixtures/model-catalog.fixtures';
import {
  fakeProfileModelItems,
  fakeRequestStrategies,
} from '../fixtures/provider.fixtures';

export function createModelConfigRepositoryFake(options?: {
  readonly userModelConfigs?: readonly UserModelConfig[];
  readonly officialModelConfigPresets?: readonly OfficialModelPreset[];
  readonly profileModelItems?: readonly ProfileModelItem[];
}) {
  const modelGenerationPreferences = createMemoryModelGenerationPreferenceRepository();
  setModelGenerationPreferenceRepository(modelGenerationPreferences);

  let userModelConfigs: readonly UserModelConfig[] = options?.userModelConfigs ?? fakeUserModelConfigs;
  const officialModelConfigPresets = options?.officialModelConfigPresets ?? fakeOfficialModelConfigPresets;
  setUserModelConfigRepository({
    async list(profileId) {
      return userModelConfigs.filter((config) => config.profileId === profileId);
    },
    async get(profileId, modelId) {
      return userModelConfigs.find((config) => config.profileId === profileId && config.modelId === modelId);
    },
    async save(config) {
      userModelConfigs = [
        ...userModelConfigs.filter((item) => !(item.profileId === config.profileId && item.modelId === config.modelId)),
        config,
      ];
    },
    async delete(profileId, modelId) {
      userModelConfigs = userModelConfigs.filter((config) => !(config.profileId === profileId && config.modelId === modelId));
    },
    async deleteProfile(profileId) {
      userModelConfigs = userModelConfigs.filter((config) => config.profileId !== profileId);
    },
  });

  const listUserModelConfigs = vi.fn(async (profileId: string) => ({
    ok: true as const,
    value: userModelConfigs.filter((config) => config.profileId === profileId),
  }));
  const listOfficialModelConfigPresets = vi.fn(async (apiFormat?: OfficialModelPreset['apiFormat']) => ({
    ok: true as const,
    value: apiFormat
      ? officialModelConfigPresets.filter((preset) => preset.apiFormat === apiFormat)
      : officialModelConfigPresets,
  }));
  const listRequestStrategiesForApiFormat = vi.fn(async () => ({
    ok: true as const,
    value: fakeRequestStrategies,
  }));
  const getUserModelConfig = vi.fn(async (profileId: string, modelId: string) => ({
    ok: true as const,
    value: userModelConfigs.find((config) => config.profileId === profileId && config.modelId === modelId) ?? null,
  }));
  const getModelGenerationSettingsSpy = vi.fn(getModelGenerationSettings);
  const saveModelGenerationPreferenceSpy = vi.fn(saveModelGenerationPreference);
  const deleteModelGenerationPreferenceSpy = vi.fn(deleteModelGenerationPreference);
  const saveUserModelConfig = vi.fn(async (input: SaveUserModelConfigInput) => {
    const preset = officialModelConfigPresets.find((item) => item.modelId === input.baseModelId);
    const next = {
      ...input,
      modelId: input.modelId.trim(),
      baseModelId: input.baseModelId.trim(),
      wireModelId: input.wireModelId.trim(),
      outputMatrix: (preset?.outputMatrix ?? []).map((matrix) => ({
        ...matrix,
        imageSizes: [...matrix.imageSizes],
        ratios: [...matrix.ratios],
        outputFormats: [...matrix.outputFormats],
        cells: [...matrix.cells],
      })),
    } satisfies UserModelConfig;
    userModelConfigs = [
      ...userModelConfigs.filter((config) => !(config.profileId === next.profileId && config.modelId === next.modelId)),
      next,
    ];
    return { ok: true as const, value: next };
  });
  const deleteUserModelConfigSpy = vi.fn(async (profileId: string, modelId: string) => {
    userModelConfigs = userModelConfigs.filter((config) => !(config.profileId === profileId && config.modelId === modelId));
    return { ok: true as const, value: null };
  });
  const profileModelItems = options?.profileModelItems ?? fakeProfileModelItems;
  const listProfileModels = vi.fn(async () => ({ ok: true as const, value: profileModelItems }));
  const refreshProfileModels = vi.fn(async () => ({ ok: true as const, value: [{ id: 'gpt-image-2-preview' }] }));

  return {
    modelGenerationPreferences,
    commands: {
      listUserModelConfigs,
      listOfficialModelConfigPresets,
      listRequestStrategiesForApiFormat,
      getUserModelConfig,
      saveUserModelConfig,
      deleteUserModelConfig: deleteUserModelConfigSpy,
      getModelGenerationSettings: getModelGenerationSettingsSpy,
      saveModelGenerationPreference: saveModelGenerationPreferenceSpy,
      deleteModelGenerationPreference: deleteModelGenerationPreferenceSpy,
      listProfileModels,
      refreshProfileModels,
    },
    spies: {
      listUserModelConfigs,
      listOfficialModelConfigPresets,
      listRequestStrategiesForApiFormat,
      getUserModelConfig,
      saveUserModelConfig,
      deleteUserModelConfig: deleteUserModelConfigSpy,
      getModelGenerationSettings: getModelGenerationSettingsSpy,
      saveModelGenerationPreference: saveModelGenerationPreferenceSpy,
      deleteModelGenerationPreference: deleteModelGenerationPreferenceSpy,
      listProfileModels,
      refreshProfileModels,
    },
  };
}
