import type { ImageModelCapability } from '../../image-model-capability.js';
import {
  GPT_IMAGE_OUTPUT_CAPABILITY,
  GPT_OUTPUT_EXPOSURE,
  OPENAI_EDIT_INPUT_CAPABILITY,
  gptImageEndpointMatrix,
} from '../output-matrix.js';

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
