import type {
  ImageOutputCapability,
  ImageOperation,
  ImageOutputMatrix,
  ImageSizePreset,
  UserModelOutputExposure,
} from '../../image-model-capability.js';
import { GEMINI_3_1_FLASH_IMAGE_RATIOS } from './gemini-3-1-flash-image.js';
import { GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS, geminiGenerateContentImageConfigMatrix } from './gemini-generate-content-output.js';

export const GEMINI_3_1_FLASH_LITE_IMAGE_SIZES = ['1k'] as const satisfies readonly ImageSizePreset[];

export const GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_CAPABILITY = Object.freeze({
  geometry: {
    kind: 'ratio-resolution',
    defaultGeometry: { kind: 'provider-default' },
    aspectRatios: GEMINI_3_1_FLASH_IMAGE_RATIOS,
    resolutions: GEMINI_3_1_FLASH_LITE_IMAGE_SIZES,
  },
  outputFormats: GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'ratio-resolution',
  aspectRatios: GEMINI_3_1_FLASH_IMAGE_RATIOS,
  resolutions: GEMINI_3_1_FLASH_LITE_IMAGE_SIZES,
  outputFormats: GEMINI_GENERATE_CONTENT_OUTPUT_FORMATS,
} as const satisfies UserModelOutputExposure);

export function gemini31FlashLiteImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  return geminiGenerateContentImageConfigMatrix({
    operation,
    sizes: GEMINI_3_1_FLASH_LITE_IMAGE_SIZES,
    ratios: GEMINI_3_1_FLASH_IMAGE_RATIOS,
  });
}
