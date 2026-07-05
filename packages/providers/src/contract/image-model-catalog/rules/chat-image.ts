import type { ImageModelCapability } from '../../image-model-capability.js';
import { chatImageMatrix } from '../output-matrix.js';

export const CHAT_IMAGE_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'chat-image-gemini-flash-image-preview',
    match: {
      ids: ['google/gemini-2.5-flash-image-preview'],
      prefixes: ['google/gemini-2.5-flash-image-preview'],
    },
    displayName: 'Gemini 2.5 Flash Image Preview',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputMatrix: [
      chatImageMatrix('text_to_image'),
      chatImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'chat-image-gemini-3-pro-image',
    match: {
      ids: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
      prefixes: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
    },
    displayName: 'Gemini 3 Pro Image',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputMatrix: [
      chatImageMatrix('text_to_image'),
      chatImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'chat-image-gemini-3.1-flash-image',
    match: {
      ids: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
      prefixes: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
    },
    displayName: 'Gemini 3.1 Flash Image',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputMatrix: [
      chatImageMatrix('text_to_image'),
      chatImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'chat-image-openai-gpt-image-2',
    match: {
      ids: ['openai/gpt-image-2'],
    },
    displayName: 'OpenAI GPT Image 2',
    brand: 'openai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputMatrix: [
      chatImageMatrix('text_to_image'),
      chatImageMatrix('image_edit'),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);
