import type { Asset, StoredAssetRef } from '@imagen-ps/application';
import type { AssetPreview } from '../domain/mappers';
import { assetToPreviewUrl } from '../domain/mappers';

const DEFAULT_THUMBNAIL_MAX_SIDE = 512;
const DEFAULT_MAX_INLINE_THUMBNAIL_BYTES = 512 * 1024;

export interface ThumbnailRequest {
  readonly asset: Asset;
  readonly label?: string;
  readonly sourceKey?: string;
  readonly maxSide?: number;
  readonly signal?: AbortSignal;
}

export interface ThumbnailEntry {
  readonly preview: AssetPreview;
  readonly cacheKey: string;
  release(): void;
}

export interface ThumbnailStore {
  getOrCreate(request: ThumbnailRequest): Promise<ThumbnailEntry>;
  release(cacheKey: string): void;
  clear(): void;
}

export interface ThumbnailStoreOptions {
  readonly maxInlineBytes?: number;
  readonly resolveStoredRef?: (ref: StoredAssetRef) => Promise<ArrayBuffer | undefined>;
  readonly createObjectUrl?: (bytes: Uint8Array, mimeType: string) => { readonly url: string; release(): void };
}

interface CacheEntry {
  readonly preview: AssetPreview;
  readonly release: () => void;
  refs: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Thumbnail generation was cancelled.', 'AbortError');
  }
}

function sourceKeyFor(asset: Asset, sourceKey: string | undefined): string {
  if (sourceKey) {
    return sourceKey;
  }
  if (asset.storedRef) {
    return `${asset.storedRef.kind}:${asset.storedRef.ref}`;
  }
  if (asset.url) {
    return `url:${asset.url}`;
  }
  if (asset.fileId) {
    return `file:${asset.fileId}`;
  }
  return `inline:${asset.name ?? 'asset'}:${asset.mimeType ?? 'image/png'}`;
}

function sanitizedAsset(asset: Asset): Asset {
  return {
    type: asset.type,
    ...(asset.name ? { name: asset.name } : {}),
    ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    ...(asset.url ? { url: asset.url } : {}),
    ...(asset.fileId ? { fileId: asset.fileId } : {}),
    ...(asset.storedRef ? { storedRef: asset.storedRef } : {}),
  };
}

function bytesFromAsset(asset: Asset): Uint8Array | undefined {
  if (asset.data instanceof Uint8Array) {
    return asset.data;
  }
  return undefined;
}

function previewFromAsset(asset: Asset): string {
  if (asset.storedRef && !asset.url && !asset.data) {
    return '';
  }
  return assetToPreviewUrl(asset);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function createMemoryThumbnailStore(options: ThumbnailStoreOptions = {}): ThumbnailStore {
  const cache = new Map<string, CacheEntry>();
  const maxInlineBytes = options.maxInlineBytes ?? DEFAULT_MAX_INLINE_THUMBNAIL_BYTES;

  async function thumbnailUrlFor(asset: Asset, signal: AbortSignal | undefined): Promise<{ readonly url: string; release(): void }> {
    throwIfAborted(signal);
    const direct = previewFromAsset(asset);
    if (direct) {
      return { url: direct, release: () => undefined };
    }

    if (asset.storedRef && options.resolveStoredRef) {
      const resolved = await options.resolveStoredRef(asset.storedRef);
      throwIfAborted(signal);
      if (resolved !== undefined && resolved.byteLength <= maxInlineBytes) {
        const bytes = new Uint8Array(resolved);
        if (options.createObjectUrl) {
          return options.createObjectUrl(bytes, asset.mimeType ?? asset.storedRef.mimeType ?? 'image/png');
        }
        return {
          url: `data:${asset.mimeType ?? asset.storedRef.mimeType ?? 'image/png'};base64,${bytesToBase64(bytes)}`,
          release: () => undefined,
        };
      }
    }

    const inlineBytes = bytesFromAsset(asset);
    if (inlineBytes !== undefined && inlineBytes.byteLength <= maxInlineBytes) {
      return {
        url: assetToPreviewUrl(asset),
        release: () => undefined,
      };
    }

    return { url: '', release: () => undefined };
  }

  return {
    async getOrCreate(request): Promise<ThumbnailEntry> {
      const maxSide = request.maxSide ?? DEFAULT_THUMBNAIL_MAX_SIDE;
      const cacheKey = `${sourceKeyFor(request.asset, request.sourceKey)}:${maxSide}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        cached.refs += 1;
        return {
          preview: cached.preview,
          cacheKey,
          release: () => this.release(cacheKey),
        };
      }

      const generated = await thumbnailUrlFor(request.asset, request.signal);
      const preview: AssetPreview = {
        asset: sanitizedAsset(request.asset),
        url: generated.url,
        label: request.label ?? request.asset.name ?? 'Asset',
      };
      cache.set(cacheKey, { preview, release: generated.release, refs: 1 });
      return {
        preview,
        cacheKey,
        release: () => this.release(cacheKey),
      };
    },
    release(cacheKey): void {
      const entry = cache.get(cacheKey);
      if (!entry) {
        return;
      }
      entry.refs -= 1;
      if (entry.refs > 0) {
        return;
      }
      entry.release();
      cache.delete(cacheKey);
    },
    clear(): void {
      for (const entry of cache.values()) {
        entry.release();
      }
      cache.clear();
    },
  };
}
