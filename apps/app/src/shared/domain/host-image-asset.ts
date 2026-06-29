import type { Asset } from '@imagen-ps/application';
import { imageResourceFromHostImage, type ImageResource } from './image-resource';
import type { PhotoshopCapturePlacement } from './photoshop-placement';

export interface HostImageMetadata {
  readonly source: 'file' | 'layer' | 'generated' | 'simulator' | 'unknown';
  readonly name?: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface HostImagePreviewHandle {
  readonly kind: 'data-url' | 'object-url' | 'none';
  readonly url?: string;
  dispose?(): void;
}

export interface HostImagePayloadRef {
  readonly kind: 'inline-asset' | 'indexed-db' | 'host-object' | 'external-url';
  readonly ref?: string;
}

export interface HostImageAsset {
  readonly asset: Asset;
  readonly resource: ImageResource;
  readonly metadata: HostImageMetadata;
  readonly preview: HostImagePreviewHandle;
  readonly payload: HostImagePayloadRef;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

export function createHostImageAsset(
  asset: Asset,
  options: {
    readonly source: HostImageMetadata['source'];
    readonly previewUrl?: string;
    readonly payloadKind?: HostImagePayloadRef['kind'];
    readonly payloadRef?: string;
    readonly disposePreview?: () => void;
    readonly photoshopPlacement?: PhotoshopCapturePlacement;
    readonly width?: number;
    readonly height?: number;
    readonly byteSize?: number;
  },
): HostImageAsset {
  const byteSize = options.byteSize ?? asset.storedRef?.byteSize ?? (asset.data instanceof Uint8Array ? asset.data.byteLength : undefined);
  const metadata: HostImageMetadata = {
    source: options.source,
    ...(asset.name !== undefined ? { name: asset.name } : {}),
    ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}),
    ...(byteSize !== undefined ? { byteSize } : {}),
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
  };
  const preview: HostImagePreviewHandle = options.previewUrl
    ? { kind: options.previewUrl.startsWith('blob:') ? 'object-url' : 'data-url', url: options.previewUrl, dispose: options.disposePreview }
    : { kind: 'none' };
  const payload: HostImagePayloadRef = {
    kind: options.payloadKind ?? 'inline-asset',
    ...(options.payloadRef !== undefined ? { ref: options.payloadRef } : {}),
  };
  const image = {
    asset,
    metadata,
    preview,
    payload,
    ...(options.photoshopPlacement ? { photoshopPlacement: options.photoshopPlacement } : {}),
  };
  return {
    ...image,
    resource: imageResourceFromHostImage(options.payloadRef ?? asset.storedRef?.ref ?? asset.fileId ?? asset.url ?? asset.name ?? 'host-image', image),
  };
}
