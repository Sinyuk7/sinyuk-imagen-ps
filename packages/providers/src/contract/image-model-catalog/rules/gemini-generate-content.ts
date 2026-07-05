import type { ImageModelCapability } from '../../image-model-capability.js';
import {
  GEMINI_GENERATE_CONTENT_DEFAULT_STRATEGY,
  GEMINI_GENERATE_CONTENT_LITE_IMAGE_STRATEGY,
} from '../strategies.js';

export const GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'gemini-generate-content-gemini-3.1-flash-image',
    match: {
      ids: ['gemini-3.1-flash-image', 'models/gemini-3.1-flash-image'],
      prefixes: ['gemini-3.1-flash-image', 'models/gemini-3.1-flash-image'],
    },
    displayName: 'Gemini 3.1 Flash Image',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    constraintStrategy: GEMINI_GENERATE_CONTENT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'gemini-generate-content-gemini-3-pro-image',
    match: {
      ids: ['gemini-3-pro-image', 'models/gemini-3-pro-image'],
      prefixes: ['gemini-3-pro-image', 'models/gemini-3-pro-image'],
    },
    displayName: 'Gemini 3 Pro Image',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    constraintStrategy: GEMINI_GENERATE_CONTENT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'gemini-generate-content-gemini-3.1-flash-lite-image',
    match: {
      ids: ['gemini-3.1-flash-lite-image', 'models/gemini-3.1-flash-lite-image'],
      prefixes: ['gemini-3.1-flash-lite-image', 'models/gemini-3.1-flash-lite-image'],
    },
    displayName: 'Gemini 3.1 Flash Lite Image',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    requestStrategyId: 'gemini-generate-content-image-config-legacy',
    constraintStrategy: GEMINI_GENERATE_CONTENT_LITE_IMAGE_STRATEGY,
  },
  {
    ruleId: 'gemini-generate-content-default',
    match: {},
    displayName: 'Default Gemini Generate Content Rule',
    selection: {
      visibleInPicker: false,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    constraintStrategy: GEMINI_GENERATE_CONTENT_DEFAULT_STRATEGY,
  },
] as const satisfies readonly ImageModelCapability[]);
