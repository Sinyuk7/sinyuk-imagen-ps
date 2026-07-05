import type { ImageModelCapability } from '../../image-model-capability.js';
import {
  GEMINI_EDIT_INPUT_CAPABILITY,
  GEMINI_LEGACY_OUTPUT_CAPABILITY,
  GEMINI_LEGACY_OUTPUT_EXPOSURE,
  GEMINI_RESPONSE_OUTPUT_CAPABILITY,
  GEMINI_RESPONSE_OUTPUT_EXPOSURE,
  geminiImageConfigMatrix,
  geminiResponseFormatMatrix,
} from '../output-matrix.js';

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
    outputCapability: GEMINI_RESPONSE_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_RESPONSE_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      geminiResponseFormatMatrix('text_to_image'),
      geminiResponseFormatMatrix('image_edit'),
    ],
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
    outputCapability: GEMINI_RESPONSE_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_RESPONSE_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      geminiResponseFormatMatrix('text_to_image'),
      geminiResponseFormatMatrix('image_edit'),
    ],
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
    outputCapability: GEMINI_LEGACY_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_LEGACY_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      geminiImageConfigMatrix('text_to_image', ['1k']),
      geminiImageConfigMatrix('image_edit', ['1k']),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);
