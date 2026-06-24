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
