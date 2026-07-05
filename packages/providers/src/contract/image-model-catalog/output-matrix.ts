import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputOption,
  ImageOperation,
} from '../image-model-capability.js';
import type { ProviderResolvedOutput } from '../request.js';

const SIZE_OPTIONS: Readonly<Record<ImageOutputImageSize, ImageOutputOption<ImageOutputImageSize>>> = {
  auto: { id: 'auto', label: 'Auto' },
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

const GPT_PIXEL_SIZE: Readonly<Record<Exclude<ImageOutputImageSize, 'auto'>, Readonly<Record<Exclude<ImageAspectRatio, 'auto' | 'source'>, string>>>> = {
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
    '1:1': '4096x4096',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

type MatrixCellInput = {
  readonly imageSize: ImageOutputImageSize;
  readonly ratio: ImageAspectRatio;
  readonly outputFormat: ImageOutputFormat;
  readonly requestOutput: ProviderResolvedOutput;
};

function uniqueOptions<T extends string>(
  values: readonly T[],
  options: Readonly<Record<T, ImageOutputOption<T>>>,
): readonly ImageOutputOption<T>[] {
  return Array.from(new Set(values)).map((value) => options[value]);
}

function matrix(operation: ImageOperation, cells: readonly MatrixCellInput[], defaultCellId: string): ImageOutputMatrix {
  return {
    operation,
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

function withFormats(
  imageSize: ImageOutputImageSize,
  ratio: ImageAspectRatio,
  outputFormats: readonly ImageOutputFormat[],
  requestOutputFor: (outputFormat: ImageOutputFormat) => ProviderResolvedOutput,
): readonly MatrixCellInput[] {
  return outputFormats.map((outputFormat) => ({
    imageSize,
    ratio,
    outputFormat,
    requestOutput: requestOutputFor(outputFormat),
  }));
}

export function gptImageEndpointMatrix(operation: ImageOperation): ImageOutputMatrix {
  const formats: readonly ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      kind: 'image-endpoint',
      size: 'auto',
      outputFormat,
    })),
  ];

  for (const imageSize of ['1k', '2k', '4k'] as const) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        kind: 'image-endpoint',
        size: GPT_PIXEL_SIZE[imageSize][ratio],
        outputFormat,
      })));
    }
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function chatImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  const formats: readonly ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      kind: 'chat-image',
      imageConfig: { output_format: outputFormat },
    })),
  ];

  for (const imageSize of ['1k', '2k', '4k'] as const) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        kind: 'chat-image',
        imageConfig: {
          size: SIZE_OPTIONS[imageSize].label,
          aspect_ratio: ratio,
          output_format: outputFormat,
        },
      })));
    }
  }

  if (operation === 'image_edit') {
    cells.push(...withFormats('auto', 'source', formats, (outputFormat) => ({
      kind: 'chat-image',
      imageConfig: { output_format: outputFormat },
    })));
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

function responseFormatAspectRatio(ratio: ImageAspectRatio): string | undefined {
  switch (ratio) {
    case '1:1':
      return 'ASPECT_RATIO_ONE_BY_ONE';
    case '16:9':
      return 'ASPECT_RATIO_SIXTEEN_NINE';
    case '9:16':
      return 'ASPECT_RATIO_NINE_SIXTEEN';
    default:
      return undefined;
  }
}

function responseFormatImageSize(imageSize: ImageOutputImageSize): string | undefined {
  switch (imageSize) {
    case '1k':
      return 'IMAGE_SIZE_ONE_K';
    case '2k':
      return 'IMAGE_SIZE_TWO_K';
    case '4k':
      return 'IMAGE_SIZE_FOUR_K';
    default:
      return undefined;
  }
}

function geminiFormatFields(outputFormat: ImageOutputFormat): Readonly<Record<string, unknown>> {
  return outputFormat === 'jpeg' ? { mimeType: 'IMAGE_JPEG' } : {};
}

export function geminiResponseFormatMatrix(operation: ImageOperation, sizes: readonly Exclude<ImageOutputImageSize, 'auto'>[] = ['1k', '2k', '4k']): ImageOutputMatrix {
  const formats: readonly ImageOutputFormat[] = ['png', 'jpeg'];
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, (outputFormat) => ({
      kind: 'gemini-generate-content',
      responseFormatImage: geminiFormatFields(outputFormat),
    })),
  ];

  for (const imageSize of sizes) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, (outputFormat) => ({
        kind: 'gemini-generate-content',
        responseFormatImage: {
          imageSize: responseFormatImageSize(imageSize),
          aspectRatio: responseFormatAspectRatio(ratio),
          ...geminiFormatFields(outputFormat),
        },
      })));
    }
  }

  if (operation === 'image_edit') {
    cells.push(...withFormats('auto', 'source', formats, (outputFormat) => ({
      kind: 'gemini-generate-content',
      responseFormatImage: geminiFormatFields(outputFormat),
    })));
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}

export function geminiImageConfigMatrix(operation: ImageOperation, sizes: readonly Exclude<ImageOutputImageSize, 'auto'>[] = ['1k']): ImageOutputMatrix {
  const formats: readonly ImageOutputFormat[] = ['png'];
  const cells: MatrixCellInput[] = [
    ...withFormats('auto', 'auto', formats, () => ({
      kind: 'gemini-generate-content',
      imageConfig: {},
    })),
  ];

  for (const imageSize of sizes) {
    for (const ratio of ['1:1', '16:9', '9:16'] as const) {
      cells.push(...withFormats(imageSize, ratio, formats, () => ({
        kind: 'gemini-generate-content',
        imageConfig: {
          imageSize: SIZE_OPTIONS[imageSize].label,
          aspectRatio: ratio,
        },
      })));
    }
  }

  if (operation === 'image_edit') {
    cells.push(...withFormats('auto', 'source', formats, () => ({
      kind: 'gemini-generate-content',
      imageConfig: {},
    })));
  }

  return matrix(operation, cells, `${operation}:auto:auto:png`);
}
