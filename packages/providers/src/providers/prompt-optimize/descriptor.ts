import type { ProviderDescriptor } from '../../contract/provider.js';

/** Prompt optimize provider 的静态 descriptor。 */
export const promptOptimizeDescriptor: ProviderDescriptor = {
  id: 'prompt-optimize',
  family: 'prompt-optimize',
  displayName: 'Prompt Optimizer',
  operations: ['text_to_image'],
  invokeMode: 'sync',
};
