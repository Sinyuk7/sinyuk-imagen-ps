import { describe, expect, it, vi } from 'vitest';
import { createMemoryThumbnailStore } from '../../../src/shared/image/thumbnail-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function waitForCallCount(spy: ReturnType<typeof vi.fn>, count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (spy.mock.calls.length === count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(spy).toHaveBeenCalledTimes(count);
}

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

  it('derives thumbnails for oversized stored assets instead of returning empty preview', async () => {
    const release = vi.fn();
    const createThumbnail = vi.fn(async () => ({ url: 'blob:derived-thumb', release }));
    const store = createMemoryThumbnailStore({
      maxInlineBytes: 2,
      async resolveStoredRef() {
        return new Uint8Array([1, 2, 3]).buffer;
      },
      createThumbnail,
    });

    const entry = await store.getOrCreate({
      asset: {
        type: 'image',
        name: 'large.png',
        mimeType: 'image/png',
        storedRef: { kind: 'hostObject', ref: 'large-asset', mimeType: 'image/png' },
      },
      maxSide: 256,
    });

    expect(entry.preview.url).toBe('blob:derived-thumb');
    expect(createThumbnail).toHaveBeenCalledWith(expect.objectContaining({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      maxSide: 256,
    }));
    expect(JSON.stringify(entry.preview.asset)).not.toContain('data');

    store.release(entry.cacheKey);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('limits oversized thumbnail derivation concurrency', async () => {
    const resolvers: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const createThumbnail = vi.fn(async ({ asset }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      active -= 1;
      return { url: `blob:${asset.name}`, release: vi.fn() };
    });
    const store = createMemoryThumbnailStore({
      maxInlineBytes: 0,
      async resolveStoredRef(ref) {
        return new Uint8Array([Number(ref.ref.slice(-1))]).buffer;
      },
      createThumbnail,
    });
    const assets = [0, 1, 2].map((index) => ({
      type: 'image' as const,
      name: `large-${index}.png`,
      mimeType: 'image/png',
      storedRef: { kind: 'hostObject' as const, ref: `large-asset-${index}`, mimeType: 'image/png' },
    }));

    const pending = assets.map((asset) => store.getOrCreate({ asset }));
    await Promise.resolve();

    expect(createThumbnail).toHaveBeenCalledTimes(1);
    for (const expectedCalls of [2, 3]) {
      resolvers.shift()?.();
      await waitForCallCount(createThumbnail, expectedCalls);
    }
    resolvers.shift()?.();
    const entries = await Promise.all(pending);

    expect(entries.map((entry) => entry.preview.url)).toEqual(['blob:large-0.png', 'blob:large-1.png', 'blob:large-2.png']);
    expect(peak).toBe(1);
  });

  it('shares one in-flight generation for duplicate cache keys', async () => {
    const release = vi.fn();
    const generated = deferred<{ readonly url: string; release(): void }>();
    const createThumbnail = vi.fn(async () => generated.promise);
    const store = createMemoryThumbnailStore({
      maxInlineBytes: 0,
      async resolveStoredRef() {
        return new Uint8Array([1, 2, 3]).buffer;
      },
      createThumbnail,
    });
    const asset = {
      type: 'image' as const,
      name: 'large.png',
      mimeType: 'image/png',
      storedRef: { kind: 'hostObject' as const, ref: 'large-asset', mimeType: 'image/png' },
    };

    const first = store.getOrCreate({ asset });
    const second = store.getOrCreate({ asset });
    await Promise.resolve();
    expect(createThumbnail).toHaveBeenCalledTimes(1);

    generated.resolve({ url: 'blob:single-thumb', release });
    const entries = await Promise.all([first, second]);

    expect(entries[0].cacheKey).toBe(entries[1].cacheKey);
    expect(entries[0].preview).toEqual(entries[1].preview);
    store.release(entries[0].cacheKey);
    expect(release).not.toHaveBeenCalled();
    store.release(entries[1].cacheKey);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
