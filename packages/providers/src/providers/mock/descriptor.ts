import type { ProviderDescriptor } from '../../contract/provider.js';

/** Mock provider 的静态 descriptor。 */
export const mockDescriptor: ProviderDescriptor = {
  id: 'mock',
  family: 'openai-compatible',
  displayName: 'Mock Provider',
  capabilities: {
    imageGenerate: true,
    imageEdit: true,
    multiImageInput: false,
    transparentBackground: false,
    customSize: false,
    aspectRatio: false,
    syncInvoke: true,
  },
  operations: ['generate', 'edit'],
};
