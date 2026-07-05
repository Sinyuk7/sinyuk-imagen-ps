import type {
  ImageOutputCapability,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputMatrix,
  ImageSizePreset,
  UserModelOutputExposure,
} from '../../image-model-capability.js';
import { createImageOutputMatrix, exactInputSizeCells, pixelPresetCells, withFormats } from './matrix-builders.js';

const GPT_IMAGE_OUTPUT_FORMATS: readonly ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
const GPT_IMAGE_SIZE_PRESETS = ['1k', '2k', '4k'] as const satisfies readonly Exclude<ImageSizePreset, '512'>[];

const GPT_IMAGE_PRESET_PIXELS = {
  '1k': { width: 1024, height: 1024 },
  '2k': { width: 2048, height: 2048 },
  '4k': { width: 3840, height: 3840 },
} as const satisfies Readonly<Record<Exclude<ImageSizePreset, '512'>, { readonly width: number; readonly height: number }>>;

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
    recommendedPresets: GPT_IMAGE_SIZE_PRESETS.map((id) => ({ id, pixels: GPT_IMAGE_PRESET_PIXELS[id] })),
    editDerived: { exactSize: true },
  },
  outputFormats: GPT_IMAGE_OUTPUT_FORMATS,
  defaultSelection: {
    geometry: { kind: 'provider-default' },
    outputFormat: 'png',
  },
} as const satisfies ImageOutputCapability);

export const GPT_OUTPUT_EXPOSURE = Object.freeze({
  kind: 'flexible-pixels',
  sizePresetIds: ['auto', 'use-input-size', '1k', '2k', '4k'],
  outputFormats: GPT_IMAGE_OUTPUT_FORMATS,
  allowInputDerivedExactSize: true,
} as const satisfies UserModelOutputExposure);

export function gptImageEndpointMatrix(operation: ImageOperation): ImageOutputMatrix {
  const cells = [
    ...(operation === 'image_edit' ? exactInputSizeCells(GPT_IMAGE_OUTPUT_FORMATS) : []),
    ...withFormats('auto', 'auto', GPT_IMAGE_OUTPUT_FORMATS, (outputFormat) => ({
      geometry: { kind: 'provider-default' },
      outputFormat,
    })),
    ...GPT_IMAGE_SIZE_PRESETS.flatMap((imageSize) => pixelPresetCells({
      imageSize,
      pixels: GPT_IMAGE_PRESET_PIXELS[imageSize],
      outputFormats: GPT_IMAGE_OUTPUT_FORMATS,
    })),
  ];

  return createImageOutputMatrix(operation, cells, `${operation}:auto:auto:png`);
}

export function chatGptImageMatrix(operation: ImageOperation): ImageOutputMatrix {
  return gptImageEndpointMatrix(operation);
}
