import { describe, expect, it } from 'vitest';
import {
  getOfficialModelPreset,
  resolveProviderResolvedOutput,
  validateImageModelCatalog,
  type ImageOutputSelection,
} from '../src/index.js';

describe('image output capability contract', () => {
  it('declares flexible pixel truth separately from recommended presets', () => {
    const preset = getOfficialModelPreset('openai-images', 'gpt-image-2');

    expect(preset?.outputCapability.geometry.kind).toBe('flexible-pixels');
    expect(preset?.outputExposure.kind).toBe('flexible-pixels');
    expect(preset?.outputCapability.geometry).toMatchObject({
      constraints: {
        maxSide: 3840,
        multipleOf: 16,
        maxAspectRatio: 3,
      },
      editDerived: { exactSize: true },
    });
    expect(preset?.outputCapability.geometry.kind === 'flexible-pixels'
      ? preset.outputCapability.geometry.recommendedPresets.map((entry) => entry.id)
      : []).toEqual(['1k', '2k', '4k']);
  });

  it('declares Gemini ratio-resolution truth as native dimensions', () => {
    const preset = getOfficialModelPreset('gemini-generate-content', 'gemini-3.1-flash-image');

    expect(preset?.outputCapability.geometry).toMatchObject({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1', '16:9', '9:16'],
      resolutions: ['1k', '2k', '4k'],
    });
    expect(preset?.outputExposure).toMatchObject({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1', '16:9', '9:16'],
      resolutions: ['1k', '2k', '4k'],
    });
  });

  it('maps Use Input Size through normalized primary edit input geometry', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'png',
    };

    expect(resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      modelId: 'gpt-image-2',
      operation: 'image_edit',
      output: { selection },
      inputContext: {
        primaryEditInput: {
          width: 1024,
          height: 1536,
        },
      },
    })).toEqual({
      kind: 'image-endpoint',
      size: '1024x1536',
      outputFormat: 'png',
    });
  });

  it('normalizes exact-size to provider default for text-to-image without input geometry', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'webp',
    };

    expect(resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      modelId: 'gpt-image-2',
      operation: 'text_to_image',
      output: { selection },
    })).toEqual({
      kind: 'image-endpoint',
      size: 'auto',
      outputFormat: 'webp',
    });
  });

  it('fails closed for invalid exact-size geometry instead of rewriting it', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'png',
    };

    expect(() => resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      modelId: 'gpt-image-2',
      operation: 'image_edit',
      output: { selection },
      inputContext: {
        primaryEditInput: {
          width: 1001,
          height: 1001,
        },
      },
    })).toThrow('cannot resolve exact output size "1001x1001"');
  });

  it('maps Gemini ratio-resolution selection to native provider fields', () => {
    expect(resolveProviderResolvedOutput({
      providerId: 'gemini-generate-content',
      modelId: 'gemini-3.1-flash-image',
      operation: 'text_to_image',
      output: {
        selection: {
          geometry: {
            kind: 'ratio-resolution',
            resolution: '2k',
            aspectRatio: '16:9',
          },
          outputFormat: 'jpeg',
        },
      },
    })).toEqual({
      kind: 'gemini-generate-content',
      responseFormatImage: {
        imageSize: 'IMAGE_SIZE_TWO_K',
        aspectRatio: 'ASPECT_RATIO_SIXTEEN_NINE',
        mimeType: 'IMAGE_JPEG',
      },
      imageConfig: {
        imageSize: '2K',
        aspectRatio: '16:9',
      },
    });
  });

  it('validates catalog selection projections', () => {
    expect(validateImageModelCatalog()).toEqual([]);
  });
});
