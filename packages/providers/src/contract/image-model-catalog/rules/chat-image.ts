import type { ImageModelCapability } from '../../image-model-capability.js';
import {
  CHAT_IMAGE_GEMINI_OUTPUT_CAPABILITY,
  CHAT_IMAGE_GEMINI_OUTPUT_EXPOSURE,
  chatGeminiImageMatrix,
} from '../matrix/chat-image-gemini-compat.js';
import { GEMINI_EDIT_INPUT_CAPABILITY, OPENAI_EDIT_INPUT_CAPABILITY } from '../matrix/edit-input-capabilities.js';
import {
  GPT_IMAGE_OUTPUT_CAPABILITY,
  GPT_OUTPUT_EXPOSURE,
  chatGptImageMatrix,
} from '../matrix/openai-gpt-image-2.js';

export const CHAT_IMAGE_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'chat-image-gemini-3-pro-image',
    match: {
      ids: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
      prefixes: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
    },
    displayName: 'Nano Banana Pro',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputCapability: CHAT_IMAGE_GEMINI_OUTPUT_CAPABILITY,
    outputExposure: CHAT_IMAGE_GEMINI_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      chatGeminiImageMatrix('text_to_image'),
      chatGeminiImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'chat-image-gemini-3.1-flash-image',
    match: {
      ids: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
      prefixes: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
    },
    displayName: 'Nano Banana 2',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    outputCapability: CHAT_IMAGE_GEMINI_OUTPUT_CAPABILITY,
    outputExposure: CHAT_IMAGE_GEMINI_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      chatGeminiImageMatrix('text_to_image'),
      chatGeminiImageMatrix('image_edit'),
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
    outputCapability: GPT_IMAGE_OUTPUT_CAPABILITY,
    outputExposure: GPT_OUTPUT_EXPOSURE,
    editInput: OPENAI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      chatGptImageMatrix('text_to_image'),
      chatGptImageMatrix('image_edit'),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);
