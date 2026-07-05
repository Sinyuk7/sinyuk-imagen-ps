import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputOption,
  ImageOperation,
  ImageSizePreset,
  EditInputCapability,
  ImageOutputCapability,
  UserModelOutputExposure,
} from '../image-model-capability.js';
import type { ImageOutputSelection } from '../image-output-contract.js';

const SIZE_OPTIONS: Readonly<Record<ImageOutputImageSize, ImageOutputOption<ImageOutputImageSize>>> = {
  auto: { id: 'auto', label: 'Auto' },
  'use-input-size': { id: 'use-input-size', label: 'Use Input Size', hint: 'Uses normalized primary edit input size.', editOnly: true },
  '1k': { id: '1k', label: '1K' },
  '2k': { id: '2k', label: '2K' },
  '4k': { id: '4k', label: '4K' },
};

const RATIO_OPTIONS: Readonly<Record<ImageAspectRatio, ImageOutputOption<ImageAspectRatio>>> = {
  auto: { id: 'auto', label: 'Auto' },
  source: { id: 'source', label: 'Source' },
  '1:1': { id: '1:1', label: '1:1' },
  '16:9': { id: '16:9', label: '16:9' },
  '9:16': { id: '9:16', label: '9:16' },
};

const FORMAT_OPTIONS: Readonly<Record<ImageOutputFormat, ImageOutputOption<ImageOutputFormat>>> = {
  png: { id: 'png', label: 'PNG' },
  jpeg: { id: 'jpeg', label: 'JPEG' },
  webp: { id: 'webp', label: 'WebP' },
};

