import type { ProviderDescriptor } from '../../contract/provider.js';

/** Image endpoint provider 的静态 descriptor。 */
export const imageEndpointDescriptor: ProviderDescriptor = {
  id: 'image-endpoint',
  family: 'image-endpoint',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'gpt-image-2' }, { id: 'gpt-image-1' }],
};
