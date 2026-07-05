import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_RESIZE_STRATEGY,
  downscaleArea,
  resolveCaptureUploadPlan,
  resolveModelSize,
  resolveProviderInputPlan,
  upscaleBilinear,
  type RgbaImage,
} from '../../../src/shared/image/resize';

function rgba(width: number, height: number, data: readonly number[]): RgbaImage {
  return { width, height, data: new Uint8Array(data) };
}

describe('shared image resize', () => {
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
});
