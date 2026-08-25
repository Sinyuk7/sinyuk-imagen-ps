import type { ImageModelCapability } from '../../contract/image-model-capability.js';
import type { ProviderDefaultModelTemplate } from '../../contract/provider.js';
import { GEMINI_EDIT_INPUT_CAPABILITY } from '../../model-catalog/shared/matrix/edit-input-capabilities.js';
import {
  GEMINI_3_1_FLASH_IMAGE_OUTPUT_CAPABILITY,
  GEMINI_3_1_FLASH_IMAGE_OUTPUT_EXPOSURE,
  gemini31FlashImageMatrix,
} from '../../model-catalog/shared/matrix/gemini-3-1-flash-image.js';
import {
  GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_CAPABILITY,
  GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_EXPOSURE,
  gemini31FlashLiteImageMatrix,
} from '../../model-catalog/shared/matrix/gemini-3-1-flash-lite-image.js';
import {
  GEMINI_3_PRO_IMAGE_OUTPUT_CAPABILITY,
  GEMINI_3_PRO_IMAGE_OUTPUT_EXPOSURE,
  gemini3ProImageMatrix,
} from '../../model-catalog/shared/matrix/gemini-3-pro-image.js';

export const GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'gemini-generate-content-gemini-3.1-flash-image',
    match: {
      ids: ['gemini-3.1-flash-image', 'models/gemini-3.1-flash-image'],
      prefixes: ['gemini-3.1-flash-image', 'models/gemini-3.1-flash-image'],
    },
    displayName: 'Nano Banana 2',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    requestStrategyId: 'gemini-generate-content-image-config',
    outputCapability: GEMINI_3_1_FLASH_IMAGE_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_3_1_FLASH_IMAGE_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      gemini31FlashImageMatrix('text_to_image'),
      gemini31FlashImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'gemini-generate-content-gemini-3-pro-image',
    match: {
      ids: ['gemini-3-pro-image', 'models/gemini-3-pro-image'],
      prefixes: ['gemini-3-pro-image', 'models/gemini-3-pro-image'],
    },
    displayName: 'Nano Banana Pro',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    requestStrategyId: 'gemini-generate-content-image-config',
    outputCapability: GEMINI_3_PRO_IMAGE_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_3_PRO_IMAGE_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      gemini3ProImageMatrix('text_to_image'),
      gemini3ProImageMatrix('image_edit'),
    ],
  },
  {
    ruleId: 'gemini-generate-content-gemini-3.1-flash-lite-image',
    match: {
      ids: ['gemini-3.1-flash-lite-image', 'models/gemini-3.1-flash-lite-image'],
      prefixes: ['gemini-3.1-flash-lite-image', 'models/gemini-3.1-flash-lite-image'],
    },
    displayName: 'Nano Banana 2 Lite',
    brand: 'google-gemini',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['gemini-generate-content'],
    requestStrategyId: 'gemini-generate-content-image-config',
    outputCapability: GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_CAPABILITY,
    outputExposure: GEMINI_3_1_FLASH_LITE_IMAGE_OUTPUT_EXPOSURE,
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      gemini31FlashLiteImageMatrix('text_to_image'),
      gemini31FlashLiteImageMatrix('image_edit'),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);

/** Gemini 新 Profile 的默认模型。 */
export const GEMINI_DEFAULT_MODEL_ID = 'gemini-3.1-flash-image';

/** 从 Gemini capability inventory 派生的完整 Profile 模型模板。 */
export const GEMINI_DEFAULT_MODEL_TEMPLATES = Object.freeze(
  GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES.map((capability): ProviderDefaultModelTemplate => {
    const modelId = capability.match.ids?.[0];
    if (!modelId) {
      throw new Error(`Gemini model rule "${capability.ruleId}" requires an exact model id.`);
    }
    return {
      apiFormat: 'gemini-generate-content',
      modelId,
      wireModelId: modelId,
      baseModelId: modelId,
    };
  }),
);
