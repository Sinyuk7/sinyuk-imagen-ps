import type { ProviderDefaultModelTemplate } from '../contract/provider.js';
import { getProviderCatalog, type FixedProviderId } from '../catalog.js';

/** 从 JSON catalog 派生 Provider 默认模型模板。 */
export function defaultModelTemplates(providerId: FixedProviderId): readonly ProviderDefaultModelTemplate[] {
  const catalog = getProviderCatalog(providerId);
  return catalog.models.map((model) => ({
    providerId,
    modelId: model.id,
    wireModelId: model.id,
    baseModelId: model.id,
  }));
}
