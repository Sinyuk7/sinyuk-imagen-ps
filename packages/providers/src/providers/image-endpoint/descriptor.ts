import type { ProviderDescriptor } from '../../contract/provider.js';
import { listLocalCatalogModels } from '../../contract/image-model-capability.js';

/** Image endpoint provider 的静态 descriptor。 */
export const imageEndpointDescriptor: ProviderDescriptor = {
  id: 'image-endpoint',
  family: 'image-endpoint',
  apiFormat: 'openai-images',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: listLocalCatalogModels('image-endpoint'),
  transport: {
    wire: {
      supportedEditCodecs: ['multipart-bracket', 'multipart-plain', 'json-reference'],
      defaultEditCodecOrder: ['multipart-bracket', 'json-reference', 'multipart-plain'],
      responseCodecs: ['json'],
    },
  },
  billing: {
    supportedModes: ['none', 'new-api'],
    defaultMode: 'new-api',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'supported',
  },
};
