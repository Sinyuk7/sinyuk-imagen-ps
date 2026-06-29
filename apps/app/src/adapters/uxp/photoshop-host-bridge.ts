import type { Asset } from '@imagen-ps/application';
import { getRuntimeLogger } from '@imagen-ps/application';
import type { Logger } from '@imagen-ps/foundation';
import {
  PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,
  createHostBridgeStub,
  type HostBridge,
  type LayerInfo,
} from '../../app-services/host-bridge';
import type { UxpModules } from './uxp-api';
import { ensurePlaceableImagePayload } from '../../shared/image-payload-preflight';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import { resolveCaptureUploadPlan } from '../../shared/image/resize';
import type {
  PhotoshopCaptureResult,
  PhotoshopRect,
  PlacementIntent,
} from '../../shared/domain/photoshop-placement';

interface PhotoshopLayer {
  readonly id: number;
  readonly name?: string;
  readonly kind?: string;
  readonly visible?: boolean;
  readonly hasUserMask?: boolean;
  readonly bounds?: PhotoshopLayerBounds;
  readonly boundsNoEffects?: PhotoshopLayerBounds;
  readonly layers?: readonly PhotoshopLayer[];
  scale?(width: number, height: number, anchor?: unknown): Promise<void>;
  translate?(horizontal: number, vertical: number): Promise<void>;
}

interface PhotoshopLayerBounds {
  readonly left?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly _left?: number;
  readonly _top?: number;
  readonly _right?: number;
  readonly _bottom?: number;
}

interface PhotoshopApp {
  activeDocument?: PhotoshopDocument;
  readonly documents?: readonly PhotoshopDocument[];
}

interface PhotoshopDocument {
  readonly id?: number;
  readonly width?: number;
  readonly height?: number;
  readonly layers?: readonly PhotoshopLayer[];
  readonly activeLayers?: readonly PhotoshopLayer[];
  readonly selection?: {
    readonly bounds?: PhotoshopLayerBounds | null;
  };
}

interface PhotoshopImageData {
  readonly width?: number;
  readonly height?: number;
  readonly colorSpace?: string;
  readonly components?: number;
  readonly pixelFormat?: string;
  getData?(): Promise<Uint8Array | Uint16Array | Float32Array>;
  dispose(): void;
}

interface PhotoshopImaging {
  getPixels(options: Record<string, unknown>): Promise<{ readonly imageData: PhotoshopImageData; readonly sourceBounds?: PhotoshopLayerBounds; readonly level?: number }>;
  getSelection?(options: Record<string, unknown>): Promise<{ readonly imageData: PhotoshopImageData; readonly sourceBounds?: PhotoshopLayerBounds }>;
  getLayerMask?(options: Record<string, unknown>): Promise<{ readonly imageData: PhotoshopImageData }>;
  encodeImageData(options: { readonly imageData: PhotoshopImageData; readonly base64: true }): Promise<string>;
}

interface PhotoshopCore {
  executeAsModal<T>(callback: () => Promise<T>, options?: { readonly commandName?: string }): Promise<T>;
  isModal?(): boolean;
  setExecutionMode?(options: { readonly enableErrorStacktraces?: boolean }): void;
}

