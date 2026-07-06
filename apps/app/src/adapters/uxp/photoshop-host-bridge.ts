import type { Asset, AssetStore, StoredAssetRef } from '@imagen-ps/application';
import { getAssetStore, getRuntimeLogger } from '@imagen-ps/application';
import type { Logger } from '@imagen-ps/foundation';
import { decode as decodeJpeg } from 'jpeg-js';
import UPNG from 'upng-js';
import {
  PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,
  createHostBridgeStub,
  type HostBridge,
  type LayerInfo,
} from '../../app-services/host-bridge';
import type { UxpModules } from './uxp-api';
import { assetToArrayBuffer, suggestedAssetFileName } from '../../shared/domain/asset-file';
import { ensurePlaceableImagePayload } from '../../shared/image-payload-preflight';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import {
  downscaleArea,
  resolveCaptureUploadPlan,
  resolveProviderInputPlan,
  upscaleBilinear,
  type RgbaImage,
  type ProviderInputSizePolicy,
} from '../../shared/image/resize';
import {
  createRuntimeImageUrlOrDataUrl,
  type RuntimeImageUrl,
} from '../../shared/image/runtime-image-url';
import type { ThumbnailStoreOptions } from '../../shared/image/thumbnail-store';
import type {
  PlacementDocumentCandidate,
  PhotoshopCaptureResult,
  PhotoshopRect,
  PlacementIntent,
} from '../../shared/domain/photoshop-placement';
import {
  matchPlacementIntent,
  resolvePlacementTarget,
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
  open?(entry: unknown): Promise<PhotoshopDocument>;
}

interface PhotoshopDocument {
  readonly id?: number;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly layers?: readonly PhotoshopLayer[];
  readonly activeLayers?: readonly PhotoshopLayer[];
  readonly selection?: {
    readonly bounds?: PhotoshopLayerBounds | null;
  };
  close?(saveOptions?: unknown): Promise<void>;
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
  delete?(): Promise<void>;
}

interface UxpFolder {
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  getFileForOpening(options?: { readonly types?: readonly string[]; readonly allowMultiple?: boolean }): Promise<UxpFile | undefined>;
  getTemporaryFolder(): Promise<UxpFolder>;
  createSessionToken(entry: UxpFile): string;
  getFileForSaving?(suggestedName: string, options?: { readonly types?: readonly string[] }): Promise<UxpFile | undefined>;
}

