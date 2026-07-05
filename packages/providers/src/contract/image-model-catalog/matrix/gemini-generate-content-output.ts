import type {
  ImageAspectRatio,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputMatrix,
  ImageSizePreset,
} from '../../image-model-capability.js';
import { createImageOutputMatrix, ratioResolutionCells, withFormats } from './matrix-builders.js';

export const GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS: readonly ImageOutputFormat[] = ['png'];

export function geminiGenerateContentImageConfigMatrix(args: {
  readonly operation: ImageOperation;
  readonly sizes: readonly ImageSizePreset[];
  readonly ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
}): ImageOutputMatrix {
  const cells = [
    ...withFormats('auto', 'auto', GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
    ...args.sizes.flatMap((imageSize) => ratioResolutionCells({
      imageSize,
      ratios: args.ratios,
      outputFormats: GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS,
    })),
  ];

  return createImageOutputMatrix(args.operation, cells, `${args.operation}:auto:auto:png`);
}
