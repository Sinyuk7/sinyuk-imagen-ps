import { vi } from 'vitest';
import type {
  ProfileModelItem,
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
import { fakeUserModelConfigs } from '../fixtures/model-catalog.fixtures';
import { fakeProfileModelItems } from '../fixtures/provider.fixtures';

export function createModelConfigRepositoryFake(options?: {
  readonly profileModelItems?: readonly ProfileModelItem[];
}) {
  const modelGenerationPreferences = createMemoryModelGenerationPreferenceRepository();
  setModelGenerationPreferenceRepository(modelGenerationPreferences);

  let userModelConfigs: readonly UserModelConfig[] = fakeUserModelConfigs;
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
    async deleteUnlessLast(profileId, modelId) {
      if (userModelConfigs.filter((config) => config.profileId === profileId).length <= 1) return false;
      userModelConfigs = userModelConfigs.filter((config) => !(config.profileId === profileId && config.modelId === modelId));
      return true;
    },
    async deleteProfile(profileId) {
      userModelConfigs = userModelConfigs.filter((config) => config.profileId !== profileId);
    },
  });

  const getModelGenerationSettingsSpy = vi.fn(getModelGenerationSettings);
  const saveModelGenerationPreferenceSpy = vi.fn(saveModelGenerationPreference);
  const deleteModelGenerationPreferenceSpy = vi.fn(deleteModelGenerationPreference);
  const profileModelItems = options?.profileModelItems ?? fakeProfileModelItems;
  const listProfileModels = vi.fn(async () => ({ ok: true as const, value: profileModelItems }));

  return {
    modelGenerationPreferences,
    commands: {
      getModelGenerationSettings: getModelGenerationSettingsSpy,
      saveModelGenerationPreference: saveModelGenerationPreferenceSpy,
      deleteModelGenerationPreference: deleteModelGenerationPreferenceSpy,
      listProfileModels,
    },
    spies: {
      getModelGenerationSettings: getModelGenerationSettingsSpy,
      saveModelGenerationPreference: saveModelGenerationPreferenceSpy,
      deleteModelGenerationPreference: deleteModelGenerationPreferenceSpy,
      listProfileModels,
    },
  };
}
