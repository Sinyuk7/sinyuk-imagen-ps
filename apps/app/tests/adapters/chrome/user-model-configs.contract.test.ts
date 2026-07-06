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
            key: `${config.apiFormat}:${config.modelId}`,
            value: config,
          },
        ],
      },
    });

    const storage = createChromeIndexedDbStorage({ backend });
    const listed = await storage.userModelConfigs.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.modelId).toBe('gemini-3.1-flash-image');
  });
});
