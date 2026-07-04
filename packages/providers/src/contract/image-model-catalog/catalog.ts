import type { ImageModelCapability } from '../image-model-capability.js';
import { CHAT_IMAGE_MODEL_CAPABILITIES } from './rules/chat-image.js';
import { GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES } from './rules/gemini-generate-content.js';
import { IMAGE_ENDPOINT_MODEL_CAPABILITIES } from './rules/image-endpoint.js';

export const IMAGE_MODEL_CAPABILITIES = Object.freeze([
  ...IMAGE_ENDPOINT_MODEL_CAPABILITIES,
  ...CHAT_IMAGE_MODEL_CAPABILITIES,
  ...GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES,
] as const satisfies readonly ImageModelCapability[]);