interface PhotoshopAction {
  batchPlay(commands: readonly Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown>;
}

interface UxpFile {
  readonly name?: string;
  read(options?: { readonly format?: unknown }): Promise<ArrayBuffer | string>;
  write(data: ArrayBuffer | Uint8Array | string, options?: { readonly format?: unknown }): Promise<void>;
}

interface UxpFolder {
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  readonly formats?: {
    readonly binary?: unknown;
  };
  getFileForOpening(options?: { readonly types?: readonly string[]; readonly allowMultiple?: boolean }): Promise<UxpFile | undefined>;
  getTemporaryFolder(): Promise<UxpFolder>;
  createSessionToken(entry: UxpFile): string;
  getFileForSaving?(options?: { readonly types?: readonly string[]; readonly suggestedName?: string }): Promise<UxpFile | undefined>;
}

function photoshopAppFrom(modules: UxpModules): PhotoshopApp | undefined {
  return modules.photoshop?.app as PhotoshopApp | undefined;
}

function photoshopImagingFrom(modules: UxpModules): PhotoshopImaging | undefined {
  return modules.photoshop?.imaging as PhotoshopImaging | undefined;
}

function photoshopCoreFrom(modules: UxpModules): PhotoshopCore | undefined {
  return modules.photoshop?.core as PhotoshopCore | undefined;
}

function photoshopActionFrom(modules: UxpModules): PhotoshopAction | undefined {
  return modules.photoshop?.action as PhotoshopAction | undefined;
}

function localFileSystemFrom(modules: UxpModules): UxpLocalFileSystem | undefined {
  const storage = modules.uxp?.storage as { readonly localFileSystem?: UxpLocalFileSystem } | undefined;
  return storage?.localFileSystem;
}

function waitForHostFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function waitForAvailableModalSlot(core: PhotoshopCore, maxFrames = 180): Promise<void> {
  if (!core.isModal) {
    return;
  }

  let frames = 0;
  while (core.isModal()) {
    frames += 1;
    if (frames > maxFrames) {
      throw new Error('Photoshop modal state did not become available.');
    }
    await waitForHostFrame();
  }
}

export function createHostModalRunner(core: PhotoshopCore, logger: Logger): PhotoshopCore['executeAsModal'] {
  try {
    core.setExecutionMode?.({ enableErrorStacktraces: true });
  } catch (error) {
    logger.warn('hostbridge.modal_execution_mode.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let queue: Promise<unknown> = Promise.resolve();

  // Photoshop 只允许一个 modal 操作；串行化避免重复点击或 reload 时互相踩踏。
  return async function runHostModal<T>(
    callback: () => Promise<T>,
    options?: { readonly commandName?: string },
  ): Promise<T> {
    const run = queue
      .catch(() => undefined)
      .then(async () => {
        await waitForAvailableModalSlot(core);
        return core.executeAsModal(callback, options);
      });
    queue = run.catch(() => undefined);
    return run;
  };
}

function numericBound(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toLayerBounds(bounds: PhotoshopLayerBounds | undefined): LayerInfo['bounds'] | undefined {
  if (!bounds) {
    return undefined;
  }

  const left = numericBound(bounds.left ?? bounds._left);
  const top = numericBound(bounds.top ?? bounds._top);
  const right = numericBound(bounds.right ?? bounds._right);
  const bottom = numericBound(bounds.bottom ?? bounds._bottom);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    return undefined;
  }
  return { left, top, right, bottom };
}

function boundsAreEmpty(bounds: LayerInfo['bounds']): boolean {
  return Boolean(bounds && (bounds.right <= bounds.left || bounds.bottom <= bounds.top));
}

function normalizeRect(bounds: PhotoshopLayerBounds | undefined | null): PhotoshopRect | undefined {
  const raw = toLayerBounds(bounds ?? undefined);
  if (!raw) {
    return undefined;
  }
  const left = Math.floor(raw.left);
  const top = Math.floor(raw.top);
  const right = Math.ceil(raw.right);
  const bottom = Math.ceil(raw.bottom);
  if (right <= left || bottom <= top) {
    return undefined;
  }
  return { left, top, right, bottom };
}

function rectSize(rect: PhotoshopRect): { readonly width: number; readonly height: number } {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top };
}

function findDocument(app: PhotoshopApp, documentId: number): PhotoshopDocument | undefined {
  if (app.activeDocument?.id === documentId) {
    return app.activeDocument;
  }
  return app.documents?.find((document) => document.id === documentId);
}

function requireDocumentById(app: PhotoshopApp, documentId: number): PhotoshopDocument {
  const document = findDocument(app, documentId);
  if (!document) {
    throw new Error(`Photoshop document is no longer available: ${documentId}`);
  }
  return document;
}

function setActiveDocument(app: PhotoshopApp, document: PhotoshopDocument): void {
  app.activeDocument = document;
}

function toLayerInfo(layer: PhotoshopLayer): LayerInfo {
  const bounds = toLayerBounds(layer.bounds);
  return {
    id: layer.id,
    name: layer.name ?? `Layer ${layer.id}`,
    ...(layer.kind ? { kind: String(layer.kind) } : {}),
    ...(typeof layer.visible === 'boolean' ? { visible: layer.visible } : {}),
    ...(typeof layer.hasUserMask === 'boolean' ? { hasUserMask: layer.hasUserMask } : {}),
    ...(bounds ? { bounds } : {}),
    ...(layer.layers ? { children: layer.layers.map(toLayerInfo) } : {}),
  };
}

function findLayer(layers: readonly PhotoshopLayer[], layerId: number): PhotoshopLayer | undefined {
  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer;
    }
    const child = layer.layers ? findLayer(layer.layers, layerId) : undefined;
    if (child) {
      return child;
    }
  }
  return undefined;
}

