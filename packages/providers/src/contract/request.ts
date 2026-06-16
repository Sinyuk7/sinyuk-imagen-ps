import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderOperation } from './capability.js';

/**
 * Provider request 契约。
 *
 * 只表达 provider 层拥有的最小意图，不包含 host IO、文件路径或原始 HTTP payload。
 */

/** 与 `core-engine` `Asset` 等价的 provider asset 引用。 */
export type AssetRef = Asset;

/** 输出偏好信息。
 *
 * 字段集合与
 * `docs/dev-memory/memories/architecture/provider-openapi-reference/`
 * 中 create-image / create-image-edit 快照的 body parameters 对齐：
 * 调用方以领域语义填写，transport 层负责映射到上游字段
 * （例如 `count → n`、`outputFormat → output_format`）。
 *
 * 已 surface 字段（如 `quality`、`outputFormat`）MUST NOT 通过 `providerOptions`
 * 再次覆盖；transport 层在 applyProviderOptions 中将其列入 handled keys。
 */
export interface ProviderOutputOptions {
  /** 期望输出张数；transport 层映射为上游 `n`。 */
  readonly count?: number;

  /** 期望输出宽度。 */
  readonly width?: number;

  /** 期望输出高度。 */
  readonly height?: number;

  /** 期望 aspect ratio。 */
  readonly aspectRatio?: string;

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
  readonly operation: ProviderOperation;

  /** 用户 prompt。 */
  readonly prompt: string;

  /** 可选的输入图片（唯一图片输入数组）。 */
  readonly images?: readonly AssetRef[];

  /** 可选的 mask 图片；带 mask 即视为 inpaint 语义，由 provider 内部决定如何落地。 */
  readonly maskImage?: AssetRef;

  /** 期望输出。 */
  readonly output?: ProviderOutputOptions;

  /** 受控的 provider-specific 透传空间。 */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/** 当前阶段稳定公开的 provider request 联合。 */
export type ProviderRequest = CanonicalImageJobRequest;
