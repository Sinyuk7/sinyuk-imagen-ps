export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export interface RgbaImage extends ImageSize {
  readonly data: Uint8Array;
}

export interface ModelSizePolicy {
  readonly maxSide?: number;
  readonly multiple?: number;
  readonly maxAspectError?: number;
  readonly minLongSideUtilization?: number;
}

export type CaptureDownscaleMode = 'photoshop-target-size' | 'app-area';

export type PlacementScaleMode = 'smart-object-transform' | 'raster-bilinear';

export interface ImageResizeStrategy {
  readonly captureDownscaleMode: CaptureDownscaleMode;
  readonly placementScaleMode: PlacementScaleMode;
  readonly sizePolicy?: ModelSizePolicy;
}

export interface ResolvedModelSize {
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly width: number;
  readonly height: number;
  readonly ratioX: number;
  readonly ratioY: number;
  readonly aspectError: number;
  readonly maxSide: number;
  readonly requestedMultiple: number;
  readonly effectiveMultiple: number;
}

export const DEFAULT_MODEL_SIZE_POLICY = {
  maxSide: 1028,
  multiple: 2,
  maxAspectError: 0.0005,
  minLongSideUtilization: 0.9,
} as const satisfies Required<ModelSizePolicy>;

export const DEFAULT_IMAGE_RESIZE_STRATEGY = {
  captureDownscaleMode: 'photoshop-target-size',
  placementScaleMode: 'smart-object-transform',
  sizePolicy: DEFAULT_MODEL_SIZE_POLICY,
} as const satisfies Required<ImageResizeStrategy>;

export interface CaptureUploadPlan {
  readonly downscaleMode: CaptureDownscaleMode;
  readonly originalSize: ImageSize;
  readonly uploadSize: ImageSize;
  readonly ratioX: number;
  readonly ratioY: number;
  readonly aspectError: number;
  readonly requestedMultiple: number;
  readonly effectiveMultiple: number;
}

export interface PlacementScalePlan {
  readonly placementMode: PlacementScaleMode;
  readonly shouldResizeBytes: boolean;
}

export interface ImageResizePlan {
  readonly capture: CaptureUploadPlan;
  readonly placement: PlacementScalePlan;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0, got ${value}`);
  }
}

function assertUnitRange(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${name} must be in (0, 1], got ${value}`);
  }
}