async function imageDataToJpegAsset(
  imaging: PhotoshopImaging,
  imageData: PhotoshopImageData,
  name: string,
): Promise<HostImageAsset> {
  try {
    if (imageData.colorSpace !== 'RGB') {
      throw new Error(`Photoshop imaging.encodeImageData requires RGB image data, got ${imageData.colorSpace ?? 'unknown'}.`);
    }
    const data = await imaging.encodeImageData({ imageData, base64: true });
    return createHostImageAsset({
      type: 'image',
      name,
      data,
      mimeType: 'image/jpeg',
    }, { source: 'layer', previewUrl: `data:image/jpeg;base64,${data}` });
  } finally {
    imageData.dispose();
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks: string[] = [];
  let chunk = '';
  let index = 0;
  const append = (a: string, b: string, c: string, d: string): void => {
    chunk += `${a}${b}${c}${d}`;
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = '';
    }
  };

  for (; index + 2 < bytes.length; index += 3) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], alphabet[(value >> 6) & 63], alphabet[value & 63]);
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const value = bytes[index] << 16;
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], '=', '=');
  } else if (remaining === 2) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8);
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], alphabet[(value >> 6) & 63], '=');
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function readPngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return undefined;
  }
  return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
}

function readJpegSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1];
    const length = readUint16(bytes, offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: readUint16(bytes, offset + 5), width: readUint16(bytes, offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function readWebpSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (
    bytes.byteLength < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  ) {
    return undefined;
  }
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  return undefined;
}

function readImageSize(bytes: Uint8Array, mimeType: string): { readonly width: number; readonly height: number } | undefined {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) {
    return readPngSize(bytes);
  }
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return readJpegSize(bytes);
  }
  if (normalized.includes('webp')) {
    return readWebpSize(bytes);
  }
  return undefined;
}

function assertExactPlacementAspect(
  bytes: Uint8Array,
  mimeType: string,
  placementRect: PhotoshopRect,
  maxError = 0.0005,
): void {
  const imageSize = readImageSize(bytes, mimeType);
  if (!imageSize) {
    return;
  }
  const frame = rectSize(placementRect);
  const imageAspect = imageSize.width / imageSize.height;
  const frameAspect = frame.width / frame.height;
  const error = Math.abs(imageAspect - frameAspect) / Math.max(imageAspect, frameAspect);
  if (error > maxError) {
    throw new Error(
      `Exact-frame placement requires matching aspect ratio: asset ${imageSize.width}x${imageSize.height}, frame ${frame.width}x${frame.height}.`,
    );
  }
}

async function rgbaToPngBytes(image: { readonly width: number; readonly height: number; readonly data: Uint8Array }): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('PNG encoding requires a DOM canvas in the UXP panel runtime.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('PNG encoding failed: 2D canvas context is unavailable.');
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return dataUrlToBytes(canvas.toDataURL('image/png'));
}

interface CaptureImageFrame {
  readonly requestedRect: PhotoshopRect;
  readonly targetSize: { readonly width: number; readonly height: number };
  readonly sourceBounds?: PhotoshopLayerBounds;
  readonly sourceLevel?: number;
}

function imageDataSize(
  imageData: PhotoshopImageData,
  fallback: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  return {
    width: imageData.width ?? fallback.width,
    height: imageData.height ?? fallback.height,
  };
}

