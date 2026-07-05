import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputOption,
} from '../../image-model-capability.js';

export const IMAGE_SIZE_OPTIONS: Readonly<Record<ImageOutputImageSize, ImageOutputOption<ImageOutputImageSize>>> = {
  auto: { id: 'auto', label: 'Auto' },
  'use-input-size': { id: 'use-input-size', label: 'Use Input Size', hint: 'Uses normalized primary edit input size.', editOnly: true },
  '512': { id: '512', label: '512' },
  '1k': { id: '1k', label: '1K' },
  '2k': { id: '2k', label: '2K' },
  '4k': { id: '4k', label: '4K' },
};

export const ASPECT_RATIO_OPTIONS: Readonly<Record<ImageAspectRatio, ImageOutputOption<ImageAspectRatio>>> = {
  auto: { id: 'auto', label: 'Auto' },
  source: { id: 'source', label: 'Source' },
  '1:1': { id: '1:1', label: '1:1' },
  '1:4': { id: '1:4', label: '1:4' },
  '1:8': { id: '1:8', label: '1:8' },
  '2:3': { id: '2:3', label: '2:3' },
  '3:2': { id: '3:2', label: '3:2' },
  '3:4': { id: '3:4', label: '3:4' },
  '4:1': { id: '4:1', label: '4:1' },
  '4:3': { id: '4:3', label: '4:3' },
  '4:5': { id: '4:5', label: '4:5' },
  '5:4': { id: '5:4', label: '5:4' },
  '8:1': { id: '8:1', label: '8:1' },
  '9:16': { id: '9:16', label: '9:16' },
  '16:9': { id: '16:9', label: '16:9' },
  '21:9': { id: '21:9', label: '21:9' },
};

export const IMAGE_FORMAT_OPTIONS: Readonly<Record<ImageOutputFormat, ImageOutputOption<ImageOutputFormat>>> = {
  png: { id: 'png', label: 'PNG' },
  jpeg: { id: 'jpeg', label: 'JPEG' },
  webp: { id: 'webp', label: 'WebP' },
};