function assertRgbaImage(image: RgbaImage): void {
  assertPositiveInteger('image.width', image.width);
  assertPositiveInteger('image.height', image.height);

  const expectedLength = image.width * image.height * 4;
  if (image.data.byteLength !== expectedLength) {
    throw new RangeError(`Expected ${expectedLength} RGBA bytes, got ${image.data.byteLength}`);
  }
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function floorToMultiple(value: number, multiple: number): number {
  return Math.floor(value / multiple) * multiple;
}

function aspectError(ratioX: number, ratioY: number): number {
  return Math.abs(ratioX - ratioY) / Math.max(ratioX, ratioY);
}

function createResolvedSize(
  original: ImageSize,
  size: ImageSize,
  maxSide: number,
  requestedMultiple: number,
  effectiveMultiple: number,
): ResolvedModelSize {
  const ratioX = size.width / original.width;
  const ratioY = size.height / original.height;

  return {
    originalWidth: original.width,
    originalHeight: original.height,
    width: size.width,
    height: size.height,
    ratioX,
    ratioY,
    aspectError: aspectError(ratioX, ratioY),
    maxSide,
    requestedMultiple,
    effectiveMultiple,
  };
}

function collectModelSizeCandidates(
  original: ImageSize,
  policy: Required<ModelSizePolicy>,
  requestedMultiple: number,
  effectiveMultiple: number,
): readonly ResolvedModelSize[] {
  const maxWidth = floorToMultiple(Math.min(original.width, policy.maxSide), effectiveMultiple);
  const maxHeight = floorToMultiple(Math.min(original.height, policy.maxSide), effectiveMultiple);
  if (maxWidth < effectiveMultiple || maxHeight < effectiveMultiple) {
    return [];
  }

  const maxReachableLongSide = Math.max(maxWidth, maxHeight);
  const minLongSide = maxReachableLongSide * policy.minLongSideUtilization;
  const candidates = new Map<string, ResolvedModelSize>();

  const addCandidate = (width: number, height: number): void => {
    if (
      width < effectiveMultiple ||
      height < effectiveMultiple ||
      width > maxWidth ||
      height > maxHeight ||
      width % effectiveMultiple !== 0 ||
      height % effectiveMultiple !== 0 ||
      Math.max(width, height) < minLongSide
    ) {
      return;
    }

    const key = `${width}x${height}`;
    candidates.set(key, createResolvedSize(original, { width, height }, policy.maxSide, requestedMultiple, effectiveMultiple));
  };

  for (let height = effectiveMultiple; height <= maxHeight; height += effectiveMultiple) {
    addCandidate(roundToMultiple((original.width / original.height) * height, effectiveMultiple), height);
  }

  for (let width = effectiveMultiple; width <= maxWidth; width += effectiveMultiple) {
    addCandidate(width, roundToMultiple((original.height / original.width) * width, effectiveMultiple));
  }

  return [...candidates.values()];
}

function chooseBestSize(
  candidates: readonly ResolvedModelSize[],
  maxAspectError: number,
  requireAspectLimit: boolean,
): ResolvedModelSize | undefined {
  const pool = requireAspectLimit ? candidates.filter((candidate) => candidate.aspectError <= maxAspectError) : candidates;
  if (pool.length === 0) {
    return undefined;
  }

  return [...pool].sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height;
    if (areaDiff !== 0 && requireAspectLimit) {
      return areaDiff;
    }

    const errorDiff = a.aspectError - b.aspectError;
    if (errorDiff !== 0) {
      return errorDiff;
    }

    return areaDiff;
  })[0];
}

export function resolveModelSize(originalSize: ImageSize, options: ModelSizePolicy = {}): ResolvedModelSize {
  assertPositiveInteger('originalSize.width', originalSize.width);
  assertPositiveInteger('originalSize.height', originalSize.height);

  const policy: Required<ModelSizePolicy> = {
    maxSide: options.maxSide ?? DEFAULT_MODEL_SIZE_POLICY.maxSide,
    multiple: options.multiple ?? DEFAULT_MODEL_SIZE_POLICY.multiple,
    maxAspectError: options.maxAspectError ?? DEFAULT_MODEL_SIZE_POLICY.maxAspectError,
    minLongSideUtilization: options.minLongSideUtilization ?? DEFAULT_MODEL_SIZE_POLICY.minLongSideUtilization,
  };

  assertPositiveInteger('maxSide', policy.maxSide);
  assertPositiveInteger('multiple', policy.multiple);
  assertFiniteNonNegative('maxAspectError', policy.maxAspectError);
  assertUnitRange('minLongSideUtilization', policy.minLongSideUtilization);

  if (
    Math.max(originalSize.width, originalSize.height) <= policy.maxSide &&
    originalSize.width % policy.multiple === 0 &&
    originalSize.height % policy.multiple === 0
  ) {
    return createResolvedSize(originalSize, originalSize, policy.maxSide, policy.multiple, policy.multiple);
  }

  const candidates = collectModelSizeCandidates(originalSize, policy, policy.multiple, policy.multiple);
  const evenCandidate = chooseBestSize(candidates, policy.maxAspectError, true);
  if (evenCandidate !== undefined) {
    return evenCandidate;
  }

  if (policy.multiple !== 1) {
    const fallbackCandidates = collectModelSizeCandidates(originalSize, policy, policy.multiple, 1);
    const fallbackCandidate =
      chooseBestSize(fallbackCandidates, policy.maxAspectError, true) ??
      chooseBestSize(fallbackCandidates, policy.maxAspectError, false);
    if (fallbackCandidate !== undefined) {
      return fallbackCandidate;
    }
  }

  const bestCandidate = chooseBestSize(candidates, policy.maxAspectError, false);
  if (bestCandidate === undefined) {
    throw new Error('No valid target size found.');
  }

  return bestCandidate;
}