function toTargetRect(
  frame: CaptureImageFrame,
  actualSize: { readonly width: number; readonly height: number },
  label: string,
): PhotoshopRect {
  if (!frame.sourceBounds) {
    if (actualSize.width !== frame.targetSize.width || actualSize.height !== frame.targetSize.height) {
      throw new Error(`Photoshop returned unexpected ${label} size: ${actualSize.width}x${actualSize.height}, expected ${frame.targetSize.width}x${frame.targetSize.height}.`);
    }
    return { left: 0, top: 0, right: frame.targetSize.width, bottom: frame.targetSize.height };
  }

  const sourceRect = normalizeRect(frame.sourceBounds);
  if (!sourceRect) {
    throw new Error(`Photoshop returned empty ${label} source bounds.`);
  }
  const sourceScale = 2 ** Math.max(0, frame.sourceLevel ?? 0);
  const fullSourceRect = {
    left: sourceRect.left * sourceScale,
    top: sourceRect.top * sourceScale,
    right: sourceRect.right * sourceScale,
    bottom: sourceRect.bottom * sourceScale,
  };
  const requestedSize = rectSize(frame.requestedRect);
  const left = Math.round(((fullSourceRect.left - frame.requestedRect.left) / requestedSize.width) * frame.targetSize.width);
  const top = Math.round(((fullSourceRect.top - frame.requestedRect.top) / requestedSize.height) * frame.targetSize.height);
  const right = Math.round(((fullSourceRect.right - frame.requestedRect.left) / requestedSize.width) * frame.targetSize.width);
  const bottom = Math.round(((fullSourceRect.bottom - frame.requestedRect.top) / requestedSize.height) * frame.targetSize.height);
  if (right <= left || bottom <= top) {
    throw new Error(`Photoshop returned ${label} source bounds outside the requested capture frame.`);
  }
  return { left, top, right, bottom };
}

function isFullTargetRect(rect: PhotoshopRect, size: { readonly width: number; readonly height: number }): boolean {
  return rect.left === 0 && rect.top === 0 && rect.right === size.width && rect.bottom === size.height;
}

function rgbaFromBytes(
  data: Uint8Array,
  sourceSize: { readonly width: number; readonly height: number },
  components: number,
): Uint8Array {
  const expectedBytes = sourceSize.width * sourceSize.height * components;
  if (data.byteLength < expectedBytes) {
    throw new Error(`Photoshop capture returned ${data.byteLength} bytes, expected at least ${expectedBytes}.`);
  }
  const rgba = new Uint8Array(sourceSize.width * sourceSize.height * 4);
  for (let source = 0, target = 0; target < rgba.byteLength; source += components, target += 4) {
    rgba[target] = data[source];
    rgba[target + 1] = data[source + 1];
    rgba[target + 2] = data[source + 2];
    rgba[target + 3] = components === 4 ? data[source + 3] : 255;
    if (rgba[target + 3] === 0) {
      rgba[target] = 0;
      rgba[target + 1] = 0;
      rgba[target + 2] = 0;
    }
  }
  return rgba;
}

function pasteRgba(
  target: Uint8Array,
  data: Uint8Array,
  sourceSize: { readonly width: number; readonly height: number },
  targetSize: { readonly width: number; readonly height: number },
  targetRect: PhotoshopRect,
  components: number,
): void {
  const expectedBytes = sourceSize.width * sourceSize.height * components;
  if (data.byteLength < expectedBytes) {
    throw new Error(`Photoshop capture returned ${data.byteLength} bytes, expected at least ${expectedBytes}.`);
  }
  const rectWidth = targetRect.right - targetRect.left;
  const rectHeight = targetRect.bottom - targetRect.top;
  const left = Math.max(0, targetRect.left);
  const top = Math.max(0, targetRect.top);
  const right = Math.min(targetSize.width, targetRect.right);
  const bottom = Math.min(targetSize.height, targetRect.bottom);
  for (let y = top; y < bottom; y += 1) {
    const sourceY = Math.min(sourceSize.height - 1, Math.max(0, Math.floor(((y - targetRect.top) * sourceSize.height) / rectHeight)));
    for (let x = left; x < right; x += 1) {
      const sourceX = Math.min(sourceSize.width - 1, Math.max(0, Math.floor(((x - targetRect.left) * sourceSize.width) / rectWidth)));
      const source = (sourceY * sourceSize.width + sourceX) * components;
      const offset = (y * targetSize.width + x) * 4;
      target[offset] = data[source];
      target[offset + 1] = data[source + 1];
      target[offset + 2] = data[source + 2];
      target[offset + 3] = components === 4 ? data[source + 3] : 255;
      if (target[offset + 3] === 0) {
        target[offset] = 0;
        target[offset + 1] = 0;
        target[offset + 2] = 0;
      }
    }
  }
}

