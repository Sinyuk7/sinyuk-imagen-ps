import { describe, expect, it, vi } from 'vitest';
import { createMemoryThumbnailStore } from '../src/shared/image/thumbnail-store';

describe('thumbnail store', () => {
  it('caches thumbnails by source ref and releases object URLs deterministically', async () => {
    const releaseUrl = vi.fn();
    const store = createMemoryThumbnailStore({
      async resolveStoredRef() {
        return new Uint8Array([1, 2, 3]).buffer;
      },
      createObjectUrl(bytes, mimeType) {
        expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
        expect(mimeType).toBe('image/png');
        return { url: 'blob:thumb-1', release: releaseUrl };
      },
    });
    const asset = {
      type: 'image' as const,
      name: 'stored.png',
      mimeType: 'image/png',
      storedRef: { kind: 'hostObject' as const, ref: 'asset-1', mimeType: 'image/png' },
    };

    const first = await store.getOrCreate({ asset });
    const second = await store.getOrCreate({ asset });

    expect(first.preview).toEqual(second.preview);
    expect(first.preview.asset).toEqual(asset);
    expect(first.preview.url).toBe('blob:thumb-1');
    store.release(first.cacheKey);
    expect(releaseUrl).not.toHaveBeenCalled();
    store.release(second.cacheKey);
    expect(releaseUrl).toHaveBeenCalledTimes(1);
  });

  it('does not promote oversized stored assets into UI preview URLs', async () => {
    const store = createMemoryThumbnailStore({
      maxInlineBytes: 2,
      async resolveStoredRef() {
        return new Uint8Array([1, 2, 3]).buffer;
      },
    });

    const entry = await store.getOrCreate({
      asset: {
        type: 'image',
        name: 'large.png',
        mimeType: 'image/png',
        storedRef: { kind: 'hostObject', ref: 'large-asset', mimeType: 'image/png' },
      },
    });

    expect(entry.preview.url).toBe('');
    expect(JSON.stringify(entry.preview.asset)).not.toContain('data');
  });
});
