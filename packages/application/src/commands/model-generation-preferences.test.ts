import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteModelGenerationPreference,
  getModelGenerationSettings,
  saveModelGenerationPreference,
} from './model-generation-preferences.js';
import {
  setModelGenerationPreferenceRepository,
  setUserModelConfigRepository,
} from '../runtime.js';
import type {
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
  UserModelConfigRepository,
} from './types.js';

function createPreferenceRepository(): ModelGenerationPreferenceRepository {
  const values = new Map<string, ModelGenerationPreference>();
  const keyFor = (key: ModelGenerationPreferenceKey) => `${key.profileId}:${key.apiFormat}:${key.modelId}:${key.operation}`;
  return {
    async get(key) {
      return values.get(keyFor(key));
    },
    async save(preference) {
      values.set(keyFor(preference), preference);
    },
    async delete(key) {
      values.delete(keyFor(key));
    },
  };
}

function createEmptyUserConfigRepository(): UserModelConfigRepository {
  return {
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    async save() {
      throw new Error('Unexpected user config save.');
    },
    async delete() {
      throw new Error('Unexpected user config delete.');
    },
  };
}

const baseKey = {
  profileId: 'profile-1',
  apiFormat: 'openai-images',
  modelId: 'gpt-image-2',
} as const;

describe('model generation preferences', () => {
  let preferenceRepository: ModelGenerationPreferenceRepository;

  beforeEach(() => {
    preferenceRepository = createPreferenceRepository();
    setModelGenerationPreferenceRepository(preferenceRepository);
    setUserModelConfigRepository(createEmptyUserConfigRepository());
  });

  it('saves canonical selection and loads it as effective selection for image edit', async () => {
    const selection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'png',
    } as const;

    const saved = await saveModelGenerationPreference({
      ...baseKey,
      operation: 'image_edit',
      selection,
    });
    expect(saved.ok).toBe(true);

    const settings = await getModelGenerationSettings({
      ...baseKey,
      operation: 'image_edit',
    });

    expect(settings.ok).toBe(true);
    expect(settings.ok ? settings.value.selection.selection : null).toEqual(selection);
    expect(settings.ok ? settings.value.selection.effectiveSelection : null).toEqual(selection);
    expect(settings.ok ? settings.value.selection.imageSize : null).toBe('use-input-size');
    expect(settings.ok ? settings.value.selection.ratio : null).toBe('source');
    expect(settings.ok ? settings.value.selection.normalized : null).toBe(false);
  });

  it('projects stored exact-size selection to provider default in text-to-image without overwriting it', async () => {
    const storedSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'webp',
    } as const;

    await preferenceRepository.save({
      ...baseKey,
      operation: 'text_to_image',
      selection: storedSelection,
    });

    const settings = await getModelGenerationSettings({
      ...baseKey,
      operation: 'text_to_image',
    });

    expect(settings.ok).toBe(true);
    expect(settings.ok ? settings.value.selection.selection : null).toEqual(storedSelection);
    expect(settings.ok ? settings.value.selection.effectiveSelection : null).toEqual({
      geometry: { kind: 'provider-default' },
      outputFormat: 'webp',
    });
    expect(settings.ok ? settings.value.selection.imageSize : null).toBe('auto');
    expect(settings.ok ? settings.value.selection.normalized : null).toBe(true);

    const afterProjection = await getModelGenerationSettings({
      ...baseKey,
      operation: 'text_to_image',
    });
    expect(afterProjection.ok ? afterProjection.value.preference?.selection : null).toEqual(storedSelection);
  });

  it('rejects unsupported canonical selections before saving', async () => {
    const result = await saveModelGenerationPreference({
      ...baseKey,
      operation: 'text_to_image',
      selection: {
        geometry: {
          kind: 'ratio-resolution',
          resolution: '2k',
          aspectRatio: '16:9',
        },
        outputFormat: 'png',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toContain('output selection is not valid');
  });

  it('deletes saved preferences by canonical key', async () => {
    await saveModelGenerationPreference({
      ...baseKey,
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'provider-default' },
        outputFormat: 'png',
      },
    });

    const deleted = await deleteModelGenerationPreference({
      ...baseKey,
      operation: 'text_to_image',
    });
    expect(deleted.ok).toBe(true);

    const settings = await getModelGenerationSettings({
      ...baseKey,
      operation: 'text_to_image',
    });
    expect(settings.ok ? settings.value.preference : null).toBeNull();
  });
});
