import { beforeEach, describe, expect, it } from 'vitest';
import { getOfficialModelPreset } from '@imagen-ps/providers';
import {
  deleteModelGenerationPreference,
  getModelGenerationSettings,
  saveModelGenerationPreference,
} from './model-generation-preferences.js';
import { resolveModelGenerationSettingsValue } from './model-generation-preference-resolution.js';
import {
  setModelGenerationPreferenceRepository,
  setUserModelConfigRepository,
} from '../runtime.js';
import type {
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
  UserModelConfig,
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
    async initializeProfile() {
      throw new Error('Unexpected user config initialization.');
    },
    async deleteUnlessLast() {
      throw new Error('Unexpected user config delete.');
    },
    async deleteProfile() {
      throw new Error('Unexpected user config profile delete.');
    },
  };
}

function createUserConfigRepository(configs: readonly UserModelConfig[]): UserModelConfigRepository {
  return {
    async list(profileId) {
      return configs.filter((config) => config.profileId === profileId);
    },
    async get(profileId, modelId) {
      return configs.find((config) => config.profileId === profileId && config.modelId === modelId);
    },
    async save() {
      throw new Error('Unexpected user config save.');
    },
    async initializeProfile() {
      throw new Error('Unexpected user config initialization.');
    },
    async deleteUnlessLast() {
      throw new Error('Unexpected user config delete.');
    },
    async deleteProfile() {
      throw new Error('Unexpected user config profile delete.');
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

  it('inherits the current text-to-image selection when image edit has no preference', async () => {
    const key = {
      profileId: 'profile-1',
      apiFormat: 'gemini-generate-content' as const,
      modelId: 'gemini-3.1-flash-image',
    };
    const selection = {
      geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '2k' },
      outputFormat: 'png',
    } as const;
    await preferenceRepository.save({ ...key, operation: 'text_to_image', selection });

    const settings = await getModelGenerationSettings({ ...key, operation: 'image_edit' });

    expect(settings.ok).toBe(true);
    expect(settings.ok ? settings.value.preference : null).toBeNull();
    expect(settings.ok ? settings.value.selection.selection : null).toEqual(selection);
    expect(settings.ok ? settings.value.source : null).toBe('inherited');
  });

  it('keeps the saved image-edit selection instead of inheriting text-to-image', async () => {
    const key = {
      profileId: 'profile-1',
      apiFormat: 'gemini-generate-content' as const,
      modelId: 'gemini-3.1-flash-image',
    };
    await preferenceRepository.save({
      ...key,
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '2k' },
        outputFormat: 'png',
      },
    });
    const imageEditSelection = {
      geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '1k' },
      outputFormat: 'png',
    } as const;
    await preferenceRepository.save({ ...key, operation: 'image_edit', selection: imageEditSelection });

    const settings = await getModelGenerationSettings({ ...key, operation: 'image_edit' });

    expect(settings.ok ? settings.value.selection.selection : null).toEqual(imageEditSelection);
    expect(settings.ok ? settings.value.source : null).toBe('preference');
  });

  it('keeps image size and chooses the closest supported ratio for an inherited selection', () => {
    const key = {
      profileId: 'profile-1',
      apiFormat: 'gemini-generate-content' as const,
      modelId: 'gemini-3.1-flash-image',
      operation: 'image_edit' as const,
    };
    const sourceMatrix = getOfficialModelPreset(key.apiFormat, key.modelId)?.outputMatrix
      .find((matrix) => matrix.operation === key.operation);
    const supportedCell = sourceMatrix?.cells.find(
      (cell) => cell.imageSize === '2k' && cell.ratio === '1:1' && cell.outputFormat === 'png',
    );
    if (!sourceMatrix || !supportedCell) {
      throw new Error('Expected Gemini image-edit matrix to include 2K / 1:1 PNG.');
    }

    const value = resolveModelGenerationSettingsValue({
      key,
      inheritedPreference: {
        ...key,
        operation: 'text_to_image',
        selection: {
          geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '2k' },
          outputFormat: 'png',
        },
      },
      userConfig: {
        outputMatrix: [{
          ...sourceMatrix,
          imageSizes: sourceMatrix.imageSizes.filter((option) => option.id === '2k'),
          ratios: sourceMatrix.ratios.filter((option) => option.id === '1:1'),
          outputFormats: sourceMatrix.outputFormats.filter((option) => option.id === 'png'),
          cells: [supportedCell],
          defaultCellId: supportedCell.id,
        }],
      },
    });

    expect(value.source).toBe('inherited');
    expect(value.selection.selection).toEqual(supportedCell.selection);
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

  it('keeps preference identity stable when same config model changes wire route', async () => {
    const firstConfig: UserModelConfig = {
      profileId: 'profile-1',
      outputMatrix: getOfficialModelPreset('openai-images', 'gpt-image-2')?.outputMatrix ?? [],
      apiFormat: 'openai-images',
      modelId: 'gpt-image-2',
      baseModelId: 'gpt-image-2',
      wireModelId: 'gpt-image-2-vip',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', '1k', '2k', '4k'],
        outputFormats: ['png', 'webp'],
        allowInputDerivedExactSize: true,
      },
    };

    setUserModelConfigRepository(createUserConfigRepository([firstConfig]));
    await saveModelGenerationPreference({
      ...baseKey,
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'pixels', width: 3840, height: 3840 },
        outputFormat: 'webp',
      },
    });

    setUserModelConfigRepository(createUserConfigRepository([{
      ...firstConfig,
      wireModelId: 'gpt-image-2-svip',
    }]));

    const settings = await getModelGenerationSettings({
      ...baseKey,
      operation: 'text_to_image',
    });

    expect(settings.ok).toBe(true);
    expect(settings.ok ? settings.value.key.modelId : null).toBe('gpt-image-2');
    expect(settings.ok ? settings.value.preference?.modelId : null).toBe('gpt-image-2');
    expect(settings.ok ? settings.value.selection.selection : null).toEqual({
      geometry: { kind: 'pixels', width: 3840, height: 3840 },
      outputFormat: 'webp',
    });
    expect(settings.ok ? settings.value.source : null).toBe('preference');
  });

  it('projects a configured model through a known wire model before loading or saving output settings', async () => {
    const config: UserModelConfig = {
      profileId: 'profile-1',
      apiFormat: 'gemini-generate-content',
      modelId: 'gemini-3.1-flash-image',
      baseModelId: 'gemini-3.1-flash-image',
      wireModelId: 'nano-banana-fast',
      requestStrategyId: 'gemini-generate-content-image-config',
      outputExposure: {
        kind: 'ratio-resolution',
        aspectRatios: ['1:1'],
        resolutions: ['1k', '2k'],
        outputFormats: ['png'],
      },
      outputMatrix: getOfficialModelPreset('gemini-generate-content', 'gemini-3.1-flash-image')?.outputMatrix ?? [],
    };
    const key = {
      profileId: config.profileId,
      apiFormat: config.apiFormat,
      modelId: config.modelId,
      operation: 'image_edit' as const,
    };
    setUserModelConfigRepository(createUserConfigRepository([config]));
    await preferenceRepository.save({
      ...key,
      selection: {
        geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '2k' },
        outputFormat: 'png',
      },
    });

    const settings = await getModelGenerationSettings(key);
    expect(settings.ok).toBe(true);
    expect(settings.ok ? settings.value.matrix.imageSizes.map((option) => option.id) : []).toEqual([
      'auto',
      '512',
      '1k',
      '2k',
      '4k',
    ]);
    expect(settings.ok ? settings.value.selection.imageSize : null).toBe('2k');

    const saved = await saveModelGenerationPreference({
      ...key,
      selection: {
        geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '2k' },
        outputFormat: 'png',
      },
    });
    expect(saved.ok).toBe(true);
    expect(saved.ok ? saved.value.selection.geometry.kind : null).toBe('ratio-resolution');
  });

  it('isolates same modelId output matrices by profileId', async () => {
    const firstConfig: UserModelConfig = {
      profileId: 'profile-1',
      outputMatrix: getOfficialModelPreset('openai-images', 'gpt-image-2')?.outputMatrix ?? [],
      apiFormat: 'openai-images',
      modelId: 'shared-model',
      baseModelId: 'gpt-image-2',
      wireModelId: 'profile-1-shared-model',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', '1k', '2k', '4k'],
        outputFormats: ['png', 'webp'],
        allowInputDerivedExactSize: true,
      },
    };
    const secondConfig: UserModelConfig = {
      ...firstConfig,
      profileId: 'profile-2',
      wireModelId: 'profile-2-shared-model',
      outputMatrix: [],
    };
    setUserModelConfigRepository(createUserConfigRepository([firstConfig, secondConfig]));

    const firstSettings = await getModelGenerationSettings({
      ...baseKey,
      modelId: 'shared-model',
      operation: 'text_to_image',
    });
    const secondSettings = await getModelGenerationSettings({
      ...baseKey,
      profileId: 'profile-2',
      modelId: 'shared-model',
      operation: 'text_to_image',
    });

    expect(firstSettings.ok).toBe(true);
    expect(secondSettings.ok).toBe(false);
    expect(secondSettings.ok ? null : secondSettings.error.message).toContain('no executable output configuration');
  });
});
