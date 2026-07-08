import type { ProviderDescriptor } from '../../contract/provider.js';
import { listLocalCatalogModels } from '../../contract/image-model-capability.js';

/** Gemini Generate Content provider 的静态 descriptor。 */
export const geminiGenerateContentDescriptor: ProviderDescriptor = {
  id: 'gemini-generate-content',
  family: 'gemini-generate-content',
  apiFormat: 'gemini-generate-content',
  displayName: 'Gemini Generate Content',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: listLocalCatalogModels('gemini-generate-content'),
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
