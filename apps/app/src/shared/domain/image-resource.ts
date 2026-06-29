import type { Asset, StoredAssetRef } from '@imagen-ps/application';
import type { PhotoshopCapturePlacement } from './photoshop-placement';

export type ImageResourceSource = 'local-file' | 'photoshop-layer' | 'photoshop-capture' | 'provider-output';
export type ImageDerivativeRole = 'thumbnail' | 'provider-input';
export type ImageDerivativeKind = 'pending' | 'ready' | 'failed' | 'cancelled';

export interface ImageDerivativeState {
  readonly kind: ImageDerivativeKind;
  readonly role: ImageDerivativeRole;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly storedRef?: StoredAssetRef;
  readonly previewUrl?: string;
  readonly errorMessage?: string;
}

export interface ImageResource {
  readonly id: string;
  readonly source: ImageResourceSource;
  readonly original?: {
    readonly width?: number;
    readonly height?: number;
    readonly mimeType?: string;
    readonly name?: string;
    readonly byteSize?: number;
    readonly storedRef?: StoredAssetRef;
    readonly externalUrl?: string;
  };
  readonly derivatives: {
    readonly thumbnail?: ImageDerivativeState;
    readonly providerInput?: ImageDerivativeState;
  };
  readonly placement?: PhotoshopCapturePlacement;
}

export interface HostImageResourceInput {
  readonly asset: Asset;
  readonly metadata: {
    readonly source: 'file' | 'layer' | 'generated' | 'simulator' | 'unknown';
    readonly name?: string;
    readonly mimeType?: string;
    readonly byteSize?: number;
    readonly width?: number;
    readonly height?: number;
  };
  readonly preview: {
    readonly url?: string;
  };
  readonly payload: {
    readonly kind: 'inline-asset' | 'indexed-db' | 'host-object' | 'external-url';
    readonly ref?: string;
  };
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

export interface ImageResourceAttachmentInput {
  readonly id: string;
  readonly type: 'layer' | 'file' | 'photoshop-capture';
  readonly image: HostImageResourceInput;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

function sourceFromHostImage(image: HostImageResourceInput): ImageResourceSource {
  if (image.metadata.source === 'generated') {
    return 'provider-output';
  }
  if (image.metadata.source === 'layer') {
    return 'photoshop-layer';
  }
  return 'local-file';
}

function storedRefFromAsset(asset: Asset): StoredAssetRef | undefined {
  return asset.storedRef;
}

function storedRefFromPayload(image: HostImageResourceInput): StoredAssetRef | undefined {
  const storedRef = storedRefFromAsset(image.asset);
  if (storedRef !== undefined) {
    return storedRef;
  }
  if (image.payload.kind !== 'host-object' || !image.payload.ref) {
    return undefined;
  }
  return {
    kind: 'hostObject',
    ref: image.payload.ref,
    ...(image.asset.name ? { name: image.asset.name } : {}),
    ...(image.asset.mimeType ? { mimeType: image.asset.mimeType } : {}),
    ...(image.metadata.byteSize !== undefined ? { byteSize: image.metadata.byteSize } : {}),
  };
}

function originalFromHostImage(image: HostImageResourceInput): ImageResource['original'] {
  const storedRef = storedRefFromPayload(image);
  return {
    ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
    ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
    ...(image.asset.mimeType ?? image.metadata.mimeType ? { mimeType: image.asset.mimeType ?? image.metadata.mimeType } : {}),
    ...(image.asset.name ?? image.metadata.name ? { name: image.asset.name ?? image.metadata.name } : {}),
    ...(image.metadata.byteSize !== undefined ? { byteSize: image.metadata.byteSize } : {}),
    ...(storedRef !== undefined ? { storedRef } : {}),
    ...(image.asset.url ? { externalUrl: image.asset.url } : {}),
  };
}

function thumbnailFromHostImage(image: HostImageResourceInput): ImageDerivativeState | undefined {
  if (!image.preview.url) {
    return undefined;
  }
  return {
    kind: 'ready',
    role: 'thumbnail',
    ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
    ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
    ...(image.asset.mimeType ?? image.metadata.mimeType ? { mimeType: image.asset.mimeType ?? image.metadata.mimeType } : {}),
    previewUrl: image.preview.url,
  };
}

function providerInputFromHostImage(image: HostImageResourceInput): ImageDerivativeState {
  const storedRef = storedRefFromPayload(image);
  if (storedRef === undefined) {
    return { kind: 'pending', role: 'provider-input' };
  }
  const plan = image.photoshopPlacement?.providerInputPlan;
  return {
    kind: 'ready',
    role: 'provider-input',
    ...(plan?.targetWidth ?? image.metadata.width ? { width: plan?.targetWidth ?? image.metadata.width } : {}),
    ...(plan?.targetHeight ?? image.metadata.height ? { height: plan?.targetHeight ?? image.metadata.height } : {}),
    ...(storedRef.mimeType ?? image.asset.mimeType ?? image.metadata.mimeType
      ? { mimeType: storedRef.mimeType ?? image.asset.mimeType ?? image.metadata.mimeType }
      : {}),
    storedRef,
  };
}

export function imageResourceFromHostImage(
  id: string,
  image: HostImageResourceInput,
  options?: {
    readonly source?: ImageResourceSource;
    readonly placement?: PhotoshopCapturePlacement;
  },
): ImageResource {
  const placement = options?.placement ?? image.photoshopPlacement;
  return {
    id,
    source: options?.source ?? sourceFromHostImage(image),
    original: originalFromHostImage(image),
    derivatives: {
      ...(thumbnailFromHostImage(image) ? { thumbnail: thumbnailFromHostImage(image) } : {}),
      providerInput: providerInputFromHostImage(image),
    },
    ...(placement ? { placement } : {}),
  };
}

export function imageResourceFromAttachment(attachment: ImageResourceAttachmentInput): ImageResource {
  const source =
    attachment.type === 'photoshop-capture'
      ? 'photoshop-capture'
      : attachment.type === 'layer'
        ? 'photoshop-layer'
        : 'local-file';
  return imageResourceFromHostImage(attachment.id, attachment.image, {
    source,
    placement: attachment.photoshopPlacement,
  });
}
