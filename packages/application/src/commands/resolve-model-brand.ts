/**
 * resolveModelBrand 命令
 *
 * 从统一 provider catalog 解析 UI 所需的模型品牌标识。
 */

import {
  type FixedProviderId,
  type ModelBrand,
  getProviderCatalogModel,
} from '@imagen-ps/providers';

export interface ResolveModelBrandInput {
  readonly providerId: FixedProviderId;
  readonly modelId: string;
}

/**
 * 解析 `{providerId, modelId}` 对应的模型品牌。
 *
 * 模型存在于 catalog 时返回 provider 标识，未知模型返回 `undefined`。
 */
export function resolveModelBrand(input: ResolveModelBrandInput): ModelBrand | undefined {
  const { providerId, modelId } = input;
  return getProviderCatalogModel(providerId, modelId) ? providerId : undefined;
}