const GPT_PIXEL_SIZE: Readonly<Record<ImageSizePreset, Readonly<Record<Exclude<ImageAspectRatio, 'auto' | 'source'>, string>>>> = {
  '1k': {
    '1:1': '1024x1024',
    '16:9': '1024x576',
    '9:16': '576x1024',
  },
  '2k': {
    '1:1': '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4k': {
    '1:1': '3840x3840',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

const GPT_OUTPUT_FORMATS: readonly ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
const GEMINI_RESPONSE_FORMATS: readonly ImageOutputFormat[] = ['png', 'jpeg'];
const GEMINI_LEGACY_FORMATS: readonly ImageOutputFormat[] = ['png'];

export const OPENAI_EDIT_INPUT_CAPABILITY = Object.freeze({
  inputFormats: ['png', 'jpeg', 'webp'],
  maxImages: 10,
  maxBytesPerImage: 25 * 1024 * 1024,
  mask: {
    kind: 'alpha-image',
    target: 'first-input',
    formats: ['png'],
    maxBytes: 4 * 1024 * 1024,
    requiresSameDimensions: true,
  },
} as const satisfies EditInputCapability);

export const GEMINI_EDIT_INPUT_CAPABILITY = Object.freeze({
  inputFormats: ['png', 'jpeg', 'webp'],
  maxImages: 14,
} as const satisfies EditInputCapability);

export const GPT_IMAGE_OUTPUT_CAPABILITY = Object.freeze({
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
  outputFormats: GPT_OUTPUT_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GPT_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'flexible-pixels',
  sizePresetIds: ['auto', 'use-input-size', '1k', '2k', '4k'],
  outputFormats: GPT_OUTPUT_FORMATS,
  allowInputDerivedExactSize: true,
} as const satisfies UserModelOutputExposure);

export const GEMINI_RESPONSE_OUTPUT_CAPABILITY = Object.freeze({
  geometry: {
    kind: 'ratio-resolution',
    defaultGeometry: { kind: 'provider-default' },
    aspectRatios: ['1:1', '16:9', '9:16'],
    resolutions: ['1k', '2k', '4k'],
  },
  outputFormats: GEMINI_RESPONSE_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GEMINI_RESPONSE_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'ratio-resolution',
  aspectRatios: ['1:1', '16:9', '9:16'],
  resolutions: ['1k', '2k', '4k'],
  outputFormats: GEMINI_RESPONSE_FORMATS,
} as const satisfies UserModelOutputExposure);

export const GEMINI_LEGACY_OUTPUT_CAPABILITY = Object.freeze({
  geometry: {
    kind: 'ratio-resolution',
    defaultGeometry: { kind: 'provider-default' },
    aspectRatios: ['1:1', '16:9', '9:16'],
    resolutions: ['1k'],
  },
  outputFormats: GEMINI_LEGACY_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GEMINI_LEGACY_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'ratio-resolution',
  aspectRatios: ['1:1', '16:9', '9:16'],
  resolutions: ['1k'],
  outputFormats: GEMINI_LEGACY_FORMATS,
} as const satisfies UserModelOutputExposure);

type MatrixCellInput = {
  readonly imageSize: ImageOutputImageSize;
  readonly ratio: ImageAspectRatio;
  readonly outputFormat: ImageOutputFormat;
  readonly selection: ImageOutputSelection;
};

function uniqueOptions<T extends string>(
  values: readonly T[],
  options: Readonly<Record<T, ImageOutputOption<T>>>,
): readonly ImageOutputOption<T>[] {
  return Array.from(new Set(values)).map((value) => options[value]);
}

function matrix(operation: ImageOperation, cells: readonly MatrixCellInput[], defaultCellId: string): ImageOutputMatrix {
  const geometryKind = cells.some((cell) => cell.selection.geometry.kind === 'pixels' || cell.selection.geometry.kind === 'input-derived')
    ? 'flexible-pixels'
    : 'ratio-resolution';
  return {
    operation,
    archetype: geometryKind === 'flexible-pixels' ? 'size-format' : 'size-aspect-ratio-format',
    geometryKind,
    imageSizes: uniqueOptions(cells.map((cell) => cell.imageSize), SIZE_OPTIONS),
    ratios: uniqueOptions(cells.map((cell) => cell.ratio), RATIO_OPTIONS),
    outputFormats: uniqueOptions(cells.map((cell) => cell.outputFormat), FORMAT_OPTIONS),
    defaultCellId,
    cells: cells.map((cell) => ({
      id: `${operation}:${cell.imageSize}:${cell.ratio}:${cell.outputFormat}`,
      ...cell,
    })),
  };
}

function exactInputSizeCells(outputFormats: readonly ImageOutputFormat[]): readonly MatrixCellInput[] {
  return withFormats('use-input-size', 'source', outputFormats, (outputFormat) => ({
    geometry: { kind: 'input-derived', mode: 'exact-size' },
    outputFormat,
  }));
}

function withFormats(
  imageSize: ImageOutputImageSize,
  ratio: ImageAspectRatio,
  outputFormats: readonly ImageOutputFormat[],
  selectionFor: (outputFormat: ImageOutputFormat) => ImageOutputSelection,
): readonly MatrixCellInput[] {
  return outputFormats.map((outputFormat) => ({
    imageSize,
    ratio,
    outputFormat,
    selection: selectionFor(outputFormat),
  }));
}

export function gptImageEndpointMatrix(operation: ImageOperation): ImageOutputMatrix {
  const formats = GPT_OUTPUT_FORMATS;
  const cells: MatrixCellInput[] = [
    ...(operation === 'image_edit' ? exactInputSizeCells(formats) : []),
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
  ];

  for (const imageSize of ['1k', '2k', '4k'] as const) {
    cells.push(...withFormats(imageSize, 'auto', formats, (outputFormat) => ({
      geometry: {
        kind: 'pixels',
        width: Number(GPT_PIXEL_SIZE[imageSize]['1:1'].split('x')[0]),
        height: Number(GPT_PIXEL_SIZE[imageSize]['1:1'].split('x')[1]),
      },
      outputFormat,
    })));
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function chatImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  const formats = GPT_OUTPUT_FORMATS;
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
  ];

  for (const imageSize of ['1k', '2k', '4k'] as const) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        geometry: {
          kind: 'ratio-resolution',
          aspectRatio: ratio,
          resolution: imageSize,
        },
        outputFormat,
      })));
    }
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function chatGptImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  const formats = GPT_OUTPUT_FORMATS;
  const cells: MatrixCellInput[] = [
    ...(operation === 'image_edit' ? exactInputSizeCells(formats) : []),
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
  ];

  for (const imageSize of ['1k', '2k', '4k'] as const) {
    cells.push(...withFormats(imageSize, 'auto', formats, (outputFormat) => ({
      geometry: {
        kind: 'pixels',
        width: Number(GPT_PIXEL_SIZE[imageSize]['1:1'].split('x')[0]),
        height: Number(GPT_PIXEL_SIZE[imageSize]['1:1'].split('x')[1]),
      },
      outputFormat,
    })));
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function geminiResponseFormatMatrix(operation: ImageOperation, sizes: readonly ImageSizePreset[] = ['1k', '2k', '4k']): ImageOutputMatrix {
  const formats = GEMINI_RESPONSE_FORMATS;
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
  ];

  for (const imageSize of sizes) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        geometry: {
          kind: 'ratio-resolution',
          aspectRatio: ratio,
          resolution: imageSize,
        },
        outputFormat,
      })));
    }
  }

  if (operation === 'image_edit') {
    // Gemini does not use exact input size as output geometry; edit shares native defaults.
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function geminiImageConfigMatrix(operation: ImageOperation, sizes: readonly ImageSizePreset[] = ['1k']): ImageOutputMatrix {
  const formats = GEMINI_LEGACY_FORMATS;
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
  ];

  for (const imageSize of sizes) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        geometry: {
          kind: 'ratio-resolution',
          aspectRatio: ratio,
          resolution: imageSize,
        },
        outputFormat,
      })));
    }
  }

  if (operation === 'image_edit') {
    // Gemini legacy imageConfig edit shares native defaults.
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}
