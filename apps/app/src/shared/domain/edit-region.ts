import type { ImageSize } from '../image/resize';
import type { HostImageAsset } from './host-image-asset';
import type { PhotoshopRect } from './photoshop-placement';

/** Primary attachment 的稳定身份；任一字段变化均使既有 Edit Region 失效。 */
export interface PrimaryKey {
  readonly attachmentId: string;
  readonly resourceId: string;
  readonly providerInputRef: string;
  readonly sourceSnapshotId?: string;
  readonly sourceBounds?: PhotoshopRect;
  readonly targetSize: ImageSize;
}

/** Edit Region 与 Primary provider-input 共用的唯一坐标系。 */
export interface EditRegionGeometry {
  readonly sourceBounds: PhotoshopRect;
  readonly targetSize: ImageSize;
  readonly coordinateSpace: 'primary-provider-input';
}

/** 绑定到 Primary 的 canonical Photoshop mask。 */
export interface EditRegion {
  readonly targetAttachmentId: string;
  readonly source:
    | { readonly kind: 'photoshop-selection'; readonly documentId: number; readonly layerId: number }
    | { readonly kind: 'photoshop-user-layer-mask'; readonly documentId: number; readonly layerId: number };
  readonly geometry: EditRegionGeometry;
  readonly mask: {
    readonly asset: HostImageAsset;
    readonly encoding: 'grayscale-png';
    readonly bitDepth: 8;
    readonly polarity: 'white-edit';
  };
}

/** 用户意图独立于当前 Primary 的 effective Mask state。 */
export interface MaskPreference {
  readonly enabled: boolean;
}

/** Coordinator 对当前 Primary 发布的 effective state。 */
export type MaskBindingState =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'no-primary' }
  | { readonly kind: 'loading'; readonly targetAttachmentId: string; readonly generation: number }
  | { readonly kind: 'ready'; readonly targetAttachmentId: string; readonly generation: number; readonly editRegion: EditRegion }
  | { readonly kind: 'none'; readonly targetAttachmentId: string }
  | { readonly kind: 'error'; readonly targetAttachmentId: string; readonly message: string };