interface UxpStorageFormats {
  readonly binary?: unknown;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_IHDR = 'IHDR';
const PNG_IDAT = 'IDAT';
const PNG_IEND = 'IEND';
const DEFLATE_STORED_BLOCK_MAX = 0xffff;
const PHOTOSHOP_THUMBNAIL_MAX_SIDE = 256;
const LAYER_PICKER_THUMBNAIL_MAX_SIDE = 48;
const APP_LOCAL_MAX_RGBA_DECODE_BYTES = 64 * 1024 * 1024;

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

function storageFormatsFrom(modules: UxpModules): UxpStorageFormats | undefined {
  const storage = modules.uxp?.storage as { readonly formats?: UxpStorageFormats } | undefined;
  return storage?.formats;
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

function documentsForPlacement(app: PhotoshopApp): readonly PlacementDocumentCandidate[] {
  const documents = app.documents ?? [];
  const candidates = documents.length > 0 ? documents : app.activeDocument ? [app.activeDocument] : [];
  return candidates.map((document) => ({
    ...(document.id !== undefined ? { documentId: document.id } : {}),
    ...(document.width !== undefined ? { width: document.width } : {}),
    ...(document.height !== undefined ? { height: document.height } : {}),
    ...(document.name !== undefined ? { name: document.name } : {}),
  }));
}

/**
 * 解析 Photoshop 目标文档：先做 source-document strong match，失败后才允许 activeDocument fallback。
 * weak reopen match 仍然拒绝自动写入。
 */
function targetDocumentForPlacement(
  app: PhotoshopApp,
  placement: PlacementIntent,
): { readonly document: PhotoshopDocument; readonly usedActiveDocumentFallback: boolean } {
  if (placement.kind === 'unbound') {
    if (placement.reason === 'multiple-documents') {
      throw new Error('Photoshop placement target is ambiguous across multiple source documents.');
    }
    if (!app.activeDocument) {
      throw new Error('Photoshop placement target requires an active Photoshop document.');
    }
    return {
      document: app.activeDocument,
      usedActiveDocumentFallback: false,
    };
  }

  const directMatch = matchPlacementIntent(placement, documentsForPlacement(app));
  if (directMatch.kind === 'matched') {
    if (directMatch.confidence === 'weak') {
      throw new Error('Photoshop placement target is unverifiable: weak document match requires explicit confirmation.');
    }
    return {
      document: requireDocumentById(app, directMatch.documentId),
      usedActiveDocumentFallback: false,
    };
  }
  if (directMatch.kind === 'ambiguous-document') {
    throw new Error(`Photoshop placement target is ambiguous across ${directMatch.candidates} documents.`);
  }
  if (directMatch.kind === 'document-mismatch') {
    throw new Error(`Photoshop placement target document mismatch: ${directMatch.reason}.`);
  }
  if (directMatch.kind === 'layer-mismatch') {
    throw new Error(`Photoshop placement target layer mismatch: ${directMatch.reason}.`);
  }

  const resolution = resolvePlacementTarget(placement, documentsForPlacement(app), app.activeDocument?.id);
  if (resolution.kind === 'unbound') {
    throw new Error('Photoshop placement target document is no longer available.');
  }
  if (resolution.targetDocumentId === undefined) {
    throw new Error('Photoshop placement target document is no longer available.');
  }
  return {
    document: requireDocumentById(app, resolution.targetDocumentId),
    usedActiveDocumentFallback: resolution.matchConfidence === 'active-document-fallback',
  };
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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function thumbnailTargetSize(
  sourceSize: { readonly width: number; readonly height: number },
  maxSide = PHOTOSHOP_THUMBNAIL_MAX_SIDE,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(sourceSize.width, sourceSize.height);
  if (longest <= maxSide) {
    return sourceSize;
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(sourceSize.width * scale)),
    height: Math.max(1, Math.round(sourceSize.height * scale)),
  };
}

function storedRefToAssetPayload(ref: StoredAssetRef): Asset {
  return {
    type: 'image',
    ...(ref.name ? { name: ref.name } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    storedRef: ref,
  };
}

async function createStoredHostImageAsset(
  assetStore: AssetStore,
  bytes: Uint8Array,
  meta: {
    readonly source: HostImageAsset['metadata']['source'];
    readonly name: string;
    readonly mimeType: string;
    readonly preview?: RuntimeImageUrl;
    readonly width?: number;
    readonly height?: number;
  },
): Promise<HostImageAsset> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const ref = await assetStore.put(copy.buffer, {
    mimeType: meta.mimeType,
    name: meta.name,
  });
  return createHostImageAsset(storedRefToAssetPayload(ref), {
    source: meta.source,
    previewUrl: meta.preview?.url,
    disposePreview: meta.preview?.release,
    payloadKind: 'host-object',
    payloadRef: ref.ref,
    width: meta.width,
    height: meta.height,
    byteSize: ref.byteSize,
  });
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
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

function crc32(bytes: Uint8Array, offset = 0, length = bytes.byteLength - offset): number {
  let crc = 0xffffffff;
  for (let index = offset; index < offset + length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type);
  const bytes = new Uint8Array(12 + data.byteLength);
  writeUint32BE(bytes, 0, data.byteLength);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  writeUint32BE(bytes, 8 + data.byteLength, crc32(bytes, 4, 4 + data.byteLength));
  return bytes;
}

function zlibStoredDeflate(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.byteLength / DEFLATE_STORED_BLOCK_MAX));
  const bytes = new Uint8Array(2 + blockCount * 5 + data.byteLength + 4);
  let offset = 0;
  bytes[offset++] = 0x78;
  bytes[offset++] = 0x01;
  let source = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const remaining = data.byteLength - source;
    const length = Math.min(DEFLATE_STORED_BLOCK_MAX, remaining);
    bytes[offset++] = block === blockCount - 1 ? 0x01 : 0x00;
    writeUint16LE(bytes, offset, length);
    writeUint16LE(bytes, offset + 2, (~length) & 0xffff);
    offset += 4;
    bytes.set(data.subarray(source, source + length), offset);
    source += length;
    offset += length;
  }
  writeUint32BE(bytes, offset, adler32(data));
  return bytes;
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

function resolveLocalFileProviderInputPlan(bytes: Uint8Array, mimeType: string, policy: ProviderInputSizePolicy) {
  const size = readImageSize(bytes, mimeType);
  if (!size) {
    throw new Error(`Cannot inspect local image dimensions for provider input: ${mimeType}.`);
  }
  return resolveProviderInputPlan(size, policy);
}

function mimeTypeSupportsAppLocalDerivative(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.includes('png') || normalized.includes('jpeg') || normalized.includes('jpg');
}

function fitsAppLocalRgbaDecodeLimit(size: { readonly width: number; readonly height: number }): boolean {
  return size.width * size.height * 4 <= APP_LOCAL_MAX_RGBA_DECODE_BYTES;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodePngToRgba(bytes: Uint8Array): RgbaImage {
  const decoded = UPNG.decode(arrayBufferFromBytes(bytes));
  const rgbaFrames = UPNG.toRGBA8(decoded);
  const firstFrame = rgbaFrames[0];
  if (!firstFrame) {
    throw new Error('App-local PNG decode returned no image frames.');
  }
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8Array(firstFrame),
  };
}

function encodeRgbaPng(image: RgbaImage): Uint8Array {
  const frame = arrayBufferFromBytes(image.data);
  return new Uint8Array(UPNG.encode([frame], image.width, image.height, 0));
}

function decodeLocalFileToRgba(bytes: Uint8Array, mimeType: string): RgbaImage {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) {
    return decodePngToRgba(bytes);
  }
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    const decoded = decodeJpeg(bytes, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  }
  throw new Error(`App-local decode is unsupported for ${mimeType}.`);
}

