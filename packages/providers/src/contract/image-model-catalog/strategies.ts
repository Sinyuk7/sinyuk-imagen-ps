import type {
  ImageOutputConstraintStrategy,
  ImageSizePreset,
} from '../image-model-capability.js';

const IMAGE_SIZE_PRESETS: readonly ImageSizePreset[] = ['1k', '2k', '4k'];

export const IMAGE_ENDPOINT_DEFAULT_STRATEGY = Object.freeze({
  kind: 'pixel-side',
  sideByPreset: {
    '1k': 1024,
    '2k': 1536,
    '4k': 1536,
  },
  operations: {
    text_to_image: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', '1:1', '16:9', '9:16'],
    },
    image_edit: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', 'source', '1:1', '16:9', '9:16'],
      omitSizeForAspectRatios: ['auto', 'source'],
    },
  },
} as const satisfies ImageOutputConstraintStrategy);

export const CHAT_IMAGE_DEFAULT_STRATEGY = Object.freeze({
  kind: 'chat-image-label',
  labelByPreset: {
    '1k': '1K',
    '2k': '2K',
    '4k': '2K',
  },
  operations: {
    text_to_image: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto'],
    },
    image_edit: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', 'source', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto', 'source'],
    },
  },
} as const satisfies ImageOutputConstraintStrategy);

export const GEMINI_GENERATE_CONTENT_DEFAULT_STRATEGY = Object.freeze({
  kind: 'chat-image-label',
  labelByPreset: {
    '1k': '1K',
    '2k': '2K',
    '4k': '4K',
  },
  operations: {
    text_to_image: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto'],
    },
    image_edit: {
      presets: IMAGE_SIZE_PRESETS,
      aspectRatios: ['auto', 'source', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto', 'source'],
    },
  },
} as const satisfies ImageOutputConstraintStrategy);

export const GEMINI_GENERATE_CONTENT_LITE_IMAGE_STRATEGY = Object.freeze({
  kind: 'chat-image-label',
  labelByPreset: {
    '1k': '1K',
    '2k': '2K',
    '4k': '4K',
  },
  operations: {
    text_to_image: {
      presets: ['1k'],
      aspectRatios: ['auto', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto'],
    },
    image_edit: {
      presets: ['1k'],
      aspectRatios: ['auto', 'source', '1:1', '16:9', '9:16'],
      omitAspectRatioForAspectRatios: ['auto', 'source'],
    },
  },
} as const satisfies ImageOutputConstraintStrategy);
