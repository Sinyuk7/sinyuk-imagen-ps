/**
 * resolveModelBrand 命令
 *
 * 把 providers image-model catalog 的权威身份解析以 sync 命令形式暴露给 UI，
 * 供 surface 把 model 映射到品牌图标。非 catalog provider 或未命中 curated
 * 规则时返回 `undefined`，由上层回落到默认图标。
 */

import {
  type ModelBrand,
  providerUsesImageModelCatalog,
  resolveImageModelRule,
} from '@imagen-ps/providers';

export interface ResolveModelBrandInput {
  readonly providerId: string;
  readonly modelId: string;
}

/**
 * 解析 `{providerId, modelId}` 对应的模型品牌。
 *
 * 非 catalog provider（如 `mock`、`prompt-optimize`）直接返回 `undefined`；
 * 命中 curated 规则返回 `capability.brand`；命中 default/fallback 规则时
 * `brand` 为 `undefined`。
 */
export function resolveModelBrand(input: ResolveModelBrandInput): ModelBrand | undefined {
  const { providerId, modelId } = input;
  if (!providerUsesImageModelCatalog(providerId)) {
    return undefined;
  }
  return resolveImageModelRule({ providerId, modelId }).capability.brand;
}
