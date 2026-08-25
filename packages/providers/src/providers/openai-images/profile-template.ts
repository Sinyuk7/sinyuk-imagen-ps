import type { ProviderProfileTemplate } from '../../contract/provider.js';
import { OPENAI_IMAGES_DEFAULT_MODEL_ID } from './models.js';

/** OpenAI Images 专用 Profile surface 使用的固定、无 secret 配置。 */
export const openAiImagesProfileTemplate: ProviderProfileTemplate = Object.freeze({
  endpointUrl: 'https://api.openai.com/v1',
  paths: { generation: '/images/generations', edit: '/images/edits' },
  authMode: 'bearer',
  defaultModelId: OPENAI_IMAGES_DEFAULT_MODEL_ID,
});