async function imageDataToRgba(imageData: PhotoshopImageData, frame: CaptureImageFrame): Promise<Uint8Array> {
  try {
    const size = imageDataSize(imageData, frame.targetSize);
    const components = imageData.components ?? (imageData.pixelFormat === 'RGB' ? 3 : 4);
    if (!imageData.getData) {
      throw new Error('Photoshop capture requires imageData.getData().');
    }
    const data = await imageData.getData();
    if (!(data instanceof Uint8Array)) {
      throw new Error('Photoshop capture requires 8-bit component data.');
    }
    if (components !== 3 && components !== 4) {
      throw new Error(`Photoshop capture requires RGB/RGBA image data, got ${components} components.`);
    }
    const targetRect = toTargetRect(frame, size, 'capture');
    if (isFullTargetRect(targetRect, frame.targetSize) && size.width === frame.targetSize.width && size.height === frame.targetSize.height) {
      return rgbaFromBytes(data, size, components);
    }

    const rgba = new Uint8Array(frame.targetSize.width * frame.targetSize.height * 4);
    pasteRgba(rgba, data, size, frame.targetSize, targetRect, components);
    return rgba;
  } finally {
    imageData.dispose();
  }
}

function pasteAlpha(
  target: Uint8Array,
  data: Uint8Array,
  sourceSize: { readonly width: number; readonly height: number },
  targetSize: { readonly width: number; readonly height: number },
  targetRect: PhotoshopRect,
  components: number,
): void {
  const expectedBytes = sourceSize.width * sourceSize.height * components;
  if (data.byteLength < expectedBytes) {
    throw new Error(`Photoshop selection capture returned ${data.byteLength} bytes, expected at least ${expectedBytes}.`);
  }
  const rectWidth = targetRect.right - targetRect.left;
  const rectHeight = targetRect.bottom - targetRect.top;
  const left = Math.max(0, targetRect.left);
  const top = Math.max(0, targetRect.top);
  const right = Math.min(targetSize.width, targetRect.right);
  const bottom = Math.min(targetSize.height, targetRect.bottom);
  for (let y = top; y < bottom; y += 1) {
    const sourceY = Math.min(sourceSize.height - 1, Math.max(0, Math.floor(((y - targetRect.top) * sourceSize.height) / rectHeight)));
    for (let x = left; x < right; x += 1) {
      const sourceX = Math.min(sourceSize.width - 1, Math.max(0, Math.floor(((x - targetRect.left) * sourceSize.width) / rectWidth)));
      target[y * targetSize.width + x] = data[(sourceY * sourceSize.width + sourceX) * components];
    }
  }
}

async function selectionMaskToAlpha(imageData: PhotoshopImageData, frame: CaptureImageFrame): Promise<Uint8Array> {
  try {
    const size = imageDataSize(imageData, frame.targetSize);
    const components = imageData.components ?? 1;
    if (!imageData.getData) {
      throw new Error('Photoshop selection capture requires imageData.getData().');
    }
    const data = await imageData.getData();
    if (!(data instanceof Uint8Array)) {
      throw new Error('Photoshop selection capture requires 8-bit mask data.');
    }
    const targetRect = toTargetRect(frame, size, 'selection mask');
    if (isFullTargetRect(targetRect, frame.targetSize) && size.width === frame.targetSize.width && size.height === frame.targetSize.height) {
      const alpha = new Uint8Array(frame.targetSize.width * frame.targetSize.height);
      for (let pixel = 0; pixel < alpha.byteLength; pixel += 1) {
        alpha[pixel] = data[pixel * components];
      }
      return alpha;
    }

    const alpha = new Uint8Array(frame.targetSize.width * frame.targetSize.height);
    pasteAlpha(alpha, data, size, frame.targetSize, targetRect, components);
    return alpha;
  } finally {
    imageData.dispose();
  }
}

