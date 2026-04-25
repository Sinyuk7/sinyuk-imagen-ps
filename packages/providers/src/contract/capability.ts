/**
 * Provider capability 契约。
 *
 * 这些类型只描述 provider 自身公开的能力，不携带 host 或 transport 细节。
 */

/** 当前阶段允许的 provider family。 */
export type ProviderFamily = 'openai-compatible';

/** 当前阶段允许的 provider operation。 */
export type ProviderOperation = 'generate' | 'edit';

/** Provider 对外声明的能力集合。 */
export interface ProviderCapabilities {
  /** 是否支持图像生成。 */
  readonly imageGenerate: boolean;

  /** 是否支持图像编辑。 */
  readonly imageEdit: boolean;

  /** 是否支持多图输入。 */
  readonly multiImageInput: boolean;

  /** 是否支持透明背景输出。 */
  readonly transparentBackground: boolean;

  /** 是否支持自定义尺寸。 */
  readonly customSize: boolean;

  /** 是否支持 aspect ratio。 */
  readonly aspectRatio: boolean;

  /** 当前阶段是否支持同步 invoke。 */
  readonly syncInvoke: boolean;
}
