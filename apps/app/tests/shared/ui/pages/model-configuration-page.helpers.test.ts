import { describe, expect, it } from 'vitest';
import type { ImageOutputMatrix, OfficialModelPreset, UserModelConfig } from '@imagen-ps/application';
import {
  applyDimensionSelectionToMatrix,
  areMatricesSemanticallyEqual,
  buildOutputCapabilityEditorState,
  hasSparseCombinationSet,
} from '../../../../src/shared/ui/pages/model-configuration-page.helpers';

const textToImageMatrix: ImageOutputMatrix = {
  operation: 'text_to_image',
  archetype: 'size-aspect-ratio-format',
  geometryKind: 'ratio-resolution',
  imageSizes: [
    { id: 'auto', label: 'Auto' },
    { id: '1k', label: '1K' },
    { id: '2k', label: '2K' },
  ],
  ratios: [
    { id: 'auto', label: 'Auto' },
    { id: '1:1', label: '1:1' },
    { id: '16:9', label: '16:9' },
  ],
  outputFormats: [
    { id: 'png', label: 'PNG' },
    { id: 'webp', label: 'WebP' },
  ],
  defaultCellId: 'text:auto:auto:png',
  cells: [
    {
      id: 'text:auto:auto:png',
      imageSize: 'auto',
      ratio: 'auto',
      outputFormat: 'png',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    {
      id: 'text:1k:1:1:png',
      imageSize: '1k',
      ratio: '1:1',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '1k', aspectRatio: '1:1' }, outputFormat: 'png' },
    },
    {
      id: 'text:2k:16:9:webp',
      imageSize: '2k',
      ratio: '16:9',
      outputFormat: 'webp',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' }, outputFormat: 'webp' },
    },
  ],
};

const imageEditSame: ImageOutputMatrix = {
  ...textToImageMatrix,
  operation: 'image_edit',
  defaultCellId: 'edit:auto:auto:png',
  cells: textToImageMatrix.cells.map((cell) => ({
    ...cell,
    id: cell.id.replace('text:', 'edit:'),
  })),
};

const imageEditDifferent: ImageOutputMatrix = {
  operation: 'image_edit',
  archetype: 'size-aspect-ratio-format',
  geometryKind: 'ratio-resolution',
  imageSizes: [
    { id: 'auto', label: 'Auto' },
    { id: '1k', label: '1K' },
  ],
  ratios: [
    { id: 'source', label: 'Source' },
    { id: '1:1', label: '1:1' },
  ],
  outputFormats: [
    { id: 'png', label: 'PNG' },
  ],
  defaultCellId: 'edit:auto:source:png',
  cells: [
    {
      id: 'edit:auto:source:png',
      imageSize: 'auto',
      ratio: 'source',
      outputFormat: 'png',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    {
      id: 'edit:1k:1:1:png',
      imageSize: '1k',
      ratio: '1:1',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '1k', aspectRatio: '1:1' }, outputFormat: 'png' },
    },
  ],
};

function preset(matrices: readonly ImageOutputMatrix[]): OfficialModelPreset {
  return {
    apiFormat: 'openai-images',
    modelId: 'test-model',
    displayName: 'Test Model',
    requestStrategyId: 'image-endpoint-default',
    outputCapability: {
      geometry: {
        kind: 'ratio-resolution',
        defaultGeometry: { kind: 'provider-default' },
        aspectRatios: ['1:1', '16:9'],
        resolutions: ['1k', '2k'],
      },
      outputFormats: ['png', 'webp'],
      defaultSelection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    outputExposure: {
      kind: 'ratio-resolution',
      aspectRatios: ['1:1', '16:9'],
      resolutions: ['1k', '2k'],
      outputFormats: ['png', 'webp'],
    },
    outputMatrix: matrices,
    output: {
      aspectRatios: [],
      sizes: [],
      outputFormats: [],
      matrices,
    },
  };
}

describe('model-configuration-page helpers', () => {
  it('treats semantically equal matrices as equal even when cell ids differ', () => {
    expect(areMatricesSemanticallyEqual(textToImageMatrix, imageEditSame)).toBe(true);
  });

  it('builds one shared module when text_to_image and image_edit are equal', () => {
    const state = buildOutputCapabilityEditorState(preset([textToImageMatrix, imageEditSame]));
    expect(state.modules).toHaveLength(1);
    expect(state.modules[0]?.shared).toBe(true);
    expect(state.modules[0]?.operations).toEqual(['text_to_image', 'image_edit']);
  });

  it('builds separate modules when operations differ', () => {
    const state = buildOutputCapabilityEditorState(preset([textToImageMatrix, imageEditDifferent]));
    expect(state.modules).toHaveLength(2);
    expect(state.modules.every((module) => module.shared === false)).toBe(true);
  });

  it('filters sparse cells without generating new cartesian combinations', () => {
    const subset = applyDimensionSelectionToMatrix(textToImageMatrix, {
      imageSizes: ['2k'],
      ratios: ['16:9'],
      outputFormats: ['png', 'webp'],
    });
    expect(subset.cells.map((cell) => cell.id)).toEqual(['text:2k:16:9:webp']);
    expect(hasSparseCombinationSet(textToImageMatrix, {
      imageSizes: ['2k'],
      ratios: ['16:9'],
      outputFormats: ['png', 'webp'],
    })).toBe(true);
  });

  it('marks legacy hole subsets as requiring normalization', () => {
    const config: UserModelConfig = {
      apiFormat: 'openai-images',
      modelId: 'legacy-model',
      baseModelId: 'test-model',
      requestStrategyId: 'image-endpoint-default',
      outputExposure: {
        kind: 'ratio-resolution',
        aspectRatios: ['1:1', '16:9'],
        resolutions: ['1k', '2k'],
        outputFormats: ['png', 'webp'],
      },
      outputMatrix: [{
        ...textToImageMatrix,
        cells: [
          textToImageMatrix.cells[0]!,
          textToImageMatrix.cells[1]!,
        ],
        imageSizes: textToImageMatrix.imageSizes.filter((option) => option.id !== '2k'),
        ratios: textToImageMatrix.ratios.filter((option) => option.id !== '16:9'),
        outputFormats: textToImageMatrix.outputFormats,
        defaultCellId: 'text:auto:auto:png',
      }, imageEditSame],
    };
    const state = buildOutputCapabilityEditorState(preset([textToImageMatrix, imageEditSame]), config);
    expect(state.normalizationRequiredModuleIds).toContain('shared');
  });
});