function applySelectionAlpha(rgba: Uint8Array, alpha: Uint8Array): void {
  for (let pixel = 0; pixel < alpha.byteLength; pixel += 1) {
    const offset = pixel * 4;
    const nextAlpha = Math.round((rgba[offset + 3] * alpha[pixel]) / 255);
    rgba[offset + 3] = nextAlpha;
    if (nextAlpha === 0) {
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
    }
  }
}

function assertDocumentSize(document: PhotoshopDocument, expected: { readonly width: number; readonly height: number }): void {
  if (document.width !== expected.width || document.height !== expected.height) {
    throw new Error(
      `Photoshop document size changed since capture: ${document.width ?? 'unknown'}x${document.height ?? 'unknown'}, expected ${expected.width}x${expected.height}.`,
    );
  }
}

async function transformActivePlacedLayer(document: PhotoshopDocument, placementRect: PhotoshopRect): Promise<void> {
  const placedLayer = document.activeLayers?.[0];
  if (!placedLayer?.scale || !placedLayer.translate) {
    throw new Error('Photoshop exact-frame placement requires an active placed layer with scale() and translate().');
  }
  const currentBounds = normalizeRect(placedLayer.boundsNoEffects ?? placedLayer.bounds);
  if (!currentBounds) {
    throw new Error('Photoshop exact-frame placement could not read placed layer bounds.');
  }
  const currentSize = rectSize(currentBounds);
  const targetSize = rectSize(placementRect);
  await placedLayer.scale((targetSize.width / currentSize.width) * 100, (targetSize.height / currentSize.height) * 100);
  const scaledBounds = normalizeRect(placedLayer.boundsNoEffects ?? placedLayer.bounds) ?? currentBounds;
  await placedLayer.translate(placementRect.left - scaledBounds.left, placementRect.top - scaledBounds.top);
}

function arrayBufferFromDataUrl(dataUrl: string): { readonly data: ArrayBuffer; readonly mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const base64 = match ? match[2] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    data: bytes.buffer,
    mimeType: match?.[1] ?? 'image/png',
  };
}

