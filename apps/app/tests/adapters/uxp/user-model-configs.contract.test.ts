import { describe, expect, it } from 'vitest';
import { listOfficialModelConfigPresets, type UserModelConfig } from '@imagen-ps/application';
import { createUxpUserModelConfigRepository } from '../../../src/adapters/uxp/uxp-model-repositories';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';

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

function createModulesWithJson(initialJson: string): UxpModules {
  let rawJson = initialJson;
  const file = {
    async read() {
      return rawJson;
    },
    async write(value: string | ArrayBuffer) {
      rawJson = String(value);
      return undefined;
    },
  };

  return {
    uxp: {
      storage: {
        formats: { utf8: 'utf8' },
        localFileSystem: {
          async getDataFolder() {
            return {
              async getEntry() {
                return file;
              },
              async createFile() {
                return file;
              },
            };
          },
        },
      },
    },
  };
}

describe('UXP user model config repository', () => {
  it('reads persisted Gemini configs that include 512 resolution cells', async () => {
    const config = await geminiFlashImageConfig();
    const repository = createUxpUserModelConfigRepository(createModulesWithJson(JSON.stringify({
      configs: [config],
    })));

    const listed = await repository.list(config.profileId);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.modelId).toBe('gemini-3.1-flash-image');
  });

  it('keeps one persisted model when delete would remove the final config', async () => {
    const config = await geminiFlashImageConfig();
    const repository = createUxpUserModelConfigRepository(createModulesWithJson(JSON.stringify({
      configs: [config, { ...config, modelId: 'gemini-3.1-flash-image-alt', wireModelId: 'gemini-3.1-flash-image-alt' }],
    })));

    expect(await repository.deleteUnlessLast(config.profileId, config.modelId)).toBe(true);
    expect(await repository.deleteUnlessLast(config.profileId, 'gemini-3.1-flash-image-alt')).toBe(false);
    expect(await repository.list(config.profileId)).toHaveLength(1);
  });
});
