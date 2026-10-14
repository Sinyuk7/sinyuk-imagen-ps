import type { AssetRef, CanonicalMaskImage } from './request.js';
import type { FixedProviderId } from '../catalog.js';

/** 固定 provider lane 的 host-neutral 生成意图。 */
export interface FixedGenerationRequest {
  readonly providerId: FixedProviderId;
  readonly modelId: string;
  readonly operation: 'text_to_image' | 'image_edit';
  readonly prompt: string;
  readonly images?: readonly AssetRef[];
  readonly maskImage?: CanonicalMaskImage;
  readonly parameters: Readonly<Record<string, string>>;
}

/** 固定 provider 返回的统一图片结果。 */
export interface FixedProviderResult {
  readonly assets: readonly AssetRef[];
  readonly text?: string;
  readonly metadata?: {
    readonly width?: number;
    readonly height?: number;
    readonly format?: 'png' | 'jpeg' | 'webp';
  };
  readonly diagnostics?: Readonly<Record<string, string>>;
}
