import type { Asset } from '@imagen-ps/core-engine';
import type { ApiFormat } from './api-format.js';
import type { ProviderOperation } from './capability.js';
import type { ImageOutputSelection } from './image-output-contract.js';

/**
 * Provider request 契约。
 *
 * 只表达 provider 层拥有的最小意图，不包含 host IO、文件路径或原始 HTTP payload。
 */

/** 与 `core-engine` `Asset` 等价的 provider asset 引用。 */
export type AssetRef = Asset;

/** OpenAI Images API 已解析的输出字段。 */
export interface ImageEndpointRequestOutput {
  readonly kind: 'image-endpoint';
  readonly size?: string;
  readonly outputFormat?: 'png' | 'jpeg' | 'webp';
}

/** OpenAI Chat Completions image_config 已解析输出字段。 */
export interface ChatImageRequestOutput {
  readonly kind: 'chat-image';
  readonly imageConfig?: Readonly<Record<string, unknown>>;
}

/** Gemini Generate Content 已解析输出字段。 */
export interface GeminiGenerateContentRequestOutput {
  readonly kind: 'gemini-generate-content';
  readonly responseFormatImage?: Readonly<Record<string, unknown>>;
  readonly imageConfig?: Readonly<Record<string, unknown>>;
}

/** Provider transport 可直接序列化的已解析输出字段。 */
export type ProviderResolvedOutput =
  | ImageEndpointRequestOutput
  | ChatImageRequestOutput
  | GeminiGenerateContentRequestOutput;

/** 归一化后的编辑输入几何上下文。 */
export interface NormalizedImageInputGeometry {
  readonly width: number;
  readonly height: number;
}

/** Provider builder 解析 output selection 时需要的输入上下文。 */
export interface NormalizedImageInputContext {
  /** 多图编辑首轮固定使用第一张输入图。 */
  readonly primaryEditInput?: NormalizedImageInputGeometry;
}

/** 输出偏好信息。
 *
 * 字段集合与 OpenAI Images API（create-image / create-image-edit）的 body parameters 对齐：
 * 调用方以领域语义填写，transport 层负责映射到上游字段
 * （例如 `count → n`、`outputFormat → output_format`）。
 *
 * 已 surface 字段（如 `quality`、`outputFormat`）MUST NOT 通过 `providerOptions`
 * 再次覆盖；transport 层在 applyProviderOptions 中将其列入 handled keys。
 */
export interface ProviderOutputOptions {
  /** 期望输出张数；transport 层映射为上游 `n`。 */
  readonly count?: number;

  /** Canonical 用户输出选择；builder 在运行时映射为 provider payload。 */
  readonly selection?: ImageOutputSelection;

  /** 期望输出宽度。 */
  readonly width?: number;

  /** 期望输出高度。 */
  readonly height?: number;

  /** 语义输出尺寸预设；transport 层负责落到 provider wire 字段。 */
  readonly sizePreset?: '512' | '1k' | '2k' | '4k';

  /** 期望 aspect ratio。 */
  readonly aspectRatio?: 'auto' | 'source' | '1:1' | '16:9' | '9:16' | string;

  /** 背景偏好。 */
  readonly background?: 'auto' | 'transparent' | 'opaque';

  /** 生成质量；canonical 只暴露 4 档，模型专属 wire 值（如 dall-e-3 的 standard/hd）由 transport 内部映射。 */
  readonly quality?: 'auto' | 'low' | 'medium' | 'high';

  /** 输出格式；仅 GPT image 系列支持。 */
  readonly outputFormat?: 'png' | 'jpeg' | 'webp';

  /** `jpeg` / `webp` 输出的压缩率（0-100）。 */
  readonly outputCompression?: number;

  /** 内容审查级别；仅 GPT image 系列支持。 */
  readonly moderation?: 'auto' | 'low';

  /** 对原始输入图像的保真度；仅 edit 调用有意义。 */
  readonly inputFidelity?: 'high' | 'low';
}

/** Provider builder 已解析的模型执行配置。 */
export interface ProviderModelExecution {
  /** 实际发送给上游的 wire model ID。 */
  readonly modelId: string;

  /** 当前 API format；builder 用它校验策略归属。 */
  readonly apiFormat: ApiFormat;

  /** Provider-owned 请求构造策略 ID。 */
  readonly requestStrategyId: string;
}

/** 当前阶段稳定公开的 canonical image request。 */
export interface CanonicalImageJobRequest {
  /** 当前请求是 text_to_image 还是 image_edit。 */
  readonly operation: Extract<ProviderOperation, 'text_to_image' | 'image_edit'>;

  /** 用户 prompt。 */
  readonly prompt: string;

  /** 可选的输入图片（唯一图片输入数组）。 */
  readonly images?: readonly AssetRef[];

  /** 可选的 mask 图片；带 mask 即视为 inpaint 语义，由 provider 内部决定如何落地。 */
  readonly maskImage?: AssetRef;

  /** 期望输出。 */
  readonly output?: ProviderOutputOptions;

  /** 已归一化输入上下文，供 `Use Input Size` 等 output 选择复用。 */
  readonly inputContext?: NormalizedImageInputContext;

  /** Application 已解析的模型执行配置。 */
  readonly model?: ProviderModelExecution;

  /** 受控的 provider-specific 透传空间。 */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/** 当前阶段稳定公开的 provider request 联合。 */
export type ProviderRequest = CanonicalImageJobRequest;
