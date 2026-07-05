/**
 * resolveModelBrand 命令
 *
 * 把 providers image-model catalog 的权威身份解析以 sync 命令形式暴露给 UI，
 * 供 surface 把 model 映射到品牌图标。非 catalog provider 或未命中 curated
 * 规则时返回 `undefined`，由上层回落到默认图标。
 */

import {
  type ApiFormat,
  type ModelBrand,
  providerUsesImageModelCatalog,
  tryResolveImageModelRule,
} from '@imagen-ps/providers';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';

export interface ResolveModelBrandInput {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
}

/**
 * 解析 `{apiFormat, modelId}` 对应的模型品牌。
 *
 * 非 catalog provider（如 `mock`）直接返回 `undefined`；
 * 命中 curated 规则返回 `capability.brand`；未命中时返回 `undefined`。
 */
export function resolveModelBrand(input: ResolveModelBrandInput): ModelBrand | undefined {
  const { apiFormat, modelId } = input;
  const providerId = catalogProviderIdForApiFormat(apiFormat);
  if (!providerUsesImageModelCatalog(providerId)) {
    return undefined;
  }
  return tryResolveImageModelRule({ providerId, modelId })?.capability.brand;
}
