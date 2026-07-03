import type { Asset, StoredAssetRef } from '@imagen-ps/application';
import type { AssetPreview } from '../domain/mappers';
import { assetToPreviewUrl } from '../domain/mappers';
import { createRuntimeImageUrlOrDataUrl, type RuntimeImageUrl } from './runtime-image-url';

const DEFAULT_THUMBNAIL_MAX_SIDE = 512;
const DEFAULT_MAX_INLINE_THUMBNAIL_BYTES = 512 * 1024;
const DEFAULT_MAX_CONCURRENT_GENERATIONS = 1;

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
  readonly maxConcurrentGenerations?: number;
  readonly resolveStoredRef?: (ref: StoredAssetRef) => Promise<ArrayBuffer | undefined>;
  readonly createObjectUrl?: (bytes: Uint8Array, mimeType: string) => RuntimeImageUrl;
  readonly createThumbnail?: (request: {
    readonly asset: Asset;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly maxSide: number;
    readonly signal?: AbortSignal;
  }) => Promise<RuntimeImageUrl | undefined>;
}

interface CacheEntry {
  readonly preview: AssetPreview;
  readonly release: () => void;
  refs: number;
}

type GenerationQueueEntry = () => void;

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
    ...(asset.data !== undefined ? { data: asset.data } : {}),
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

export function createMemoryThumbnailStore(options: ThumbnailStoreOptions = {}): ThumbnailStore {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<CacheEntry>>();
  const generationQueue: GenerationQueueEntry[] = [];
  const maxInlineBytes = options.maxInlineBytes ?? DEFAULT_MAX_INLINE_THUMBNAIL_BYTES;
  const maxConcurrentGenerations = Math.max(1, Math.floor(options.maxConcurrentGenerations ?? DEFAULT_MAX_CONCURRENT_GENERATIONS));
  let activeGenerations = 0;

  async function runWithGenerationSlot<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    throwIfAborted(signal);
    if (activeGenerations >= maxConcurrentGenerations) {
      await new Promise<void>((resolve, reject) => {
        const queued: GenerationQueueEntry = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          const index = generationQueue.indexOf(queued);
          if (index >= 0) {
            generationQueue.splice(index, 1);
          }
          reject(new DOMException('Thumbnail generation was cancelled.', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        generationQueue.push(queued);
      });
    } else {
      activeGenerations += 1;
    }

    try {
      throwIfAborted(signal);
      return await work();
    } finally {
      const next = generationQueue.shift();
      if (next) {
        next();
      } else {
        activeGenerations -= 1;
      }
    }
  }

  async function thumbnailUrlFor(
    asset: Asset,
    maxSide: number,
    signal: AbortSignal | undefined,
  ): Promise<RuntimeImageUrl> {
    throwIfAborted(signal);
    const direct = previewFromAsset(asset);
    if (direct) {
      return { url: direct, release: () => undefined };
    }

    const mimeType = asset.mimeType ?? asset.storedRef?.mimeType ?? 'image/png';
    if (asset.storedRef && options.resolveStoredRef) {
      const resolved = await options.resolveStoredRef(asset.storedRef);
      throwIfAborted(signal);
      if (resolved !== undefined) {
        const bytes = new Uint8Array(resolved);
        if (bytes.byteLength <= maxInlineBytes) {
          return options.createObjectUrl
            ? options.createObjectUrl(bytes, mimeType)
            : createRuntimeImageUrlOrDataUrl(bytes, mimeType);
        }
        const thumbnail = await options.createThumbnail?.({ asset, bytes, mimeType, maxSide, signal });
        throwIfAborted(signal);
        if (thumbnail) {
          return thumbnail;
        }
      }
    }

    const inlineBytes = bytesFromAsset(asset);
    if (inlineBytes !== undefined) {
      if (inlineBytes.byteLength <= maxInlineBytes) {
        return { url: assetToPreviewUrl(asset), release: () => undefined };
      }
      const thumbnail = await options.createThumbnail?.({ asset, bytes: inlineBytes, mimeType, maxSide, signal });
      throwIfAborted(signal);
      if (thumbnail) {
        return thumbnail;
      }
    }

    return { url: '', release: () => undefined };
  }

  function entryForCached(cacheKey: string): ThumbnailEntry | undefined {
    const cached = cache.get(cacheKey);
    if (!cached) {
      return undefined;
    }
    cached.refs += 1;
    return {
      preview: cached.preview,
      cacheKey,
      release: () => releaseCacheKey(cacheKey),
    };
  }

  function releaseCacheKey(cacheKey: string): void {
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
  }

  return {
    async getOrCreate(request): Promise<ThumbnailEntry> {
      const maxSide = request.maxSide ?? DEFAULT_THUMBNAIL_MAX_SIDE;
      const cacheKey = `${sourceKeyFor(request.asset, request.sourceKey)}:${maxSide}`;
      const cached = entryForCached(cacheKey);
      if (cached) {
        return cached;
      }

      let pending = inFlight.get(cacheKey);
      if (!pending) {
        pending = runWithGenerationSlot(request.signal, async () => {
          const existing = cache.get(cacheKey);
          if (existing) {
            return existing;
          }
          const generated = await thumbnailUrlFor(request.asset, maxSide, request.signal);
          const preview: AssetPreview = {
            asset: sanitizedAsset(request.asset),
            url: generated.url,
            label: request.label ?? request.asset.name ?? 'Asset',
          };
          const entry: CacheEntry = { preview, release: generated.release, refs: 0 };
          cache.set(cacheKey, entry);
          return entry;
        }).finally(() => {
          inFlight.delete(cacheKey);
        });
        inFlight.set(cacheKey, pending);
      }

      const entry = await pending;
      entry.refs += 1;
      return {
        preview: entry.preview,
        cacheKey,
        release: () => releaseCacheKey(cacheKey),
      };
    },
    release(cacheKey): void {
      releaseCacheKey(cacheKey);
    },
    clear(): void {
      for (const entry of cache.values()) {
        entry.release();
      }
      cache.clear();
    },
  };
}
