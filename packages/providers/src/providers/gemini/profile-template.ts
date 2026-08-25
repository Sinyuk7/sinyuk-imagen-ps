import type { ProviderProfileTemplate } from '../../contract/provider.js';
import { GEMINI_DEFAULT_MODEL_ID } from './models.js';

/** Gemini 专用 Profile surface 使用的固定、无 secret 配置。 */
export const geminiProfileTemplate: ProviderProfileTemplate = Object.freeze({
  endpointUrl: 'https://generativelanguage.googleapis.com/v1beta',
  paths: { invokeTemplate: '/models/{model}:generateContent' },
  authMode: 'x-goog-api-key',
  defaultModelId: GEMINI_DEFAULT_MODEL_ID,
});
