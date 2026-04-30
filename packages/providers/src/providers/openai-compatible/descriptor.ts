import type { ProviderDescriptor } from '../../contract/provider.js';

/** OpenAI-compatible provider 的静态 descriptor。 */
export const openaiCompatibleDescriptor: ProviderDescriptor = {
  id: 'openai-compatible',
  family: 'openai-compatible',
  displayName: 'OpenAI-compatible Provider',
  capabilities: {
    imageGenerate: true,
    imageEdit: true,
    multiImageInput: true,
    transparentBackground: true,
    customSize: true,
    aspectRatio: false,
    syncInvoke: true,
  },
  operations: ['generate', 'edit'],
};
