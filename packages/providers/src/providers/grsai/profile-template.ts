import type { ProviderProfileTemplate } from '../../contract/provider.js';
import { GRSAI_DEFAULT_MODEL_ID } from './models.js';

/** GRSAI 专用 Profile surface 使用的固定、无 secret 配置。 */
export const grsaiProfileTemplate: ProviderProfileTemplate = Object.freeze({
  endpointUrl: 'https://grsai.dakka.com.cn',
  paths: { submit: '/v1/api/generate', result: '/v1/api/result' },
  authMode: 'bearer',
  defaultModelId: GRSAI_DEFAULT_MODEL_ID,
});