async function createAppLocalPreview(bytes: Uint8Array, mimeType: string): Promise<RuntimeImageUrl> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return createRuntimeImageUrlOrDataUrl(copy, mimeType);
}

async function createAppLocalThumbnail(
  bytes: Uint8Array,
  mimeType: string,
  targetSize: { readonly width: number; readonly height: number },
): Promise<RuntimeImageUrl | undefined> {
  if (!mimeTypeSupportsAppLocalDerivative(mimeType)) {
    return undefined;
  }
  const sourceSize = readImageSize(bytes, mimeType);
  if (!sourceSize) {
    return undefined;
  }
  if (sourceSize.width === targetSize.width && sourceSize.height === targetSize.height) {
    return createAppLocalPreview(bytes, mimeType);
  }
  if (!fitsAppLocalRgbaDecodeLimit(sourceSize)) {
    return undefined;
  }
  const thumbnail = await resizeLocalFileBytes(bytes, mimeType, targetSize);
  return createRuntimeImageUrlOrDataUrl(thumbnail, 'image/png');
}

async function resizeLocalFileBytes(
  bytes: Uint8Array,
  mimeType: string,
  targetSize: { readonly width: number; readonly height: number },
): Promise<Uint8Array> {
  const sourceSize = readImageSize(bytes, mimeType);
  if (!sourceSize || !fitsAppLocalRgbaDecodeLimit(sourceSize)) {
    throw new Error(`App-local resize is unavailable for ${mimeType} at this source size.`);
  }
  const image = decodeLocalFileToRgba(bytes, mimeType);
  const resized =
    targetSize.width <= image.width && targetSize.height <= image.height
      ? downscaleArea(image, targetSize)
      : upscaleBilinear(image, targetSize);
  return encodeRgbaPng(resized);
}

async function createLocalFileProviderDerivativeFromBytes(
  assetStore: AssetStore,
  bytes: Uint8Array,
  plan: ReturnType<typeof resolveProviderInputPlan>,
  meta: { readonly name: string; readonly mimeType: string },
): Promise<HostImageAsset> {
  const preview = await createAppLocalPreview(bytes, meta.mimeType);
  if (!plan.wasResized) {
    return createStoredHostImageAsset(assetStore, bytes, {
      source: 'file',
      name: meta.name,
      mimeType: meta.mimeType,
      preview,
      width: plan.targetWidth,
      height: plan.targetHeight,
    });
  }
  const normalized = await resizeLocalFileBytes(bytes, meta.mimeType, {
    width: plan.targetWidth,
    height: plan.targetHeight,
  });
  return createStoredHostImageAsset(assetStore, normalized, {
    source: 'file',
    name: meta.name.replace(/\.[^.]+$/, '') + '.png',
    mimeType: 'image/png',
    preview,
    width: plan.targetWidth,
    height: plan.targetHeight,
  });
}

