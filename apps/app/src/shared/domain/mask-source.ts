import type { HostImageAsset } from './host-image-asset';
import type { ImageSize } from '../image/resize';

/** 已进入 HostImageAsset -> ImageResource -> StoredAssetRef -> AssetStore 链的 canonical mask。 */
export interface CanonicalMaskAsset extends HostImageAsset {
  readonly canonicalMask: {
    readonly encoding: 'grayscale';
    readonly bitDepth: 8;
    readonly size: ImageSize;
  };
}
