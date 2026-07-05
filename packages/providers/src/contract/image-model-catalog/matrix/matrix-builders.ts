import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputOption,
  ImageOperation,
  ImageSizePreset,
  PixelDimensions,
} from '../../image-model-capability.js';
import type { ImageOutputSelection } from '../../image-output-contract.js';
import { ASPECT_RATIO_OPTIONS, IMAGE_FORMAT_OPTIONS, IMAGE_SIZE_OPTIONS } from './output-options.js';

export type MatrixCellInput = {
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

export function createImageOutputMatrix(
  operation: ImageOperation,
  cells: readonly MatrixCellInput[],
  defaultCellId: string,
): ImageOutputMatrix {
  const geometryKind = cells.some((cell) => cell.selection.geometry.kind === 'pixels' || cell.selection.geometry.kind === 'input-derived')
    ? 'flexible-pixels'
    : 'ratio-resolution';
  return {
    operation,
    archetype: geometryKind === 'flexible-pixels' ? 'size-format' : 'size-aspect-ratio-format',
    geometryKind,
    imageSizes: uniqueOptions(cells.map((cell) => cell.imageSize), IMAGE_SIZE_OPTIONS),
    ratios: uniqueOptions(cells.map((cell) => cell.ratio), ASPECT_RATIO_OPTIONS),
    outputFormats: uniqueOptions(cells.map((cell) => cell.outputFormat), IMAGE_FORMAT_OPTIONS),
    defaultCellId,
    cells: cells.map((cell) => ({
      id: `${operation}:${cell.imageSize}:${cell.ratio}:${cell.outputFormat}`,
      ...cell,
    })),
  };
}

export function withFormats(
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

export function exactInputSizeCells(outputFormats: readonly ImageOutputFormat[]): readonly MatrixCellInput[] {
  return withFormats('use-input-size', 'source', outputFormats, (outputFormat) => ({
    geometry: { kind: 'input-derived', mode: 'exact-size' },
    outputFormat,
  }));
}

export function pixelPresetCells(args: {
  readonly imageSize: Exclude<ImageSizePreset, '512'>;
  readonly pixels: PixelDimensions;
  readonly outputFormats: readonly ImageOutputFormat[];
}): readonly MatrixCellInput[] {
  return withFormats(args.imageSize, 'auto', args.outputFormats, (outputFormat) => ({
    geometry: {
      kind: 'pixels',
      width: args.pixels.width,
      height: args.pixels.height,
    },
    outputFormat,
  }));
}

export function ratioResolutionCells(args: {
  readonly imageSize: ImageSizePreset;
  readonly ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
  readonly outputFormats: readonly ImageOutputFormat[];
}): readonly MatrixCellInput[] {
  return args.ratios.flatMap((ratio) => withFormats(args.imageSize, ratio, args.outputFormats, (outputFormat) => ({
    geometry: {
      kind: 'ratio-resolution',
      aspectRatio: ratio,
      resolution: args.imageSize,
    },
    outputFormat,
  })));
}
