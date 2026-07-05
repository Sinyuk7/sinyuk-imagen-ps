import { describe, expect, it } from 'vitest';
import { _resetForTesting, setUserModelConfigRepository } from '../runtime.js';
import {
  listOfficialModelConfigPresets,
  getUserModelConfig,
  listRequestStrategiesForApiFormat,
  listUserModelConfigs,
  saveUserModelConfig,
} from './model-configs.js';
import type { ImageOutputMatrix, UserModelConfig, UserModelConfigRepository } from './types.js';

async function gptMatrixSubset(): Promise<readonly ImageOutputMatrix[]> {
  const result = await listOfficialModelConfigPresets('openai-images');
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  const matrix = result.value.find((preset) => preset.modelId === 'gpt-image-2')!.outputMatrix;
  return matrix.map((item) => ({
    ...item,
    cells: item.cells.slice(0, 1),
    imageSizes: item.imageSizes.filter((option) => option.id === item.cells[0]!.imageSize),
    ratios: item.ratios.filter((option) => option.id === item.cells[0]!.ratio),
    outputFormats: item.outputFormats.filter((option) => option.id === item.cells[0]!.outputFormat),
    defaultCellId: item.cells[0]!.id,
  }));
}

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
    const outputMatrix = await gptMatrixSubset();
    setUserModelConfigRepository(createUserModelConfigRepository([
      {
        apiFormat: 'openai-images',
        modelId: 'user-model-a',
        baseModelId: 'gpt-image-2',
        requestStrategyId: 'image-endpoint-default',
        outputMatrix,
      },
      {
        apiFormat: 'gemini-generate-content',
        modelId: 'user-model-b',
        baseModelId: 'gemini-3.1-flash-image',
        requestStrategyId: 'gemini-generate-content-response-format-image',
        outputMatrix,
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
    const outputMatrix = await gptMatrixSubset();
    setUserModelConfigRepository(createUserModelConfigRepository([
      {
        apiFormat: 'openai-images',
        modelId: 'user-model-a',
        baseModelId: 'gpt-image-2',
        requestStrategyId: 'image-endpoint-default',
        outputMatrix,
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

  it('saves a preset-derived non-empty output matrix subset', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());
    const outputMatrix = await gptMatrixSubset();

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: ' custom-user-model ',
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputMatrix,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        apiFormat: 'openai-images',
        modelId: 'custom-user-model',
        baseModelId: 'gpt-image-2',
        requestStrategyId: 'image-endpoint-default',
        outputMatrix,
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
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'unknown-strategy',
      outputMatrix: await gptMatrixSubset(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('must match official preset');
    }
  });

  it('rejects strategies from the wrong apiFormat', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'gemini-generate-content-response-format-image',
      outputMatrix: await gptMatrixSubset(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('must match official preset');
    }
  });

  it('rejects empty output matrix subsets', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputMatrix: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('outputMatrix must not be empty');
    }
  });

  it('rejects old aggregate output schema', async () => {
    _resetForTesting();
    setUserModelConfigRepository(createUserModelConfigRepository());

    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'user-model-a',
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputMatrix: await gptMatrixSubset(),
      output: { aspectRatios: ['1:1'], sizes: ['1k'], outputFormats: ['png'] },
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('old aggregate output');
    }
  });
});
