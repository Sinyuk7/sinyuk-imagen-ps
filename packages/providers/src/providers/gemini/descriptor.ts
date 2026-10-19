import type { ProviderDescriptor } from '../../contract/provider.js';
import { defaultModelTemplates } from '../../catalog/provider-templates.js';

/** Gemini Generate Content provider 的静态 descriptor。 */
export const googleGeminiDescriptor: ProviderDescriptor = {
  id: 'google-gemini',
  family: 'google-gemini',
  displayName: 'Gemini Generate Content',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: defaultModelTemplates('google-gemini'),
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
