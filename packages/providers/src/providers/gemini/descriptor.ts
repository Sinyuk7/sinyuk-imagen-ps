import type { ProviderDescriptor } from '../../contract/provider.js';
import { GEMINI_DEFAULT_MODEL_TEMPLATES } from './models.js';

/** Gemini Generate Content provider 的静态 descriptor。 */
export const geminiGenerateContentDescriptor: ProviderDescriptor = {
  id: 'gemini-generate-content',
  family: 'gemini-generate-content',
  apiFormat: 'gemini-generate-content',
  displayName: 'Gemini Generate Content',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: GEMINI_DEFAULT_MODEL_TEMPLATES,
  transport: {
    wire: {
      responseCodecs: ['json'],
    },
  },
  billing: {
    query: 'supported',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'supported',
  },
};
