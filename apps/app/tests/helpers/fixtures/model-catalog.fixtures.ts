import type {
  ImageOutputMatrix,
  OfficialModelPreset,
  UserModelConfig,
} from '@imagen-ps/application';

const fakeFlexibleTextToImageMatrix: ImageOutputMatrix = {
  operation: 'text_to_image',
  archetype: 'size-format',
  geometryKind: 'flexible-pixels',
  imageSizes: [
    { id: 'auto', label: 'Auto' },
    { id: '1k', label: '1K' },
    { id: '2k', label: '2K' },
    { id: '4k', label: '4K' },
  ],
  ratios: [
    { id: 'auto', label: 'Auto' },
  ],
  outputFormats: [
    { id: 'png', label: 'PNG' },
    { id: 'webp', label: 'WebP' },
  ],
  defaultCellId: 'text_to_image:auto:auto:png',
  cells: [
    {
      id: 'text_to_image:auto:auto:png',
      imageSize: 'auto',
      ratio: 'auto',
      outputFormat: 'png',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:auto:auto:webp',
      imageSize: 'auto',
      ratio: 'auto',
      outputFormat: 'webp',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'webp' },
    },
    {
      id: 'text_to_image:1k:auto:png',
      imageSize: '1k',
      ratio: 'auto',
      outputFormat: 'png',
      selection: { geometry: { kind: 'pixels', width: 1024, height: 1024 }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:2k:auto:png',
      imageSize: '2k',
      ratio: 'auto',
      outputFormat: 'png',
      selection: { geometry: { kind: 'pixels', width: 2048, height: 2048 }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:4k:auto:webp',
      imageSize: '4k',
      ratio: 'auto',
      outputFormat: 'webp',
      selection: { geometry: { kind: 'pixels', width: 3840, height: 3840 }, outputFormat: 'webp' },
    },
  ],
};

const fakeFlexibleImageEditMatrix: ImageOutputMatrix = {
  ...fakeFlexibleTextToImageMatrix,
  operation: 'image_edit',
  defaultCellId: 'image_edit:auto:auto:png',
  imageSizes: [
    { id: 'use-input-size', label: 'Use Input Size', editOnly: true },
    ...fakeFlexibleTextToImageMatrix.imageSizes,
  ],
  ratios: [
    { id: 'source', label: 'Source' },
    ...fakeFlexibleTextToImageMatrix.ratios,
  ],
  cells: [
    {
      id: 'image_edit:use-input-size:source:png',
      imageSize: 'use-input-size',
      ratio: 'source',
      outputFormat: 'png',
      selection: { geometry: { kind: 'input-derived', mode: 'exact-size' }, outputFormat: 'png' },
    },
    {
      id: 'image_edit:use-input-size:source:webp',
      imageSize: 'use-input-size',
      ratio: 'source',
      outputFormat: 'webp',
      selection: { geometry: { kind: 'input-derived', mode: 'exact-size' }, outputFormat: 'webp' },
    },
    ...fakeFlexibleTextToImageMatrix.cells.map((cell) => ({
      ...cell,
      id: cell.id.replace('text_to_image:', 'image_edit:'),
    })),
  ],
};

const fakeRatioTextToImageMatrix: ImageOutputMatrix = {
  operation: 'text_to_image',
  archetype: 'size-aspect-ratio-format',
  geometryKind: 'ratio-resolution',
  imageSizes: [
    { id: 'auto', label: 'Auto' },
    { id: '1k', label: '1K' },
    { id: '2k', label: '2K' },
    { id: '4k', label: '4K' },
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
  defaultCellId: 'text_to_image:auto:auto:png',
  cells: [
    {
      id: 'text_to_image:auto:auto:png',
      imageSize: 'auto',
      ratio: 'auto',
      outputFormat: 'png',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:1k:1:1:png',
      imageSize: '1k',
      ratio: '1:1',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '1k', aspectRatio: '1:1' }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:2k:1:1:png',
      imageSize: '2k',
      ratio: '1:1',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '1:1' }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:2k:16:9:png',
      imageSize: '2k',
      ratio: '16:9',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' }, outputFormat: 'png' },
    },
    {
      id: 'text_to_image:4k:16:9:webp',
      imageSize: '4k',
      ratio: '16:9',
      outputFormat: 'webp',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '4k', aspectRatio: '16:9' }, outputFormat: 'webp' },
    },
  ],
};