export function resolveCaptureUploadPlan(
  originalSize: ImageSize,
  strategy: ImageResizeStrategy = DEFAULT_IMAGE_RESIZE_STRATEGY,
): ImageResizePlan {
  const size = resolveModelSize(originalSize, strategy.sizePolicy);
  const capture: CaptureUploadPlan = {
    downscaleMode: strategy.captureDownscaleMode,
    originalSize,
    uploadSize: { width: size.width, height: size.height },
    ratioX: size.ratioX,
    ratioY: size.ratioY,
    aspectError: size.aspectError,
    requestedMultiple: size.requestedMultiple,
    effectiveMultiple: size.effectiveMultiple,
  };

  return {
    capture,
    placement: {
      placementMode: strategy.placementScaleMode,
      shouldResizeBytes: strategy.placementScaleMode === 'raster-bilinear',
    },
  };
}

function cloneImage(image: RgbaImage): RgbaImage {
  return {
    data: new Uint8Array(image.data),
    width: image.width,
    height: image.height,
  };
}

function clampByte(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 255) {
    return 255;
  }
  return Math.round(value);
}

function readPremultiplied(source: Uint8Array, index: number, channel: number): number {
  return source[index + channel] * (source[index + 3] / 255);
}

function writeUnpremultiplied(
  output: Uint8Array,
  index: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  if (alpha <= Number.EPSILON) {
    output[index] = 0;
    output[index + 1] = 0;
    output[index + 2] = 0;
    output[index + 3] = 0;
    return;
  }

  output[index] = clampByte(red / alpha);
  output[index + 1] = clampByte(green / alpha);
  output[index + 2] = clampByte(blue / alpha);
  output[index + 3] = clampByte(alpha * 255);
}

export function downscaleArea(image: RgbaImage, targetSize: ImageSize): RgbaImage {
  assertRgbaImage(image);
  assertPositiveInteger('targetSize.width', targetSize.width);
  assertPositiveInteger('targetSize.height', targetSize.height);

  if (targetSize.width > image.width || targetSize.height > image.height) {
    throw new RangeError('downscaleArea target size must not exceed source size.');
  }

  if (targetSize.width === image.width && targetSize.height === image.height) {
    return cloneImage(image);
  }

  const output = new Uint8Array(targetSize.width * targetSize.height * 4);
  const scaleX = image.width / targetSize.width;
  const scaleY = image.height / targetSize.height;
  const areaTotal = scaleX * scaleY;

  for (let targetY = 0; targetY < targetSize.height; targetY += 1) {
    const sourceTop = targetY * scaleY;
    const sourceBottom = sourceTop + scaleY;
    const sourceYStart = Math.floor(sourceTop);
    const sourceYEnd = Math.ceil(sourceBottom);

    for (let targetX = 0; targetX < targetSize.width; targetX += 1) {
      const sourceLeft = targetX * scaleX;
      const sourceRight = sourceLeft + scaleX;
      const sourceXStart = Math.floor(sourceLeft);
      const sourceXEnd = Math.ceil(sourceRight);

      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        if (sourceY < 0 || sourceY >= image.height) {
          continue;
        }
        const overlapY = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
        if (overlapY <= 0) {
          continue;
        }

        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          if (sourceX < 0 || sourceX >= image.width) {
            continue;
          }
          const overlapX = Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX);
          if (overlapX <= 0) {
            continue;
          }

          const weight = overlapX * overlapY;
          const sourceIndex = (sourceY * image.width + sourceX) * 4;
          red += readPremultiplied(image.data, sourceIndex, 0) * weight;
          green += readPremultiplied(image.data, sourceIndex, 1) * weight;
          blue += readPremultiplied(image.data, sourceIndex, 2) * weight;
          alpha += (image.data[sourceIndex + 3] / 255) * weight;
        }
      }

      const outputIndex = (targetY * targetSize.width + targetX) * 4;
      writeUnpremultiplied(output, outputIndex, red / areaTotal, green / areaTotal, blue / areaTotal, alpha / areaTotal);
    }
  }

  return { data: output, width: targetSize.width, height: targetSize.height };
}

