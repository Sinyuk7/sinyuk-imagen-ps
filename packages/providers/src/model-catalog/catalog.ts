import type { ImageModelCapability } from '../contract/image-model-capability.js';
import { GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES } from '../providers/gemini/models.js';
import { GRSAI_GENERATE_MODEL_CAPABILITIES } from '../providers/grsai/models.js';
import { IMAGE_ENDPOINT_MODEL_CAPABILITIES } from '../providers/openai-images/models.js';

export const IMAGE_MODEL_CAPABILITIES = Object.freeze([
  ...IMAGE_ENDPOINT_MODEL_CAPABILITIES,
  ...GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES,
  ...GRSAI_GENERATE_MODEL_CAPABILITIES,
] as const satisfies readonly ImageModelCapability[]);
