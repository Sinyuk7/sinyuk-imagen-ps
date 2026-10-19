import type { ProviderDescriptor } from '../../contract/provider.js';
import { defaultModelTemplates } from '../../catalog/provider-templates.js';

/** GRSAI Generate provider 的静态 descriptor。 */
export const grsaiDescriptor: ProviderDescriptor = {
  id: 'grsai',
  family: 'grsai',
  displayName: 'GRSAI Generate',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'async',
  defaultModelTemplates: defaultModelTemplates('grsai'),
  billing: {
    query: 'supported',
    mode: 'fixed',
    protocols: ['credits-token-json-v1', 'credits-api-key-json-v1'],
  },
};
