import { describe, expect, it } from 'vitest';
import {
  _resetForTesting,
  setModelGenerationPreferenceRepository,
} from '../runtime.js';
import {
  getModelGenerationSettings,
  saveModelGenerationPreference,
} from './model-generation-preferences.js';
import type {
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
} from './types.js';

function createPreferenceRepository(
  preferences: readonly ModelGenerationPreference[] = [],
): ModelGenerationPreferenceRepository {
  const keyOf = (key: ModelGenerationPreferenceKey) =>
    `${key.profileId}:${key.apiFormat}:${key.modelId}:${key.operation}`;
  const store = new Map(preferences.map((preference) => [keyOf(preference), preference]));
  return {
    async get(key) {
      return store.get(keyOf(key));
    },
    async save(preference) {
      store.set(keyOf(preference), preference);
    },
    async delete(key) {
      store.delete(keyOf(key));
    },
  };
}

const GPT_KEY = {
  profileId: 'profile-a',
  apiFormat: 'openai-images',
  modelId: 'gpt-image-2',
  operation: 'text_to_image',
} as const satisfies ModelGenerationPreferenceKey;

describe('model generation preference commands', () => {
  it('loads the matrix default and resolves exact requestOutput', async () => {
    _resetForTesting();
    setModelGenerationPreferenceRepository(createPreferenceRepository());

    const result = await getModelGenerationSettings(GPT_KEY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('default');
      expect(result.value.selection).toMatchObject({
        cellId: 'text_to_image:auto:auto:png',
        imageSize: 'auto',
        ratio: 'auto',
        outputFormat: 'png',
      });
      expect(result.value.requestOutput).toEqual({
        kind: 'image-endpoint',
        size: 'auto',
        outputFormat: 'png',
      });
    }
  });

  it('saves and loads a model-scoped preference without persisted wire fields', async () => {
    _resetForTesting();
    const repository = createPreferenceRepository();
    setModelGenerationPreferenceRepository(repository);

    const saved = await saveModelGenerationPreference({
      ...GPT_KEY,
      cellId: 'text_to_image:4k:16:9:png',
      imageSize: '4k',
      ratio: '16:9',
      outputFormat: 'png',
    });
    const loaded = await getModelGenerationSettings(GPT_KEY);

    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(JSON.stringify(saved.value)).not.toContain('3840x2160');
      expect(saved.value).not.toHaveProperty('requestOutput');
    }
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.source).toBe('preference');
      expect(loaded.value.requestOutput).toEqual({
        kind: 'image-endpoint',
        size: '3840x2160',
        outputFormat: 'png',
      });
    }
  });

  it('keeps profile and operation preferences independent', async () => {
    _resetForTesting();
    setModelGenerationPreferenceRepository(createPreferenceRepository());

    await saveModelGenerationPreference({
      ...GPT_KEY,
      cellId: 'text_to_image:4k:16:9:png',
      imageSize: '4k',
      ratio: '16:9',
      outputFormat: 'png',
    });
    await saveModelGenerationPreference({
      ...GPT_KEY,
      profileId: 'profile-b',
      cellId: 'text_to_image:1k:1:1:jpeg',
      imageSize: '1k',
      ratio: '1:1',
      outputFormat: 'jpeg',
    });
    await saveModelGenerationPreference({
      ...GPT_KEY,
      operation: 'image_edit',
      cellId: 'image_edit:2k:9:16:webp',
      imageSize: '2k',
      ratio: '9:16',
      outputFormat: 'webp',
    });

    await expect(getModelGenerationSettings(GPT_KEY)).resolves.toMatchObject({
      ok: true,
      value: {
        selection: { imageSize: '4k', ratio: '16:9', outputFormat: 'png' },
      },
    });
    await expect(getModelGenerationSettings({ ...GPT_KEY, profileId: 'profile-b' })).resolves.toMatchObject({
      ok: true,
      value: {
        selection: { imageSize: '1k', ratio: '1:1', outputFormat: 'jpeg' },
      },
    });
    await expect(getModelGenerationSettings({ ...GPT_KEY, operation: 'image_edit' })).resolves.toMatchObject({
      ok: true,
      value: {
        selection: { imageSize: '2k', ratio: '9:16', outputFormat: 'webp' },
      },
    });
  });

  it('falls back to the matrix default when a saved preference is invalid', async () => {
    _resetForTesting();
    setModelGenerationPreferenceRepository(createPreferenceRepository([
      {
        ...GPT_KEY,
        cellId: 'text_to_image:removed:cell:png',
        imageSize: '4k',
        ratio: '16:9',
        outputFormat: 'png',
      },
    ]));

    const result = await getModelGenerationSettings(GPT_KEY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('default');
      expect(result.value.selection.cellId).toBe('text_to_image:auto:auto:png');
      expect(result.value.requestOutput).toEqual({
        kind: 'image-endpoint',
        size: 'auto',
        outputFormat: 'png',
      });
    }
  });

  it('rejects invalid saved selections and unknown models', async () => {
    _resetForTesting();
    setModelGenerationPreferenceRepository(createPreferenceRepository());

    await expect(saveModelGenerationPreference({
      ...GPT_KEY,
      cellId: 'text_to_image:not-present',
      imageSize: '4k',
      ratio: '16:9',
      outputFormat: 'png',
    })).resolves.toMatchObject({
      ok: false,
      error: { category: 'validation' },
    });

    await expect(getModelGenerationSettings({
      ...GPT_KEY,
      modelId: 'unknown-custom-model',
    })).resolves.toMatchObject({
      ok: false,
      error: { category: 'validation' },
    });
  });
});
