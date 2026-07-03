/**
 * 模型品牌到头像图标的映射，以及 UI 侧便利解析器。
 *
 * 品牌身份由 `@imagen-ps/application` 的 `resolveModelBrand` 命令从 providers
 * catalog 解析；本模块只负责 brand → icon slug 的纯映射与 default 回落。
 */
import type { ModelBrand } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import type { ModelAvatarIconName } from './generated/model-avatar-icons';

/** 品牌到图标 slug 的固定映射。新增 brand 时同步补 SVG 资产。 */
export const BRAND_TO_ICON: Readonly<Record<ModelBrand, ModelAvatarIconName>> = {
  openai: 'gpt',
  'google-gemini': 'nano-banana',
  'google-other': 'google',
  xai: 'grok',
  qwen: 'qwen',
  doubao: 'doubao',
};

/** 把品牌映射为图标 slug；未知或缺失回落到 `default`。 */
export function brandToIconSlug(brand: ModelBrand | undefined): ModelAvatarIconName {
  return brand ? (BRAND_TO_ICON[brand] ?? 'default') : 'default';
}

/**
 * 经 application 命令解析 `{providerId, modelId}` 的品牌并映射为图标 slug。
 * 非 catalog provider、未命中 curated 规则、或字段缺失时回落到 `default`。
 */
export function resolveModelAvatarIconSlug(args: {
  readonly services: AppServices;
  readonly providerId?: string;
  readonly modelId?: string;
}): ModelAvatarIconName {
  const { services, providerId, modelId } = args;
  if (!providerId || !modelId) {
    return 'default';
  }
  const brand = services.commands.resolveModelBrand({ providerId, modelId });
  return brandToIconSlug(brand);
}