interface AxisMap {
  readonly low: Int32Array;
  readonly high: Int32Array;
  readonly weight: Float64Array;
}

function buildHalfPixelAxisMap(sourceSize: number, targetSize: number): AxisMap {
  const low = new Int32Array(targetSize);
  const high = new Int32Array(targetSize);
  const weight = new Float64Array(targetSize);

  for (let target = 0; target < targetSize; target += 1) {
    const source = ((target + 0.5) * sourceSize) / targetSize - 0.5;
    const base = Math.floor(source);
    low[target] = Math.min(sourceSize - 1, Math.max(0, base));
    high[target] = Math.min(sourceSize - 1, Math.max(0, base + 1));
    weight[target] = source - base;
  }

  return { low, high, weight };
}

export function upscaleBilinear(image: RgbaImage, targetSize: ImageSize): RgbaImage {
  assertRgbaImage(image);
  assertPositiveInteger('targetSize.width', targetSize.width);
  assertPositiveInteger('targetSize.height', targetSize.height);

  if (targetSize.width < image.width || targetSize.height < image.height) {
    throw new RangeError('upscaleBilinear target size must not be smaller than source size.');
  }

  if (targetSize.width === image.width && targetSize.height === image.height) {
    return cloneImage(image);
  }

  const xMap = buildHalfPixelAxisMap(image.width, targetSize.width);
  const yMap = buildHalfPixelAxisMap(image.height, targetSize.height);
  const output = new Uint8Array(targetSize.width * targetSize.height * 4);

  for (let y = 0; y < targetSize.height; y += 1) {
    const y0 = yMap.low[y];
    const y1 = yMap.high[y];
    const wy = yMap.weight[y];
    const wy0 = 1 - wy;

    for (let x = 0; x < targetSize.width; x += 1) {
      const x0 = xMap.low[x];
      const x1 = xMap.high[x];
      const wx = xMap.weight[x];
      const wx0 = 1 - wx;

      const w00 = wx0 * wy0;
      const w10 = wx * wy0;
      const w01 = wx0 * wy;
      const w11 = wx * wy;

      const i00 = (y0 * image.width + x0) * 4;
      const i10 = (y0 * image.width + x1) * 4;
      const i01 = (y1 * image.width + x0) * 4;
      const i11 = (y1 * image.width + x1) * 4;

      const a00 = image.data[i00 + 3] / 255;
      const a10 = image.data[i10 + 3] / 255;
      const a01 = image.data[i01 + 3] / 255;
      const a11 = image.data[i11 + 3] / 255;
      const alpha = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
      const outputIndex = (y * targetSize.width + x) * 4;

      const red =
        image.data[i00] * a00 * w00 +
        image.data[i10] * a10 * w10 +
        image.data[i01] * a01 * w01 +
        image.data[i11] * a11 * w11;
      const green =
        image.data[i00 + 1] * a00 * w00 +
        image.data[i10 + 1] * a10 * w10 +
        image.data[i01 + 1] * a01 * w01 +
        image.data[i11 + 1] * a11 * w11;
      const blue =
        image.data[i00 + 2] * a00 * w00 +
        image.data[i10 + 2] * a10 * w10 +
        image.data[i01 + 2] * a01 * w01 +
        image.data[i11 + 2] * a11 * w11;

      writeUnpremultiplied(output, outputIndex, red, green, blue, alpha);
    }
  }

  return { data: output, width: targetSize.width, height: targetSize.height };
}
