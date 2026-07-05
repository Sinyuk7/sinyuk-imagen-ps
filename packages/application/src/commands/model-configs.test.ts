import { beforeEach, describe, expect, it } from 'vitest';
import { saveUserModelConfig } from './model-configs.js';
import { setUserModelConfigRepository } from '../runtime.js';
import type { UserModelConfig, UserModelConfigRepository } from './types.js';

function createUserConfigRepository(): {
  readonly repository: UserModelConfigRepository;
  readonly saved: readonly UserModelConfig[];
} {
  const values: UserModelConfig[] = [];
  return {
    get saved() {
      return values;
    },
    repository: {
      async list() {
        return values;
      },
      async get(apiFormat, modelId) {
        return values.find((config) => config.apiFormat === apiFormat && config.modelId === modelId);
      },
      async save(config) {
        values.push(config);
      },
      async delete(apiFormat, modelId) {
        const index = values.findIndex((config) => config.apiFormat === apiFormat && config.modelId === modelId);
        if (index >= 0) {
          values.splice(index, 1);
        }
      },
    },
  };
}

describe('model configs', () => {
  let saved: readonly UserModelConfig[];

  beforeEach(() => {
    const state = createUserConfigRepository();
    saved = state.saved;
    setUserModelConfigRepository(state.repository);
  });

  it('saves exposure rules and derives runtime output projection', async () => {
    const result = await saveUserModelConfig({
      apiFormat: 'gemini-generate-content',
      modelId: 'limited-gemini',
      baseModelId: 'gemini-3.1-flash-image',
      requestStrategyId: 'gemini-generate-content-image-config',
      outputExposure: {
        kind: 'ratio-resolution',
        aspectRatios: ['1:1'],
        resolutions: ['2k'],
        outputFormats: ['png'],
      },
    });

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    const config = result.ok ? result.value : null;
    expect(config?.outputExposure).toEqual({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1'],
      resolutions: ['2k'],
      outputFormats: ['png'],
    });
    expect(config?.outputMatrix.every((matrix) => matrix.cells.every((cell) => {
      if (cell.selection.geometry.kind === 'provider-default') {
        return cell.outputFormat === 'png';
      }
      return cell.selection.geometry.kind === 'ratio-resolution' &&
        cell.selection.geometry.aspectRatio === '1:1' &&
        cell.selection.geometry.resolution === '2k' &&
        cell.outputFormat === 'png';
    }))).toBe(true);
  });

  it('rejects authored outputMatrix on save input', async () => {
    const result = await saveUserModelConfig({
      apiFormat: 'openai-images',
      modelId: 'legacy-matrix-author',
      baseModelId: 'gpt-image-2',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'flexible-pixels',
        sizePresetIds: ['auto', 'use-input-size', '1k'],
        outputFormats: ['png'],
        allowInputDerivedExactSize: true,
      },
      outputMatrix: [],
    } as Parameters<typeof saveUserModelConfig>[0] & { readonly outputMatrix: readonly [] });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toContain('authored outputMatrix');
  });
});
