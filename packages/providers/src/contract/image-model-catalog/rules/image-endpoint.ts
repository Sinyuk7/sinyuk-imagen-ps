import type { ImageModelCapability } from '../../image-model-capability.js';
import { gptImageEndpointMatrix } from '../output-matrix.js';

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
    outputMatrix: [
      gptImageEndpointMatrix('text_to_image'),
      gptImageEndpointMatrix('image_edit'),
    ],
  },
] as const satisfies readonly ImageModelCapability[]);
