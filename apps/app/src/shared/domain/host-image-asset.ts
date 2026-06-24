import type { Asset } from '@imagen-ps/application';

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
  readonly metadata: HostImageMetadata;
  readonly preview: HostImagePreviewHandle;
  readonly payload: HostImagePayloadRef;
}

export function createHostImageAsset(
  asset: Asset,
  options: {
    readonly source: HostImageMetadata['source'];
    readonly previewUrl?: string;
    readonly payloadKind?: HostImagePayloadRef['kind'];
    readonly payloadRef?: string;
    readonly disposePreview?: () => void;
  },
): HostImageAsset {
  return {
    asset,
    metadata: {
      source: options.source,
      ...(asset.name !== undefined ? { name: asset.name } : {}),
      ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}),
      ...(asset.data instanceof Uint8Array ? { byteSize: asset.data.byteLength } : {}),
    },
    preview: options.previewUrl
      ? { kind: options.previewUrl.startsWith('blob:') ? 'object-url' : 'data-url', url: options.previewUrl, dispose: options.disposePreview }
      : { kind: 'none' },
    payload: {
      kind: options.payloadKind ?? 'inline-asset',
      ...(options.payloadRef !== undefined ? { ref: options.payloadRef } : {}),
    },
  };
}
