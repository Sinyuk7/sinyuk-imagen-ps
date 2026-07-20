import { describe, expect, it } from 'vitest';
import { listOfficialModelConfigPresets, type UserModelConfig } from '@imagen-ps/application';
import { createChromeIndexedDbStorage, createMemoryIndexedDbBackend } from '../../../src/adapters/chrome/indexed-db-storage';

async function geminiFlashImageConfig(): Promise<UserModelConfig> {
  const result = await listOfficialModelConfigPresets('gemini-generate-content');
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  const preset = result.value.find((item) => item.modelId === 'gemini-3.1-flash-image');
  if (!preset) {
    throw new Error('Missing official preset gemini-generate-content:gemini-3.1-flash-image');
  }
  return {
    profileId: 'gemini-profile',
    apiFormat: preset.apiFormat,
    modelId: preset.modelId,
    baseModelId: preset.modelId,
    wireModelId: preset.modelId,
    requestStrategyId: preset.requestStrategyId,
    outputExposure: preset.outputExposure,
    outputMatrix: preset.outputMatrix,
  };
}

describe('Chrome user model config storage', () => {
  it('lists persisted Gemini configs that include 512 resolution cells', async () => {
    const config = await geminiFlashImageConfig();
    const backend = createMemoryIndexedDbBackend({
      initial: {
        userModelConfigs: [
          {
            key: `${config.profileId}:${config.modelId}`,
            value: config,
          },
        ],
      },
    });

    const storage = createChromeIndexedDbStorage({ backend });
    const listed = await storage.userModelConfigs.list(config.profileId);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.modelId).toBe('gemini-3.1-flash-image');
  });

  it('deletes only while another profile-owned model remains', async () => {
    const config = await geminiFlashImageConfig();
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
    await storage.userModelConfigs.save(config);
    await storage.userModelConfigs.save({ ...config, modelId: 'gemini-3.1-flash-image-alt', wireModelId: 'gemini-3.1-flash-image-alt' });

    expect(await storage.userModelConfigs.deleteUnlessLast(config.profileId, config.modelId)).toBe(true);
    expect(await storage.userModelConfigs.deleteUnlessLast(config.profileId, 'gemini-3.1-flash-image-alt')).toBe(false);
    expect(await storage.userModelConfigs.list(config.profileId)).toHaveLength(1);
  });
});
