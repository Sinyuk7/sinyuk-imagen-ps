import type { EditInputCapability } from '../../image-model-capability.js';

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
  inputFormats: ['png', 'jpeg', 'webp', 'heic', 'heif'],
  maxImages: 14,
} as const satisfies EditInputCapability);
