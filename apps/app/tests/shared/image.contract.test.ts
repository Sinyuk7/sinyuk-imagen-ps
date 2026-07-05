import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMAGE_RESIZE_STRATEGY,
  downscaleArea,
  resolveCaptureUploadPlan,
  resolveModelSize,
  resolveProviderInputPlan,
  upscaleBilinear,
  type RgbaImage,
} from '../../src/shared/image/resize';
import { createMemoryThumbnailStore } from '../../src/shared/image/thumbnail-store';

function rgba(width: number, height: number, data: readonly number[]): RgbaImage {
  return { width, height, data: new Uint8Array(data) };
}

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

describe('shared image contract', () => {
  it('uses Photoshop targetSize downscale and smart object transform by default', () => {
    expect(DEFAULT_IMAGE_RESIZE_STRATEGY.captureDownscaleMode).toBe('photoshop-target-size');
    expect(DEFAULT_IMAGE_RESIZE_STRATEGY.placementScaleMode).toBe('smart-object-transform');

    const plan = resolveCaptureUploadPlan({ width: 2048, height: 1024 });

    expect(plan.capture.downscaleMode).toBe('photoshop-target-size');
    expect(plan.capture.uploadSize).toEqual({ width: 1028, height: 514 });
    expect(plan.capture.ratioX).toBe(1028 / 2048);
    expect(plan.capture.ratioY).toBe(514 / 1024);
    expect(plan.capture.effectiveMultiple).toBe(2);
    expect(plan.placement).toEqual({
      placementMode: 'smart-object-transform',
      shouldResizeBytes: false,
    });
  });

  it('can switch to app area downscale and raster bilinear placement as an explicit strategy', () => {
    const plan = resolveCaptureUploadPlan(
      { width: 2048, height: 2048 },
      {
        captureDownscaleMode: 'app-area',
        placementScaleMode: 'raster-bilinear',
        sizePolicy: { maxSide: 1024 },
      },
    );

    expect(plan.capture.downscaleMode).toBe('app-area');
    expect(plan.capture.uploadSize).toEqual({ width: 1024, height: 1024 });
    expect(plan.placement).toEqual({
      placementMode: 'raster-bilinear',
      shouldResizeBytes: true,
    });
  });

  it('resolves an even model size and records exact upload ratios', () => {
    const resolved = resolveModelSize({ width: 2048, height: 2048 }, { maxSide: 1028 });

    expect(resolved.width).toBe(1028);
    expect(resolved.height).toBe(1028);
    expect(resolved.ratioX).toBe(1028 / 2048);
    expect(resolved.ratioY).toBe(1028 / 2048);
    expect(resolved.effectiveMultiple).toBe(2);
  });

  it('falls back to a 1px multiple when an even size would distort aspect ratio too much', () => {
    const resolved = resolveModelSize({ width: 1001, height: 1000 }, { maxSide: 1028 });

    expect(resolved.width).toBe(1001);
    expect(resolved.height).toBe(1000);
    expect(resolved.ratioX).toBe(1);
    expect(resolved.ratioY).toBe(1);
    expect(resolved.requestedMultiple).toBe(2);
    expect(resolved.effectiveMultiple).toBe(1);
  });

  it('resolves provider input downscale near the selected max side without ratio drift', () => {
    const square = resolveProviderInputPlan({ width: 4096, height: 4096 }, { maxSide: 2048 });
    expect(square).toMatchObject({
      sourceWidth: 4096,
      sourceHeight: 4096,
      targetWidth: 2048,
      targetHeight: 2048,
      fit: 'preserve-ratio',
      maxSideBucket: 2048,
      preferredMultiple: 2,
      effectiveMultiple: 2,
      maxSide: 2048,
      multiple: 2,
      wasResized: true,
      wasUpscaled: false,
      wasDownscaled: true,
    });

    const wide = resolveProviderInputPlan({ width: 10000, height: 6000 }, { maxSide: 2048 });
    expect(wide.targetWidth).toBe(2050);
    expect(wide.targetHeight).toBe(1230);
    expect(wide.targetWidth / wide.targetHeight).toBe(10000 / 6000);
    expect(wide.wasDownscaled).toBe(true);
  });

  it('treats provider input max side as a bucket target, not a short-side minimum', () => {
    const plan = resolveProviderInputPlan({ width: 512, height: 512 }, { maxSide: 512 });

    expect(plan).toMatchObject({
      sourceWidth: 512,
      sourceHeight: 512,
      targetWidth: 512,
      targetHeight: 512,
      maxSideBucket: 512,
      maxSide: 512,
      wasResized: false,
      wasUpscaled: false,
      wasDownscaled: false,
    });
  });

  it('uses each provider max side as the only ceiling', () => {
    expect(resolveProviderInputPlan({ width: 4096, height: 4096 }, { maxSide: 1024 }).targetWidth).toBe(1024);
    expect(resolveProviderInputPlan({ width: 4096, height: 4096 }, { maxSide: 2048 }).targetWidth).toBe(2048);
    expect(resolveProviderInputPlan({ width: 4096, height: 4096 }, { maxSide: 4096 }).targetWidth).toBe(4096);
  });

  it('preserves reduced source ratio and degrades the multiple before accepting drift', () => {
    const plan = resolveProviderInputPlan({ width: 345, height: 321 }, { maxSide: 1024, multiple: 2 });

    expect(plan).toMatchObject({
      targetWidth: 1035,
      targetHeight: 963,
      fit: 'preserve-ratio',
      maxSideBucket: 1024,
      preferredMultiple: 2,
      effectiveMultiple: 1,
      multiple: 1,
    });
    expect(plan.targetWidth).not.toBe(1016);
    expect(plan.targetHeight).not.toBe(946);
    expect(plan.targetWidth / plan.targetHeight).toBe(345 / 321);
  });

  it('rejects missing or invalid provider input max size before pixel reads', () => {
    expect(() => resolveProviderInputPlan({ width: 512, height: 512 }, { maxSide: 0 })).toThrow(
      'effectiveProviderMaxSide must be a positive integer',
    );
  });

  it('downscales with exact area averaging for opaque RGBA pixels', () => {
    const image = rgba(2, 2, [
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);

    const resized = downscaleArea(image, { width: 1, height: 1 });

    expect([...resized.data]).toEqual([128, 128, 128, 255]);
  });

  it('downscales in premultiplied alpha space to avoid transparent color bleed', () => {
    const image = rgba(2, 1, [
      255, 0, 0, 255,
      0, 255, 0, 0,
    ]);

    const resized = downscaleArea(image, { width: 1, height: 1 });

    expect([...resized.data]).toEqual([255, 0, 0, 128]);
  });

  it('uses bilinear upscale only for raster output mode', () => {
    const image = rgba(1, 1, [20, 40, 80, 128]);

    const resized = upscaleBilinear(image, { width: 2, height: 2 });

    expect(resized.width).toBe(2);
    expect(resized.height).toBe(2);
    expect([...resized.data]).toEqual([
      20, 40, 80, 128,
      20, 40, 80, 128,
      20, 40, 80, 128,
      20, 40, 80, 128,
    ]);
  });

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
