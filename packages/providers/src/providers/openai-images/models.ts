import type { ImageModelCapability } from '../../contract/image-model-capability.js';
import type { ProviderDefaultModelTemplate } from '../../contract/provider.js';
import { OPENAI_EDIT_INPUT_CAPABILITY } from '../../model-catalog/shared/matrix/edit-input-capabilities.js';
import {
  GPT_IMAGE_OUTPUT_CAPABILITY,
  GPT_OUTPUT_EXPOSURE,
  gptImageEndpointMatrix,
} from '../../model-catalog/shared/matrix/openai-gpt-image-2.js';

export const IMAGE_ENDPOINT_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'image-endpoint-gpt-image-2',
    match: {
      ids: ['gpt-image-2', 'chatgpt-image-latest'],
    },
    displayName: 'GPT Image 2',
    brand: 'openai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    outputCapability: GPT_IMAGE_OUTPUT_CAPABILITY,
    outputExposure: GPT_OUTPUT_EXPOSURE,
    editInput: OPENAI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [
      gptImageEndpointMatrix('text_to_image'),
      gptImageEndpointMatrix('image_edit'),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);

/** OpenAI Images 新 Profile 的默认模型。 */
export const OPENAI_IMAGES_DEFAULT_MODEL_ID = 'gpt-image-2';

/** 从 OpenAI Images capability inventory 派生的完整 Profile 模型模板。 */
export const OPENAI_IMAGES_DEFAULT_MODEL_TEMPLATES = Object.freeze(
  IMAGE_ENDPOINT_MODEL_CAPABILITIES.map((capability): ProviderDefaultModelTemplate => {
    const modelId = capability.match.ids?.[0];
    if (!modelId) {
      throw new Error(`OpenAI Images model rule "${capability.ruleId}" requires an exact model id.`);
    }
    return { apiFormat: 'openai-images', modelId, wireModelId: modelId, baseModelId: modelId };
  }),
);