async function assetToArrayBuffer(asset: Asset): Promise<{ readonly data: ArrayBuffer; readonly mimeType: string }> {
  if (asset.data instanceof Uint8Array) {
    const bytes = new Uint8Array(asset.data.byteLength);
    bytes.set(asset.data);
    return {
      data: bytes.buffer,
      mimeType: asset.mimeType ?? 'image/png',
    };
  }
  if (typeof asset.data === 'string') {
    return arrayBufferFromDataUrl(asset.data);
  }
  if (asset.url) {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset URL: ${response.status}`);
    }
    return {
      data: await response.arrayBuffer(),
      mimeType: response.headers.get('content-type') ?? asset.mimeType ?? 'image/png',
    };
  }
  throw new Error('Asset has no URL or inline data.');
}

function fileExtensionFor(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg';
  }
  if (mimeType.includes('webp')) {
    return 'webp';
  }
  return 'png';
}

function mimeTypeForFileName(name: string | undefined): string {
  if (/\.(jpe?g)$/i.test(name ?? '')) {
    return 'image/jpeg';
  }
  if (/\.webp$/i.test(name ?? '')) {
    return 'image/webp';
  }
  return 'image/png';
}

export interface CreatePhotoshopHostBridgeOptions {
  /** 可选 logger；未提供时使用 runtime logger。 */
  readonly logger?: Logger;
}

export function createPhotoshopHostBridge(modules: UxpModules, options?: CreatePhotoshopHostBridgeOptions): HostBridge {
  const app = photoshopAppFrom(modules);
  const imaging = photoshopImagingFrom(modules);
  const core = photoshopCoreFrom(modules);
  const action = photoshopActionFrom(modules);
  const fs = localFileSystemFrom(modules);
  const logger = options?.logger ?? getRuntimeLogger().child({ package: 'app', component: 'host' });

  if (!app || !imaging || !core || !action || !fs) {
    logger.warn('hostbridge.unavailable', { reason: 'missing UXP modules' });
    return createHostBridgeStub();
  }

  const executeHostModal = createHostModalRunner(core, logger);

  return {
    capabilities: PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,

    async listLayers(): Promise<readonly LayerInfo[]> {
      const span = logger.startSpan('hostbridge.list_layers');
      try {
        const layers = (app.activeDocument?.layers ?? []).map(toLayerInfo);
        span.finish({ count: layers.length });
        return layers;
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async pickImageFile(): Promise<HostImageAsset | undefined> {
      const span = logger.startSpan('hostbridge.pick_image_file');
      try {
        const file = await fs.getFileForOpening({
          types: ['png', 'jpg', 'jpeg', 'webp'],
          allowMultiple: false,
        });
        if (!file) {
          span.finish({ picked: false });
          return undefined;
        }
        const data = await file.read({ format: fs.formats?.binary });
        const mimeType = mimeTypeForFileName(file.name);
        if (data instanceof ArrayBuffer) {
          ensurePlaceableImagePayload(data, mimeType);
        }
        const asset: Asset = {
          type: 'image',
          name: file.name ?? 'selected-image',
          data: typeof data === 'string' ? data : new Uint8Array(data),
          mimeType,
        };
        span.finish({ picked: true, name: asset.name, mimeType });
        return createHostImageAsset(asset, { source: 'file' });
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async captureActiveImage(): Promise<PhotoshopCaptureResult> {
      const span = logger.startSpan('hostbridge.capture_active_image');
      try {
        const activeDocument = app.activeDocument;
        if (!activeDocument?.id) {
          throw new Error('No active Photoshop document to capture.');
        }
        const activeLayers = activeDocument.activeLayers ?? [];
        if (activeLayers.length !== 1) {
          throw new Error(`Capture requires exactly one selected Photoshop layer, got ${activeLayers.length}.`);
        }
        const layer = activeLayers[0];
        if (!layer) {
          throw new Error('No selected Photoshop layer to capture.');
        }
        const layerBounds = normalizeRect(layer.boundsNoEffects ?? layer.bounds);
        if (!layerBounds) {
          throw new Error(`Photoshop layer has no readable pixels: ${layer.name ?? layer.id}`);
        }
        const selectionBounds = normalizeRect(activeDocument.selection?.bounds ?? null) ?? null;
        const captureRect = selectionBounds ?? layerBounds;
        const captureSize = rectSize(captureRect);
        const documentId = activeDocument.id;
        const uploadPlan = resolveCaptureUploadPlan(captureSize);
        const targetSize = uploadPlan.capture.uploadSize;

        const asset = await executeHostModal(
          async () => {
            const pixelResult = await imaging.getPixels({
              documentID: documentId,
              layerID: layer.id,
              sourceBounds: captureRect,
              targetSize,
              colorSpace: 'RGB',
              componentSize: 8,
              applyAlpha: false,
            });
            const rgba = await imageDataToRgba(pixelResult.imageData, {
              requestedRect: captureRect,
              targetSize,
              sourceBounds: pixelResult.sourceBounds,
              sourceLevel: pixelResult.level,
            });

            if (selectionBounds !== null) {
              if (!imaging.getSelection) {
                throw new Error('Photoshop selection capture is unavailable: imaging.getSelection is missing.');
              }
              const selectionResult = await imaging.getSelection({
                documentID: documentId,
                sourceBounds: captureRect,
                targetSize,
              });
              const alpha = await selectionMaskToAlpha(selectionResult.imageData, {
                requestedRect: captureRect,
                targetSize,
                sourceBounds: selectionResult.sourceBounds,
              });
              applySelectionAlpha(rgba, alpha);
            }

            const png = await rgbaToPngBytes({ width: targetSize.width, height: targetSize.height, data: rgba });
            const name = `photoshop-${selectionBounds ? 'selection' : 'layer'}-${layer.id}.png`;
            return createHostImageAsset(
              {
                type: 'image',
                name,
                data: png,
                mimeType: 'image/png',
              },
              { source: 'layer', previewUrl: `data:image/png;base64,${bytesToBase64(png)}` },
            );
          },
          { commandName: 'Capture Photoshop image' },
        );

        span.finish({
          documentId,
          layerId: layer.id,
          width: captureSize.width,
          height: captureSize.height,
          sourceKind: selectionBounds ? 'selection' : 'layer',
        });
        return {
          image: asset,
          sourceKind: selectionBounds ? 'selection' : 'layer',
          placement: {
            snapshot: {
              documentId,
              documentSize: {
                width: activeDocument.width ?? captureSize.width,
                height: activeDocument.height ?? captureSize.height,
              },
              layerId: layer.id,
              layerBoundsNoEffects: layerBounds,
              selectionBounds,
            },
            placementRect: captureRect,
            uploadPlan: uploadPlan.capture,
          },
        };
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async readLayerAsAsset(layerId: number): Promise<HostImageAsset> {
      const span = logger.startSpan('hostbridge.read_layer', { layerId });
      try {
        const layer = findLayer(app.activeDocument?.layers ?? [], layerId);
        const bounds = toLayerBounds(layer?.bounds);
        if (boundsAreEmpty(bounds)) {
          throw new Error(`Photoshop layer has no readable pixels: ${layer?.name ?? layerId}`);
        }
        const asset = await executeHostModal(
          async () => {
            const result = await imaging.getPixels({
              documentID: app.activeDocument?.id,
              layerID: layerId,
              ...(bounds ? { sourceBounds: bounds } : {}),
              colorSpace: 'RGB',
              componentSize: 8,
              applyAlpha: false,
            });
            return imageDataToJpegAsset(imaging, result.imageData, `layer-${layerId}.jpg`);
          },
          { commandName: 'Read layer pixels' },
        );
        span.finish({ layerId, name: asset.asset.name, mimeType: asset.asset.mimeType });
        return asset;
      } catch (error) {
        span.fail(error, { layerId });
        throw error;
      }
    },

    async readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined> {
      const span = logger.startSpan('hostbridge.read_layer_mask', { layerId });
      if (!imaging.getLayerMask) {
        span.finish({ hasMask: false, reason: 'unsupported' });
        return undefined;
      }
      const getLayerMask = imaging.getLayerMask.bind(imaging);
      try {
        const result = await executeHostModal(
          async () =>
            getLayerMask({
              documentID: app.activeDocument?.id,
              layerID: layerId,
              kind: 'user',
            }),
          { commandName: 'Read layer mask' },
        );
        result.imageData.dispose();
        span.finish({ layerId, hasMask: true, previewAvailable: false, reason: 'grayscale-mask-not-encodable' });
        logger.info('hostbridge.read_layer_mask.preview_unavailable', {
          layerId,
          reason: 'Photoshop imaging.encodeImageData requires RGB image data; layer masks are grayscale.',
        });
        return undefined;
      } catch (error) {
        span.fail(error, { layerId });
        return undefined;
      }
    },

    async placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void> {
      const span = logger.startSpan('hostbridge.place_asset', {
        name: asset.name,
        mimeType: asset.mimeType,
        placement: placement.kind,
      });
      try {
        if (placement.kind === 'unbound') {
          throw new Error('Photoshop placement target is ambiguous. Capture from Photoshop to place into a known document.');
        }
        const targetDocument = requireDocumentById(app, placement.documentId);
        if (placement.kind === 'exact-frame') {
          assertDocumentSize(targetDocument, placement.documentSizeAtCapture);
        }
        const { data, mimeType } = await assetToArrayBuffer(asset);
        ensurePlaceableImagePayload(data, mimeType);
        const bytes = new Uint8Array(data);
        if (placement.kind === 'exact-frame') {
          assertExactPlacementAspect(bytes, mimeType, placement.placementRect);
        }
        const folder = await fs.getTemporaryFolder();
        const file = await folder.createFile(`imagen-ps-${Date.now()}.${fileExtensionFor(mimeType)}`, {
          overwrite: true,
        });
        await file.write(data, { format: fs.formats?.binary });
        const token = fs.createSessionToken(file);

        await executeHostModal(
          async () => {
            setActiveDocument(app, targetDocument);
            await action.batchPlay(
              [
                {
                  _obj: 'placeEvent',
                  null: {
                    _path: token,
                    _kind: 'local',
                  },
                },
              ],
              { synchronousExecution: false },
            );
            if (placement.kind === 'exact-frame') {
              await transformActivePlacedLayer(targetDocument, placement.placementRect);
            }
          },
          { commandName: 'Place generated image' },
        );
        span.finish({ name: asset.name, mimeType, placement: placement.kind });
      } catch (error) {
        span.fail(error, { name: asset.name, mimeType: asset.mimeType, placement: placement.kind });
        throw error;
      }
    },
  };
}
