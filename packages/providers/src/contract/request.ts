import type { Asset } from '@imagen-ps/core-engine';
import type { ApiFormat } from './api-format.js';
import type { ProviderOperation } from './capability.js';
import type { ImageOutputSelection } from './image-output-contract.js';
import type { MaskExecutionPlan } from './image-model-capability.js';

/** 旧 provider transport 的内部执行锚点；固定 provider 请求不再填充。 */
export interface ProviderModelExecution {
  readonly modelId: string;
  readonly apiFormat: ApiFormat;
  readonly requestStrategyId: string;
}

/**
 * Provider request 契约。
 *
 * 只表达 provider 层拥有的最小意图，不包含 host IO、文件路径或原始 HTTP payload。
 */

/** 与 `core-engine` `Asset` 等价的 provider asset 引用。 */
export type AssetRef = Asset;

/** Primary-bound canonical Mask；wire conversion 仅可在 provider transport 发生。 */
export interface CanonicalMaskImage {
  /** canonical 8-bit grayscale PNG asset。 */
  readonly asset: AssetRef;
  /** 必须与 request 的 primary attachment identity 完全一致。 */
  readonly targetAttachmentId: string;
  /** canonical Mask 的 provider-input dimensions。 */
  readonly dimensions: NormalizedImageInputGeometry;
  readonly encoding: 'grayscale-png';
  readonly bitDepth: 8;
  readonly polarity: 'white-edit';
}

/** OpenAI Images API 已解析的输出字段。 */
export interface ImageEndpointRequestOutput {
  readonly kind: 'image-endpoint';
  readonly size?: string;
  readonly outputFormat?: 'png' | 'jpeg' | 'webp';
}

/** Gemini Generate Content 已解析输出字段。 */
export interface GeminiGenerateContentRequestOutput {
  readonly kind: 'gemini-generate-content';
  readonly imageConfig?: Readonly<Record<string, unknown>>;
}

/** GRSAI Generate 已解析的输出字段。 */
export interface GrsaiGenerateRequestOutput {
  readonly kind: 'grsai-generate';
  readonly aspectRatio?: string;
  readonly imageSize?: '1K' | '2K' | '4K';
}

/** Provider transport 可直接序列化的已解析输出字段。 */
export type ProviderResolvedOutput =
  | ImageEndpointRequestOutput
  | GeminiGenerateContentRequestOutput
  | GrsaiGenerateRequestOutput;

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

/** 当前阶段稳定公开的 canonical image request。 */
export interface CanonicalImageJobRequest {
  /** 当前请求是 text_to_image 还是 image_edit。 */
  readonly operation: Extract<ProviderOperation, 'text_to_image' | 'image_edit'>;

  /** 用户 prompt。 */
  readonly prompt: string;
  /** 固定 provider catalog 模型标识；由 adapter 负责映射到 wire 请求。 */
  readonly providerId?: 'grsai' | 'runninghub';
  /** 当前 catalog 模型标识。 */
  readonly modelId?: string;
  /** 固定 provider catalog 参数值集合。 */
  readonly parameters?: Readonly<Record<string, string>>;

  /** 可选的输入图片（唯一图片输入数组）。 */
  readonly images?: readonly AssetRef[];

  /** Primary attachment 的 immutable identity；native Mask 必须绑定它。 */
  readonly primaryAttachmentId?: string;

  /** 可选的 primary-bound canonical Mask；transport 按 execution plan 决定转换或省略。 */
  readonly maskImage?: CanonicalMaskImage;

  /** Admission 从 selected target 派生的 immutable Mask route；有 Mask 时必须显式提供。 */
  readonly maskExecutionPlan?: MaskExecutionPlan;

  /** 期望输出。 */
  readonly output?: ProviderOutputOptions;

  /** 已归一化输入上下文，供 `Use Input Size` 等 output 选择复用。 */
  readonly inputContext?: NormalizedImageInputContext;

  /** 兼容仍注册的历史 transport；GRSAI/RunningHub 不使用。 */
  readonly model?: ProviderModelExecution;
  readonly capabilityModelId?: string;

  /** 受控的 provider-specific 透传空间。 */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/** 当前阶段稳定公开的 provider request 联合。 */
export type ProviderRequest = CanonicalImageJobRequest;
