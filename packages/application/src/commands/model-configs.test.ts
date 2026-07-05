import { describe, expect, it } from 'vitest';
import { _resetForTesting, setUserModelConfigRepository } from '../runtime.js';
import {
  getUserModelConfig,
  listOfficialModelConfigPresets,
  listRequestStrategiesForApiFormat,
  listUserModelConfigs,
  saveUserModelConfig,
} from './model-configs.js';
import type { UserModelConfig, UserModelConfigRepository } from './types.js';

function createUserModelConfigRepository(configs: readonly UserModelConfig[] = []): UserModelConfigRepository {
  const store = new Map(configs.map((config) => [`${config.apiFormat}:${config.modelId}`, config]));
  return {
    async list(apiFormat) {
      const values = Array.from(store.values());
      return apiFormat === undefined ? values : values.filter((config) => config.apiFormat === apiFormat);
    },
    async get(apiFormat, modelId) {
      return store.get(`${apiFormat}:${modelId}`);
    },
    async save(config) {
      store.set(`${config.apiFormat}:${config.modelId}`, config);
    },
    async delete(apiFormat, modelId) {
      store.delete(`${apiFormat}:${modelId}`);
    },
  };
}

describe('model config commands', () => {
  it('lists saved user model configs filtered by apiFormat', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository([
      {
        apiFormat: 'openai-images',
        modelId: 'user-model-a',
        requestStrategyId: 'image-endpoint-default',
        output: { aspectRatios: ['1:1'], sizes: ['1k'], outputFormats: ['png'] },
      },
      {
        apiFormat: 'gemini-generate-content',
        modelId: 'user-model-b',
        requestStrategyId: 'gemini-generate-content-response-format-image',
        output: { aspectRatios: ['auto'], sizes: ['auto'], outputFormats: ['auto'] },
      },
    ]));

    const result = await listUserModelConfigs('openai-images');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.modelId).toBe('user-model-a');
    }
  });

  it('lists official presets and request strategies for an apiFormat', async () => {
    const presets = await listOfficialModelConfigPresets('openai-images');
    const strategies = await listRequestStrategiesForApiFormat('openai-images');

    expect(presets.ok).toBe(true);
    expect(strategies.ok).toBe(true);
    if (presets.ok) {
      expect(presets.value.some((preset) => preset.modelId === 'gpt-image-2')).toBe(true);
    }
    if (strategies.ok) {
      expect(strategies.value.map((strategy) => strategy.id)).toEqual([
        'image-endpoint-default',
        'image-endpoint-variant',
      ]);
    }
  });

  it('reads a saved config by apiFormat and modelId', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository([
      {
        apiFormat: 'openai-images',
        modelId: 'user-model-a',
        requestStrategyId: 'image-endpoint-default',
        output: { aspectRatios: ['1:1'], sizes: ['1k'], outputFormats: ['png'] },
      },
    ]));

    const result = await getUserModelConfig('openai-images', 'user-model-a');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        apiFormat: 'openai-images',
        modelId: 'user-model-a',
        requestStrategyId: 'image-endpoint-default',
      });
    }
  });

  it('returns null when a saved config is missing', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await getUserModelConfig('openai-images', 'missing-model');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('saves a config after validating strategy and non-empty output sets', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: ' custom-user-model ',
      requestStrategyId: 'image-endpoint-default',
      output: {
        aspectRatios: ['1:1', '1:1', '16:9'],
        sizes: ['1k', '1k', '2k'],
        outputFormats: ['png', 'png', 'webp'],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        apiFormat: 'openai-images',
        modelId: 'custom-user-model',
        requestStrategyId: 'image-endpoint-default',
        output: {
          aspectRatios: ['1:1', '16:9'],
          sizes: ['1k', '2k'],
          outputFormats: ['png', 'webp'],
        },
      });
    }

    const persisted = await getUserModelConfig('openai-images', 'custom-user-model');
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value?.modelId).toBe('custom-user-model');
    }
  });

  it('rejects unknown request strategies', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      requestStrategyId: 'unknown-strategy',
      output: {
        aspectRatios: ['1:1'],
        sizes: ['1k'],
        outputFormats: ['png'],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('Unknown requestStrategyId');
    }
  });

  it('rejects strategies from the wrong apiFormat', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      requestStrategyId: 'gemini-generate-content-response-format-image',
      output: {
        aspectRatios: ['1:1'],
        sizes: ['1k'],
        outputFormats: ['png'],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('is not valid for apiFormat');
    }
  });

  it('rejects empty output sets', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      requestStrategyId: 'image-endpoint-default',
      output: {
        aspectRatios: [],
        sizes: ['1k'],
        outputFormats: ['png'],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('output.aspectRatios must not be empty');
    }
  });
});
