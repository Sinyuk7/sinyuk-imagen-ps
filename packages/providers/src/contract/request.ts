import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderOperation } from './capability.js';

/**
 * Provider request 契约。
 *
 * 只表达 provider 层拥有的最小意图，不包含 host IO、文件路径或原始 HTTP payload。
 */

/** 与 `core-engine` `Asset` 等价的 provider asset 引用。 */
export type AssetRef = Asset;

/** 输出偏好信息。 */
export interface ProviderOutputOptions {
  /** 期望输出张数。 */
  readonly count?: number;

  /** 期望输出宽度。 */
  readonly width?: number;

  /** 期望输出高度。 */
  readonly height?: number;

  /** 期望 aspect ratio。 */
  readonly aspectRatio?: string;

  /** 背景偏好。 */
  readonly background?: 'auto' | 'transparent' | 'opaque';

  /** 质量提示。 */
  readonly qualityHint?: 'speed' | 'balanced' | 'quality';
}

/** 当前阶段稳定公开的 canonical image request。 */
export interface CanonicalImageJobRequest {
  /** 当前请求是 generate 还是 edit。 */
  readonly operation: ProviderOperation;

  /** 用户 prompt。 */
  readonly prompt: string;

  /** 可选的输入素材。 */
  readonly inputAssets?: readonly AssetRef[];

  /** 可选的 mask 素材。 */
  readonly maskAsset?: AssetRef;

  /** 期望输出。 */
  readonly output?: ProviderOutputOptions;

  /** 受控的 provider-specific 透传空间。 */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/** 当前阶段稳定公开的 provider request 联合。 */
export type ProviderRequest = CanonicalImageJobRequest;
