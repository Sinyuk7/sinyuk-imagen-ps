import type { ImageModelCapability } from '../../image-model-capability.js';
import { CHAT_IMAGE_DEFAULT_STRATEGY } from '../strategies.js';

export const CHAT_IMAGE_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'chat-image-gemini-flash-image-preview',
    match: {
      ids: ['google/gemini-2.5-flash-image-preview'],
      prefixes: ['google/gemini-2.5-flash-image-preview'],
    },
    displayName: 'Gemini 2.5 Flash Image Preview',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    constraintStrategy: CHAT_IMAGE_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'chat-image-gemini-3-pro-image',
    match: {
      ids: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
      prefixes: ['gemini-3-pro-image', 'google/gemini-3-pro-image'],
    },
    displayName: 'Gemini 3 Pro Image',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    constraintStrategy: CHAT_IMAGE_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'chat-image-gemini-3.1-flash-image',
    match: {
      ids: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
      prefixes: ['gemini-3.1-flash-image', 'google/gemini-3.1-flash-image'],
    },
    displayName: 'Gemini 3.1 Flash Image',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    constraintStrategy: CHAT_IMAGE_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'chat-image-openai-gpt-image-2',
    match: {
      ids: ['openai/gpt-image-2'],
    },
    displayName: 'OpenAI GPT Image 2',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    constraintStrategy: CHAT_IMAGE_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'chat-image-default',
    match: {},
    displayName: 'Default Chat Image Rule',
    selection: {
      visibleInPicker: false,
      allowAsDefault: true,
    },
    appliesToProviders: ['chat-image'],
    constraintStrategy: CHAT_IMAGE_DEFAULT_STRATEGY,
  },
] as const satisfies readonly ImageModelCapability[]);