const fakeRatioSplitImageEditMatrix: ImageOutputMatrix = {
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
  defaultCellId: 'image_edit:auto:source:png',
  cells: [
    {
      id: 'image_edit:auto:source:png',
      imageSize: 'auto',
      ratio: 'source',
      outputFormat: 'png',
      selection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
    },
    {
      id: 'image_edit:1k:1:1:png',
      imageSize: '1k',
      ratio: '1:1',
      outputFormat: 'png',
      selection: { geometry: { kind: 'ratio-resolution', resolution: '1k', aspectRatio: '1:1' }, outputFormat: 'png' },
    },
  ],
};

export const fakeUserModelConfigs: readonly UserModelConfig[] = [
  'gpt-image-2',
  'mock-image-v1',
  'mock-image-v2',
  'gpt-image2',
  'image-edit-1k',
  'dall-e-3',
  'model-b',
].map((modelId) => ({
  apiFormat: 'openai-images',
  modelId,
  baseModelId: 'gpt-image-2',
  requestStrategyId: 'image-endpoint-default',
  outputExposure: {
    kind: 'flexible-pixels',
    sizePresetIds: ['auto', 'use-input-size', '1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
    allowInputDerivedExactSize: true,
  },
  outputMatrix: modelId === 'gpt-image-2'
    ? [{
      ...fakeFlexibleTextToImageMatrix,
      cells: fakeFlexibleTextToImageMatrix.cells.filter((cell) => cell.id !== 'text_to_image:2k:auto:png'),
    }, {
      ...fakeFlexibleImageEditMatrix,
    }]
    : [fakeFlexibleTextToImageMatrix, fakeFlexibleImageEditMatrix],
}));

export const fakeOfficialModelConfigPresets: readonly OfficialModelPreset[] = [{
  apiFormat: 'openai-images',
  modelId: 'gpt-image-2',
  displayName: 'GPT Image 2',
  requestStrategyId: 'image-endpoint-default',
  outputCapability: {
    geometry: {
      kind: 'flexible-pixels',
      defaultGeometry: { kind: 'provider-default' },
      constraints: {
        minPixels: 1024 * 1024,
        maxPixels: 3840 * 3840,
        maxSide: 3840,
        multipleOf: 16,
        maxAspectRatio: 3,
      },
      recommendedPresets: [
        { id: '1k', pixels: { width: 1024, height: 1024 } },
        { id: '2k', pixels: { width: 2048, height: 2048 } },
        { id: '4k', pixels: { width: 3840, height: 3840 } },
      ],
      editDerived: { exactSize: true },
    },
    outputFormats: ['png', 'webp'],
    defaultSelection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
  },
  outputExposure: {
    kind: 'flexible-pixels',
    sizePresetIds: ['auto', 'use-input-size', '1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
    allowInputDerivedExactSize: true,
  },
  outputMatrix: [fakeFlexibleTextToImageMatrix, fakeFlexibleImageEditMatrix],
  output: {
    aspectRatios: ['auto', 'source'],
    sizes: ['auto', 'use-input-size', '1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
    matrices: [fakeFlexibleTextToImageMatrix, fakeFlexibleImageEditMatrix],
  },
}, {
  apiFormat: 'openai-images',
  modelId: 'gemini-image-split',
  displayName: 'Gemini Image Split',
  requestStrategyId: 'image-endpoint-default',
  outputCapability: {
    geometry: {
      kind: 'ratio-resolution',
      defaultGeometry: { kind: 'provider-default' },
      aspectRatios: ['1:1', '16:9'],
      resolutions: ['1k', '2k', '4k'],
    },
    outputFormats: ['png', 'webp'],
    defaultSelection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
  },
  outputExposure: {
    kind: 'ratio-resolution',
    aspectRatios: ['1:1', '16:9'],
    resolutions: ['1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
  },
  outputMatrix: [fakeRatioTextToImageMatrix, fakeRatioSplitImageEditMatrix],
  output: {
    aspectRatios: ['auto', '1:1', '16:9', 'source'],
    sizes: ['auto', '1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
    matrices: [fakeRatioTextToImageMatrix, fakeRatioSplitImageEditMatrix],
  },
}];
