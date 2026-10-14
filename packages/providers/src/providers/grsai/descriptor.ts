import type { ProviderDescriptor } from '../../contract/provider.js';
import { GRSAI_DEFAULT_MODEL_TEMPLATES } from './models.js';

/** GRSAI Generate provider 的静态 descriptor。 */
export const grsaiGenerateDescriptor: ProviderDescriptor = {
  id: 'grsai-generate',
  family: 'grsai-generate',
  apiFormat: 'grsai',
  displayName: 'GRSAI Generate',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'async',
  defaultModelTemplates: GRSAI_DEFAULT_MODEL_TEMPLATES,
  billing: {
    query: 'supported',
    mode: 'fixed',
    protocols: ['credits-token-json-v1', 'credits-api-key-json-v1'],
  },
};