async function createLocalFileProviderDerivative(
  app: PhotoshopApp,
  imaging: PhotoshopImaging,
  assetStore: AssetStore,
  file: unknown,
  bytes: Uint8Array,
  plan: ReturnType<typeof resolveProviderInputPlan>,
  meta: { readonly name: string; readonly mimeType: string },
): Promise<HostImageAsset> {
  if (
    mimeTypeSupportsAppLocalDerivative(meta.mimeType) &&
    (!plan.wasResized || fitsAppLocalRgbaDecodeLimit({ width: plan.sourceWidth, height: plan.sourceHeight }))
  ) {
    return createLocalFileProviderDerivativeFromBytes(assetStore, bytes, plan, meta);
  }
  if (!app.open) {
    throw new Error('Local image requires provider input normalization, but Photoshop app.open() is unavailable.');
  }
  const previousDocument = app.activeDocument;
  let tempDocument: PhotoshopDocument | undefined;
  try {
    tempDocument = await app.open(file);
    if (!tempDocument.id) {
      throw new Error('Photoshop did not return a document id for the selected local image.');
    }
    const sourceRect = { left: 0, top: 0, right: plan.sourceWidth, bottom: plan.sourceHeight };
    const thumbnailSize = thumbnailTargetSize({ width: plan.sourceWidth, height: plan.sourceHeight });
    const preview = await createPhotoshopThumbnailUrl(
      imaging,
      {
        documentID: tempDocument.id,
        targetSize: thumbnailSize,
        colorSpace: 'RGB',
        componentSize: 8,
        applyAlpha: false,
      },
      {
        requestedRect: sourceRect,
        targetSize: thumbnailSize,
      },
    );

    if (!plan.wasResized) {
      return createStoredHostImageAsset(assetStore, bytes, {
        source: 'file',
        name: meta.name,
        mimeType: meta.mimeType,
        preview,
        width: plan.targetWidth,
        height: plan.targetHeight,
      });
    }

    const targetSize = {
      width: plan.targetWidth,
      height: plan.targetHeight,
    };
    const result = await imaging.getPixels({
      documentID: tempDocument.id,
      targetSize,
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    const rgba = await imageDataToRgba(result.imageData, {
      requestedRect: sourceRect,
      targetSize,
      sourceBounds: result.sourceBounds,
      sourceLevel: result.level,
    });
    const png = await rgbaToPngBytes({ width: targetSize.width, height: targetSize.height, data: rgba });
    return createStoredHostImageAsset(assetStore, png, {
      source: 'file',
      name: meta.name.replace(/\.[^.]+$/, '') + '.png',
      mimeType: 'image/png',
      preview,
      width: targetSize.width,
      height: targetSize.height,
    });
  } finally {
    try {
      await tempDocument?.close?.();
    } finally {
      if (previousDocument) {
        app.activeDocument = previousDocument;
      }
    }
  }
}

async function createPhotoshopThumbnailUrl(
  imaging: PhotoshopImaging,
  request: Record<string, unknown>,
  frame: {
    readonly requestedRect: PhotoshopRect;
    readonly targetSize: { readonly width: number; readonly height: number };
  },
  selectionRequest?: Record<string, unknown>,
): Promise<RuntimeImageUrl> {
  const result = await imaging.getPixels(request);
  const rgba = await imageDataToRgba(result.imageData, {
    requestedRect: frame.requestedRect,
    targetSize: frame.targetSize,
    sourceBounds: result.sourceBounds,
    sourceLevel: result.level,
  });
  if (selectionRequest !== undefined) {
    if (!imaging.getSelection) {
      throw new Error('Photoshop selection capture is unavailable: imaging.getSelection is missing.');
    }
    const selectionResult = await imaging.getSelection(selectionRequest);
    const alpha = await selectionMaskToAlpha(selectionResult.imageData, {
      requestedRect: frame.requestedRect,
      targetSize: frame.targetSize,
      sourceBounds: selectionResult.sourceBounds,
    });
    applySelectionAlpha(rgba, alpha);
  }
  const png = await rgbaToPngBytes({ width: frame.targetSize.width, height: frame.targetSize.height, data: rgba });
  return createRuntimeImageUrlOrDataUrl(png, 'image/png');
}

async function createLayerThumbnailUrl(
  imaging: PhotoshopImaging,
  documentId: number,
  layer: PhotoshopLayer,
  maxSide: number,
): Promise<RuntimeImageUrl | undefined> {
  const bounds = normalizeRect(layer.boundsNoEffects ?? layer.bounds);
  if (!bounds || boundsAreEmpty(bounds)) {
    return undefined;
  }
  const sourceSize = rectSize(bounds);
  const targetSize = thumbnailTargetSize(sourceSize, maxSide);
  return createPhotoshopThumbnailUrl(
    imaging,
    {
      documentID: documentId,
      layerID: layer.id,
      targetSize,
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    },
    {
      requestedRect: bounds,
      targetSize,
    },
  );
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

async function scalePlacedLayerToSize(
  placedLayer: PhotoshopLayer,
  targetSize: { readonly width: number; readonly height: number },
  context: 'exact-frame' | 'unbound',
): Promise<PhotoshopRect> {
  if (!placedLayer.scale) {
    throw new Error(`Photoshop ${context} placement requires an active placed layer with scale().`);
  }
  const currentBounds = normalizeRect(placedLayer.boundsNoEffects ?? placedLayer.bounds);
  if (!currentBounds) {
    throw new Error(`Photoshop ${context} placement could not read placed layer bounds.`);
  }
  const currentSize = rectSize(currentBounds);
  await placedLayer.scale((targetSize.width / currentSize.width) * 100, (targetSize.height / currentSize.height) * 100);
  return normalizeRect(placedLayer.boundsNoEffects ?? placedLayer.bounds) ?? currentBounds;
}

async function rgbaToPngBytes(image: { readonly width: number; readonly height: number; readonly data: Uint8Array }): Promise<Uint8Array> {
  const expected = image.width * image.height * 4;
  if (image.width <= 0 || image.height <= 0 || image.data.byteLength < expected) {
    throw new Error(`PNG encoding requires complete RGBA data: ${image.width}x${image.height}.`);
  }
  const scanlineSize = 1 + image.width * 4;
  const raw = new Uint8Array(scanlineSize * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rawOffset = y * scanlineSize;
    raw[rawOffset] = 0;
    raw.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), rawOffset + 1);
  }

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, image.width);
  writeUint32BE(ihdr, 4, image.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk(PNG_IHDR, ihdr),
    pngChunk(PNG_IDAT, zlibStoredDeflate(raw)),
    pngChunk(PNG_IEND, new Uint8Array()),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
    if (imageData.colorSpace !== undefined && imageData.colorSpace !== 'RGB') {
      throw new Error(`Photoshop capture requires RGB image data, got ${imageData.colorSpace}.`);
    }
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
    if (imageData.colorSpace !== undefined && imageData.colorSpace !== 'Grayscale') {
      throw new Error(`Photoshop selection capture requires Grayscale image data, got ${imageData.colorSpace}.`);
    }
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

async function transformActivePlacedLayer(document: PhotoshopDocument, placementRect: PhotoshopRect): Promise<void> {
  const placedLayer = document.activeLayers?.[0];
  if (!placedLayer?.scale || !placedLayer.translate) {
    throw new Error('Photoshop exact-frame placement requires an active placed layer with scale() and translate().');
  }
  const targetSize = rectSize(placementRect);
  const scaledBounds = await scalePlacedLayerToSize(placedLayer, targetSize, 'exact-frame');
  await placedLayer.translate(placementRect.left - scaledBounds.left, placementRect.top - scaledBounds.top);
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

function uxpBinaryFormat(formats: UxpStorageFormats | undefined): unknown {
  if (!formats?.binary) {
    throw new Error('UXP binary file format is unavailable.');
  }
  return formats.binary;
}

function documentSize(document: PhotoshopDocument, fallback: { readonly width: number; readonly height: number }): { readonly width: number; readonly height: number } {
  return {
    width: document.width ?? fallback.width,
    height: document.height ?? fallback.height,
  };
}

function fittedPlacementSize(
  sourceSize: { readonly width: number; readonly height: number },
  bounds: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, bounds.width / sourceSize.width, bounds.height / sourceSize.height);
  return {
    width: sourceSize.width * scale,
    height: sourceSize.height * scale,
  };
}

async function normalizeUnboundPlacedLayerSize(
  document: PhotoshopDocument,
  assetSize: { readonly width: number; readonly height: number },
): Promise<void> {
  const placedLayer = document.activeLayers?.[0];
  if (!placedLayer?.scale) {
    return;
  }
  const targetSize = fittedPlacementSize(assetSize, documentSize(document, assetSize));
  await scalePlacedLayerToSize(placedLayer, targetSize, 'unbound');
}

function layerPlacementFor(document: PhotoshopDocument, layer: PhotoshopLayer, bounds: PhotoshopRect) {
  const size = documentSize(document, rectSize(bounds));
  return {
    snapshot: {
      documentId: document.id!,
      ...(document.name !== undefined ? { documentName: document.name } : {}),
      documentSize: size,
      layerId: layer.id,
      layerBoundsNoEffects: bounds,
      selectionBounds: null,
    },
    placementRect: bounds,
  };
}

export interface CreatePhotoshopHostBridgeOptions {
  /** 可选 logger；未提供时使用 runtime logger。 */
  readonly logger?: Logger;
  /** 可选 asset store；测试可注入隔离实例，生产使用 application runtime store。 */
  readonly assetStore?: AssetStore;
  /** 可选共享 Photoshop modal runner；避免 host IO 与 thumbnail 派生并发进入 modal。 */
  readonly executeHostModal?: <T>(callback: () => Promise<T>, options?: { readonly commandName?: string }) => Promise<T>;
}

export function createPhotoshopHostModalRunner(
  modules: UxpModules,
  logger: Logger,
): CreatePhotoshopHostBridgeOptions['executeHostModal'] | undefined {
  const core = photoshopCoreFrom(modules);
  return core ? createHostModalRunner(core, logger) : undefined;
}

export function createPhotoshopThumbnailGenerator(
  modules: UxpModules,
  options?: Pick<CreatePhotoshopHostBridgeOptions, 'logger' | 'executeHostModal'>,
): ThumbnailStoreOptions['createThumbnail'] {
  const app = photoshopAppFrom(modules);
  const imaging = photoshopImagingFrom(modules);
  const core = photoshopCoreFrom(modules);
  const fs = localFileSystemFrom(modules);
  const formats = storageFormatsFrom(modules);
  const logger = options?.logger ?? getRuntimeLogger().child({ package: 'app', component: 'host' });

  if (!app?.open || !imaging || !core || !fs) {
    return undefined;
  }

  const executeHostModal = options?.executeHostModal ?? createHostModalRunner(core, logger);

  return async ({ asset, bytes, mimeType, maxSide, signal }) => {
    if (signal?.aborted) {
      throw new DOMException('Thumbnail generation was cancelled.', 'AbortError');
    }
    const size = readImageSize(bytes, mimeType);
    if (!size) {
      return undefined;
    }
    const targetSize = thumbnailTargetSize(size, maxSide);
    const appLocalThumbnail = await createAppLocalThumbnail(bytes, mimeType, targetSize);
    if (appLocalThumbnail) {
      return appLocalThumbnail;
    }
    return executeHostModal(async () => {
      const previousDocument = app.activeDocument;
      let tempDocument: PhotoshopDocument | undefined;
      const folder = await fs.getTemporaryFolder();
      const file = await folder.createFile(`imagen-thumb-${Date.now()}.${fileExtensionFor(mimeType)}`, {
        overwrite: true,
      });
      try {
        await file.write(bytes, { format: uxpBinaryFormat(formats) });
        tempDocument = await app.open!(file);
        if (!tempDocument.id) {
          throw new Error('Photoshop did not return a document id for thumbnail generation.');
        }
        if (signal?.aborted) {
          throw new DOMException('Thumbnail generation was cancelled.', 'AbortError');
        }
        return createPhotoshopThumbnailUrl(
          imaging,
          {
            documentID: tempDocument.id,
            targetSize,
            colorSpace: 'RGB',
            componentSize: 8,
            applyAlpha: false,
          },
          {
            requestedRect: { left: 0, top: 0, right: size.width, bottom: size.height },
            targetSize,
          },
        );
      } finally {
        try {
          await tempDocument?.close?.();
        } finally {
          try {
            await file.delete?.();
          } finally {
            if (previousDocument) {
              app.activeDocument = previousDocument;
            }
          }
        }
      }
    }, { commandName: `Generate thumbnail for ${asset.name ?? 'asset'}` });
  };
}

export function createPhotoshopHostBridge(modules: UxpModules, options?: CreatePhotoshopHostBridgeOptions): HostBridge {
  const app = photoshopAppFrom(modules);
  const imaging = photoshopImagingFrom(modules);
  const core = photoshopCoreFrom(modules);
  const action = photoshopActionFrom(modules);
  const fs = localFileSystemFrom(modules);
  const formats = storageFormatsFrom(modules);
  const logger = options?.logger ?? getRuntimeLogger().child({ package: 'app', component: 'host' });
  const assetStore = options?.assetStore ?? getAssetStore();

  if (!app || !imaging || !core || !action || !fs) {
    logger.warn('hostbridge.unavailable', { reason: 'missing UXP modules' });
    return createHostBridgeStub();
  }

  const executeHostModal = options?.executeHostModal ?? createHostModalRunner(core, logger);

  return {
    capabilities: PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,

    async listLayers(): Promise<readonly LayerInfo[]> {
      const span = logger.startSpan('hostbridge.list_layers');
      try {
        const layers = (app.activeDocument?.layers ?? []).map(toLayerInfo);
        span.finish({
          count: layers.length,
          documentId: app.activeDocument?.id,
          names: layers.map((layer) => layer.name).slice(0, 20),
          flattenedCount: layers.reduce((count, layer) => {
            const countChildren = (items: readonly LayerInfo[]): number =>
              items.reduce((sum, item) => sum + 1 + countChildren(item.children ?? []), 0);
            return count + 1 + countChildren(layer.children ?? []);
          }, 0),
        });
        return layers;
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async pickImageFile(policy: ProviderInputSizePolicy): Promise<HostImageAsset | undefined> {
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
        const data = await file.read({ format: uxpBinaryFormat(formats) });
        const mimeType = mimeTypeForFileName(file.name);
        if (data instanceof ArrayBuffer) {
          ensurePlaceableImagePayload(data, mimeType);
        }
        const bytes = typeof data === 'string' ? dataUrlToBytes(data) : new Uint8Array(data);
        const providerInputPlan = resolveLocalFileProviderInputPlan(bytes, mimeType, policy);
        const name = file.name ?? 'selected-image';
        const asset = await executeHostModal(
          () =>
            createLocalFileProviderDerivative(app, imaging, assetStore, file, bytes, providerInputPlan, {
              name,
              mimeType,
            }),
          { commandName: 'Normalize local image for provider input' },
        );
        span.finish({
          picked: true,
          name,
          mimeType,
          byteSize: bytes.byteLength,
          providerInputWidth: providerInputPlan.targetWidth,
          providerInputHeight: providerInputPlan.targetHeight,
          providerInputWasResized: providerInputPlan.wasResized,
        });
        return asset;
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async captureActiveImage(policy: ProviderInputSizePolicy): Promise<PhotoshopCaptureResult> {
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
        const providerInputPlan = resolveProviderInputPlan(captureSize, policy);
        const uploadPlan = resolveCaptureUploadPlan(captureSize, {
          captureDownscaleMode: 'photoshop-target-size',
          placementScaleMode: 'smart-object-transform',
          sizePolicy: {
            maxSide: providerInputPlan.maxSide,
            multiple: providerInputPlan.multiple,
          },
        });
        const targetSize = {
          width: providerInputPlan.targetWidth,
          height: providerInputPlan.targetHeight,
        };
        const thumbnailSize = thumbnailTargetSize(captureSize);

        const asset = await executeHostModal(
          async () => {
            const thumbnailUrl = await createPhotoshopThumbnailUrl(
              imaging,
              {
                documentID: documentId,
                layerID: layer.id,
                sourceBounds: captureRect,
                targetSize: thumbnailSize,
                colorSpace: 'RGB',
                componentSize: 8,
                applyAlpha: false,
              },
              {
                requestedRect: captureRect,
                targetSize: thumbnailSize,
              },
              selectionBounds !== null
                ? {
                    documentID: documentId,
                    sourceBounds: captureRect,
                    targetSize: thumbnailSize,
                    componentSize: 8,
                  }
                : undefined,
            );
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
                componentSize: 8,
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
            return createStoredHostImageAsset(assetStore, png, {
              source: 'layer',
              name,
              mimeType: 'image/png',
              preview: thumbnailUrl,
              width: targetSize.width,
              height: targetSize.height,
            });
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
              ...(activeDocument.name !== undefined ? { documentName: activeDocument.name } : {}),
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
            providerInputPlan,
          },
        };
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async readLayerAsAsset(layerId: number, policy: ProviderInputSizePolicy): Promise<HostImageAsset> {
      const span = logger.startSpan('hostbridge.read_layer', { layerId });
      try {
        const activeDocument = app.activeDocument;
        const layer = findLayer(activeDocument?.layers ?? [], layerId);
        const bounds = toLayerBounds(layer?.boundsNoEffects ?? layer?.bounds);
        if (boundsAreEmpty(bounds)) {
          throw new Error(`Photoshop layer has no readable pixels: ${layer?.name ?? layerId}`);
        }
        if (!activeDocument?.id || !layer || !bounds) {
          throw new Error(`Photoshop layer is no longer available: ${layerId}`);
        }
        const sourceSize = rectSize(bounds);
        const providerInputPlan = resolveProviderInputPlan(sourceSize, policy);
        const uploadPlan = resolveCaptureUploadPlan(sourceSize, {
          captureDownscaleMode: 'photoshop-target-size',
          placementScaleMode: 'smart-object-transform',
          sizePolicy: {
            maxSide: providerInputPlan.maxSide,
            multiple: providerInputPlan.multiple,
          },
        });
        const targetSize = {
          width: providerInputPlan.targetWidth,
          height: providerInputPlan.targetHeight,
        };
        const thumbnailSize = thumbnailTargetSize(sourceSize);
        const asset = await executeHostModal(
          async () => {
            const thumbnailUrl = await createPhotoshopThumbnailUrl(
              imaging,
              {
                documentID: activeDocument.id,
                layerID: layerId,
                ...(bounds ? { sourceBounds: bounds } : {}),
                targetSize: thumbnailSize,
                colorSpace: 'RGB',
                componentSize: 8,
                applyAlpha: false,
              },
              {
                requestedRect: bounds,
                targetSize: thumbnailSize,
              },
            );
            const result = await imaging.getPixels({
              documentID: activeDocument.id,
              layerID: layerId,
              ...(bounds ? { sourceBounds: bounds } : {}),
              targetSize,
              colorSpace: 'RGB',
              componentSize: 8,
              applyAlpha: false,
            });
            const rgba = await imageDataToRgba(result.imageData, {
              requestedRect: bounds,
              targetSize,
              sourceBounds: result.sourceBounds,
              sourceLevel: result.level,
            });
            const png = await rgbaToPngBytes({ width: targetSize.width, height: targetSize.height, data: rgba });
            return createStoredHostImageAsset(assetStore, png, {
              source: 'layer',
              name: `layer-${layerId}.png`,
              mimeType: 'image/png',
              preview: thumbnailUrl,
              width: targetSize.width,
              height: targetSize.height,
            });
          },
          { commandName: 'Read layer pixels' },
        );
        const placement = layerPlacementFor(activeDocument, layer, bounds);
        const placedAsset = {
          ...asset,
          photoshopPlacement: {
            ...placement,
            uploadPlan: uploadPlan.capture,
            providerInputPlan,
          },
        };
        span.finish({
          layerId,
          name: asset.asset.name,
          mimeType: asset.asset.mimeType,
          documentId: placement.snapshot.documentId,
        });
        return placedAsset;
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
              componentSize: 8,
            }),
          { commandName: 'Read layer mask' },
        );
        try {
          // Mask/selection 是单通道灰度；当前不扩展为 RGBA 预览，避免额外全尺寸副本。
        } finally {
          result.imageData.dispose();
        }
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

    async getLayerThumbnail(
      layerId: number,
      maxSide = LAYER_PICKER_THUMBNAIL_MAX_SIDE,
    ): Promise<RuntimeImageUrl | undefined> {
      const span = logger.startSpan('hostbridge.get_layer_thumbnail', { layerId, maxSide });
      try {
        const activeDocument = app.activeDocument;
        const layer = activeDocument ? findLayer(activeDocument.layers ?? [], layerId) : undefined;
        const documentId = activeDocument?.id;
        if (!documentId || !layer) {
          span.finish({ layerId, found: false });
          return undefined;
        }
        const targetLayer = layer;
        const thumbnail = await executeHostModal(
          () => createLayerThumbnailUrl(imaging, documentId, targetLayer, maxSide),
          { commandName: `Get thumbnail for layer ${targetLayer.name ?? layerId}` },
        );
        span.finish({ layerId, found: true, hasThumbnail: Boolean(thumbnail) });
        return thumbnail;
      } catch (error) {
        span.fail(error, { layerId });
        return undefined;
      }
    },

    async saveAssetToFile(asset: Asset, options): Promise<void> {
      const span = logger.startSpan('hostbridge.save_asset', {
        name: asset.name,
        mimeType: asset.mimeType,
      });
      try {
        if (typeof fs.getFileForSaving !== 'function') {
          throw new Error('Photoshop file save dialog is unavailable in this runtime.');
        }
        const { data, mimeType } = await assetToArrayBuffer(asset, {
          resolveStoredRef: (ref) => assetStore.resolve(ref),
        });
        const suggestedName = suggestedAssetFileName({
          name: options?.suggestedName ?? asset.name,
          mimeType,
        });
        const target = await fs.getFileForSaving(suggestedName, {
          types: [fileExtensionFor(mimeType)],
        });
        if (!target) {
          span.finish({ cancelled: true, mimeType });
          return;
        }
        await target.write(data, { format: uxpBinaryFormat(formats) });
        span.finish({
          mimeType,
          byteLength: data.byteLength,
          targetName: target.name,
        });
      } catch (error) {
        span.fail(error, {
          name: asset.name,
          mimeType: asset.mimeType,
        });
        throw error;
      }
    },

    async placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void> {
      const span = logger.startSpan('hostbridge.place_asset', {
        name: asset.name,
        mimeType: asset.mimeType,
        placement: placement.kind,
      });
      try {
        const { document: targetDocument, usedActiveDocumentFallback } = targetDocumentForPlacement(app, placement);
        const { data, mimeType } = await assetToArrayBuffer(asset, {
          resolveStoredRef: (ref) => assetStore.resolve(ref),
        });
        ensurePlaceableImagePayload(data, mimeType);
        const bytes = new Uint8Array(data);
        if (placement.kind === 'exact-frame') {
          assertExactPlacementAspect(bytes, mimeType, placement.placementRect);
        }
        const folder = await fs.getTemporaryFolder();
        const file = await folder.createFile(`imagen-ps-${Date.now()}.${fileExtensionFor(mimeType)}`, {
          overwrite: true,
        });
        try {
          await file.write(data, { format: uxpBinaryFormat(formats) });
          const token = fs.createSessionToken(file);
          const placedAssetSize = readImageSize(bytes, mimeType);

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
              if (placement.kind === 'exact-frame' && !usedActiveDocumentFallback) {
                await transformActivePlacedLayer(targetDocument, placement.placementRect);
              } else if (placement.kind === 'unbound' && placement.reason === 'no-photoshop-capture' && placedAssetSize) {
                await normalizeUnboundPlacedLayerSize(targetDocument, placedAssetSize);
              }
            },
            { commandName: 'Place generated image' },
          );
        } finally {
          await file.delete?.();
        }
        span.finish({ name: asset.name, mimeType, placement: placement.kind });
      } catch (error) {
        span.fail(error, { name: asset.name, mimeType: asset.mimeType, placement: placement.kind });
        throw error;
      }
    },
  };
}
