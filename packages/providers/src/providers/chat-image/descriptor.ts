import type { ProviderDescriptor } from '../../contract/provider.js';
import { listLocalCatalogModels } from '../../contract/image-model-capability.js';

/** Chat image provider 的静态 descriptor。 */
export const chatImageDescriptor: ProviderDescriptor = {
  id: 'chat-image',
  family: 'chat-image',
  apiFormat: 'openai-chat-completions',
  displayName: 'Chat Image',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: listLocalCatalogModels('chat-image'),
  transport: {
    wire: {
      supportedImageRequestCodecs: ['chat-completions-image-legacy'],
      defaultImageRequestCodec: 'chat-completions-image-legacy',
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
