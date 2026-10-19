import type { ProviderDescriptor } from '../../contract/provider.js';
import { defaultModelTemplates } from '../../catalog/provider-templates.js';

/** Image endpoint provider 的静态 descriptor。 */
export const openAiDescriptor: ProviderDescriptor = {
  id: 'openai',
  family: 'openai',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: defaultModelTemplates('openai'),
  transport: {
    wire: {
      supportedEditCodecs: ['multipart-bracket', 'multipart-plain', 'json-reference'],
      defaultEditCodecOrder: ['multipart-bracket', 'json-reference', 'multipart-plain'],
      responseCodecs: ['json'],
    },
  },
  billing: {
    query: 'supported',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'unsupported',
  },
};
