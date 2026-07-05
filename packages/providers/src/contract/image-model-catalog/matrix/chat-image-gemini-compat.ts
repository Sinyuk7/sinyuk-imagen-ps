import type {
  ImageAspectRatio,
  ImageOperation,
  ImageOutputCapability,
  ImageOutputFormat,
  ImageOutputMatrix,
  ImageSizePreset,
  UserModelOutputExposure,
} from '../../image-model-capability.js';
import { createImageOutputMatrix, ratioResolutionCells, withFormats } from './matrix-builders.js';

export const CHAT_IMAGE_GEMINI_RATIOS = ['1:1', '16:9', '9:16'] as const satisfies readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
export const CHAT_IMAGE_GEMINI_SIZES = ['1k', '2k', '4k'] as const satisfies readonly ImageSizePreset[];
const CHAT_IMAGE_GEMINI_FORMATS: readonly ImageOutputFormat[] = ['png', 'jpeg'];

export const CHAT_IMAGE_GEMINI_OUTPUT_CAPABILITY = Object.freeze({
  geometry: {
    kind: 'ratio-resolution',
    defaultGeometry: { kind: 'provider-default' },
    aspectRatios: CHAT_IMAGE_GEMINI_RATIOS,
    resolutions: CHAT_IMAGE_GEMINI_SIZES,
  },
  outputFormats: CHAT_IMAGE_GEMINI_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const CHAT_IMAGE_GEMINI_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'ratio-resolution',
  aspectRatios: CHAT_IMAGE_GEMINI_RATIOS,
  resolutions: CHAT_IMAGE_GEMINI_SIZES,
  outputFormats: CHAT_IMAGE_GEMINI_FORMATS,
} as const satisfies UserModelOutputExposure);

export function chatGeminiImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  const cells = [
    ...withFormats('auto', 'auto', CHAT_IMAGE_GEMINI_FORMATS, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
    ...CHAT_IMAGE_GEMINI_SIZES.flatMap((imageSize) => ratioResolutionCells({
      imageSize,
      ratios: CHAT_IMAGE_GEMINI_RATIOS,
      outputFormats: CHAT_IMAGE_GEMINI_FORMATS,
    })),
  ];

  return createImageOutputMatrix(operation, cells, `${operation}:auto:auto:png`);
}
