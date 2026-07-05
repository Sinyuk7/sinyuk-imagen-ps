import type {
  ImageAspectRatio,
  ImageOutputCapability,
  ImageOperation,
  ImageOutputMatrix,
  ImageSizePreset,
  UserModelOutputExposure,
} from '../../image-model-capability.js';
import { GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS, geminiGenerateContentImageConfigMatrix } from './gemini-generate-content-output.js';

export const GEMINI_3_PRO_IMAGE_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const satisfies readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];

export const GEMINI_3_PRO_IMAGE_SIZES = ['1k', '2k', '4k'] as const satisfies readonly ImageSizePreset[];

export const GEMINI_3_PRO_IMAGE_OUTPUT_CAPABILITY = Object.freeze({
  geometry: {
    kind: 'ratio-resolution',
    defaultGeometry: { kind: 'provider-default' },
    aspectRatios: GEMINI_3_PRO_IMAGE_RATIOS,
    resolutions: GEMINI_3_PRO_IMAGE_SIZES,
  },
  outputFormats: GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GEMINI_3_PRO_IMAGE_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'ratio-resolution',
  aspectRatios: GEMINI_3_PRO_IMAGE_RATIOS,
  resolutions: GEMINI_3_PRO_IMAGE_SIZES,
  outputFormats: GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS,
} as const satisfies UserModelOutputExposure);

export function gemini3ProImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  return geminiGenerateContentImageConfigMatrix({
    operation,
    sizes: GEMINI_3_PRO_IMAGE_SIZES,
    ratios: GEMINI_3_PRO_IMAGE_RATIOS,
  });
}
