import { describe, expect, it, vi } from 'vitest';
import { decode as decodePng, encode as encodePng } from 'fast-png';
import jpeg from 'jpeg-js';
import {
  createHostModalRunner,
  createPhotoshopHostBridge,
  createPhotoshopThumbnailGenerator,
} from './photoshop-host-bridge';
import type { UxpModules } from './uxp-api';
import { createNullLogger } from '@imagen-ps/foundation';
import { createInMemoryAssetStore } from './in-memory-host-storage';
import type { StoredAssetRef } from '@imagen-ps/application';

function arrayBufferFromText(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const VALID_TRANSPARENT_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x60,
  0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa5, 0xf6,
  0x45, 0x40, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const VALID_TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const VALID_1024_JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0,
  0x00, 0x11,
  0x08,
  0x04, 0x00,
  0x04, 0x00,
  0x03,
  0x01, 0x11, 0x00,
  0x02, 0x11, 0x00,
  0x03, 0x11, 0x00,
  0xff, 0xd9,
]);

function crc32(bytes: Uint8Array, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = offset; i < offset + length; i += 1) {
    crc ^= bytes[i] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

const VALID_1024_TRANSPARENT_PNG = (() => {
  const bytes = new Uint8Array(VALID_TRANSPARENT_PNG);
  writeUint32BE(bytes, 16, 1024);
  writeUint32BE(bytes, 20, 1024);
  writeUint32BE(bytes, 29, crc32(bytes, 12, 17));
  return bytes;
})();

function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(VALID_TRANSPARENT_PNG);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  writeUint32BE(bytes, 29, crc32(bytes, 12, 17));
  return bytes;
}

function realPngWithSize(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  return encodePng({
    width,
    height,
    data,
    channels: 4,
    depth: 8,
  });
}

function realRgbPngWithSize(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      data[offset] = Math.round((x / Math.max(1, width - 1)) * 255);
      data[offset + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      data[offset + 2] = 160;
    }
  }
  return encodePng({
    width,
    height,
    data,
    channels: 3,
    depth: 8,
  });
}

function realJpegWithSize(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = Math.round((x / Math.max(1, width - 1)) * 255);
      data[offset + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      data[offset + 2] = 160;
      data[offset + 3] = 255;
    }
  }
  return jpeg.encode({ width, height, data: Buffer.from(data) }, 90).data;
}

const LEGACY_TRUNCATED_MOCK_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
  0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const providerPolicy = { maxSide: 2048 } as const;

const DEFLATE_STORED_BLOCK_MAX = 0xffff;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function deflateStored(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.byteLength / DEFLATE_STORED_BLOCK_MAX));
  const bytes = new Uint8Array(2 + data.byteLength + blockCount * 5 + 4);
  let offset = 0;
  bytes[offset++] = 0x78;
  bytes[offset++] = 0x01;
  let source = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const length = Math.min(DEFLATE_STORED_BLOCK_MAX, data.byteLength - source);
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

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(12 + data.byteLength);
  writeUint32BE(bytes, 0, data.byteLength);
  for (let index = 0; index < type.length; index += 1) {
    bytes[4 + index] = type.charCodeAt(index);
  }
  bytes.set(data, 8);
  writeUint32BE(bytes, 8 + data.byteLength, crc32(bytes, 4, 4 + data.byteLength));
  return bytes;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function encodeFilteredLine(
  pixels: Uint8Array,
  previous: Uint8Array | undefined,
  filter: 3 | 4,
): Uint8Array {
  const bytesPerPixel = 3;
  const line = new Uint8Array(1 + pixels.byteLength);
  line[0] = filter;
  for (let index = 0; index < pixels.byteLength; index += 1) {
    const left = index >= bytesPerPixel ? pixels[index - bytesPerPixel] : 0;
    const up = previous?.[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous?.[index - bytesPerPixel] ?? 0 : 0;
    const predictor = filter === 3 ? Math.floor((left + up) / 2) : paethPredictor(left, up, upLeft);
    line[index + 1] = (pixels[index] - predictor) & 0xff;
  }
  return line;
}

function rgbFilterRegressionPng(): {
  readonly bytes: Uint8Array;
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
} {
  const width = 4;
  const height = 2;
  const row0 = new Uint8Array([
    10, 20, 30,
    80, 90, 100,
    130, 140, 150,
    220, 230, 240,
  ]);
  const row1 = new Uint8Array([
    14, 25, 36,
    88, 99, 111,
    144, 155, 166,
    233, 244, 250,
  ]);
  const raw = new Uint8Array((1 + width * 3) * height);
  raw.set(encodeFilteredLine(row0, undefined, 3), 0);
  raw.set(encodeFilteredLine(row1, row0, 4), 1 + width * 3);
  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = deflateStored(raw);
  const chunks = [
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', idat),
    createPngChunk('IEND', new Uint8Array(0)),
  ];
  const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const pixels = new Uint8Array([...row0, ...row1]);
  return { bytes, pixels, width, height };
}

function decodedPngRgbAt(decoded: ReturnType<typeof decodePng>, pixel: number): readonly number[] {
  const source = pixel * decoded.channels;
  return [
    decoded.data[source] ?? 0,
    decoded.data[source + 1] ?? 0,
    decoded.data[source + 2] ?? 0,
  ];
}

async function withObjectUrlMock<T>(
  run: (spies: {
    readonly create: ReturnType<typeof vi.fn>;
    readonly revoke: ReturnType<typeof vi.fn>;
    readonly blobs: Blob[];
  }) => Promise<T>,
): Promise<T> {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let nextUrl = 1;
  const blobs: Blob[] = [];
  const create = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:thumb-${nextUrl++}`;
  });
  const revoke = vi.fn();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  try {
    return await run({ create, revoke, blobs });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

function createFakeModules(options?: {
  readonly pickedFileName?: string;
  readonly pickedFileData?: ArrayBuffer;
  readonly layerColorSpace?: string;
  readonly layerData?: Uint8Array | Uint16Array | Float32Array;
  readonly maskColorSpace?: string;
  readonly selectionBounds?: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null;
  readonly activeLayerBounds?: { readonly _left: number; readonly _top: number; readonly _right: number; readonly _bottom: number };
  readonly pixelResultSourceBounds?: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly pixelResultLevel?: number;
  readonly pixelResultSize?: { readonly width: number; readonly height: number };
}): {
  readonly modules: UxpModules;
  readonly spies: {
    readonly getPixels: ReturnType<typeof vi.fn>;
    readonly getSelection: ReturnType<typeof vi.fn>;
    readonly getLayerMask: ReturnType<typeof vi.fn>;
    readonly encodeImageData: ReturnType<typeof vi.fn>;
    readonly disposeLayer: ReturnType<typeof vi.fn>;
    readonly disposeMask: ReturnType<typeof vi.fn>;
    readonly getFileForOpening: ReturnType<typeof vi.fn>;
    readonly createFile: ReturnType<typeof vi.fn>;
    readonly writeTempFile: ReturnType<typeof vi.fn>;
    readonly deleteTempFile: ReturnType<typeof vi.fn>;
    readonly createSessionToken: ReturnType<typeof vi.fn>;
    readonly isModal: ReturnType<typeof vi.fn>;
    readonly setExecutionMode: ReturnType<typeof vi.fn>;
    readonly executeAsModal: ReturnType<typeof vi.fn>;
    readonly batchPlay: ReturnType<typeof vi.fn>;
    readonly scalePlacedLayer: ReturnType<typeof vi.fn>;
    readonly translatePlacedLayer: ReturnType<typeof vi.fn>;
    readonly openDocument: ReturnType<typeof vi.fn>;
    readonly closeTempDocument: ReturnType<typeof vi.fn>;
  };
} {
  const pickedFileName = options?.pickedFileName ?? 'picked.png';
  const pickedFileData = options?.pickedFileData ?? arrayBufferFromBytes(VALID_1024_TRANSPARENT_PNG);
  const disposeLayer = vi.fn();
  const disposeMask = vi.fn();
  const createLayerImageData = (width = 64, height = 64) => {
    const rgbaBytes = new Uint8Array(width * height * 4);
    rgbaBytes.fill(255);
    return {
      width,
      height,
      colorSpace: options?.layerColorSpace ?? 'RGB',
      components: 4,
      pixelFormat: 'RGBA',
      getData: vi.fn(async () => options?.layerData ?? rgbaBytes),
      dispose: disposeLayer,
    };
  };
  const createMaskImageData = (width = 64, height = 64) => {
    const maskBytes = new Uint8Array(width * height);
    maskBytes.fill(255);
    return {
      width,
      height,
      colorSpace: options?.maskColorSpace ?? 'Grayscale',
      components: 1,
      pixelFormat: 'Grayscale',
      getData: vi.fn(async () => maskBytes),
      dispose: disposeMask,
    };
  };
  const getPixels = vi.fn(async (request?: { readonly targetSize?: { readonly width?: number; readonly height?: number } }) => ({
    imageData: createLayerImageData(
      options?.pixelResultSize?.width ?? request?.targetSize?.width,
      options?.pixelResultSize?.height ?? request?.targetSize?.height,
    ),
    ...(options?.pixelResultSourceBounds ? { sourceBounds: options.pixelResultSourceBounds } : {}),
    ...(options?.pixelResultLevel !== undefined ? { level: options.pixelResultLevel } : {}),
  }));
  const getSelection = vi.fn(async (request?: { readonly targetSize?: { readonly width?: number; readonly height?: number } }) => ({
    imageData: createMaskImageData(request?.targetSize?.width, request?.targetSize?.height),
  }));
  const getLayerMask = vi.fn(async () => ({ imageData: createMaskImageData() }));
  const encodeImageData = vi.fn(async () => 'unused-jpeg-base64');
  const getFileForOpening = vi.fn(async () => ({
    name: pickedFileName,
    read: vi.fn(async () => pickedFileData),
    write: vi.fn(async () => undefined),
  }));
  const writeTempFile = vi.fn(async () => undefined);
  const deleteTempFile = vi.fn(async () => undefined);
  const createFile = vi.fn(async () => ({
    name: 'temp-image.png',
    read: vi.fn(async () => arrayBufferFromText('unused')),
    write: writeTempFile,
    delete: deleteTempFile,
  }));
  const createSessionToken = vi.fn(() => 'session-token-1');
  const batchPlay = vi.fn(async () => undefined);
  const scalePlacedLayer = vi.fn(async () => undefined);
  const translatePlacedLayer = vi.fn(async () => undefined);
  const closeTempDocument = vi.fn(async () => undefined);
  const openDocument = vi.fn(async () => ({
    id: 99,
    width: 512,
    height: 512,
    layers: [],
    activeLayers: [],
    close: closeTempDocument,
  }));
  const executeAsModal = vi.fn(async (callback: () => Promise<void>) => callback());
  const isModal = vi.fn(() => false);
  const setExecutionMode = vi.fn();
  const activeLayerBounds = options?.activeLayerBounds ?? { _left: 0, _top: 0, _right: 64, _bottom: 64 };

  return {
    modules: {
      photoshop: {
        app: {
          open: openDocument,
          activeDocument: {
            id: 42,
            width: 512,
            height: 384,
            selection: {
              bounds: options?.selectionBounds ?? null,
            },
            activeLayers: [
              {
                id: 2,
                name: 'Child',
                kind: 'pixel',
                visible: false,
                hasUserMask: true,
                bounds: activeLayerBounds,
                boundsNoEffects: activeLayerBounds,
                scale: scalePlacedLayer,
                translate: translatePlacedLayer,
              },
            ],
            layers: [
              {
                id: 1,
                name: 'Group',
                kind: 'group',
                visible: true,
                layers: [
                  {
                    id: 2,
                    name: 'Child',
                    kind: 'pixel',
                    visible: false,
                    hasUserMask: true,
                    bounds: activeLayerBounds,
                    boundsNoEffects: activeLayerBounds,
                    scale: scalePlacedLayer,
                    translate: translatePlacedLayer,
                  },
                  {
                    id: 3,
                    name: 'Empty',
                    kind: 'pixel',
                    visible: true,
                    bounds: { _left: 0, _top: 0, _right: 0, _bottom: 0 },
                  },
                ],
              },
            ],
          },
        },
        imaging: { getPixels, getSelection, getLayerMask, encodeImageData },
        core: { executeAsModal, isModal, setExecutionMode },
        action: { batchPlay },
      },
      uxp: {
        storage: {
          formats: { binary: 'binary' },
          localFileSystem: {
            getFileForOpening,
            async getTemporaryFolder() {
              return { createFile };
            },
            createSessionToken,
          },
        },
      },
    },
    spies: {
      getPixels,
      getSelection,
      getLayerMask,
      encodeImageData,
      disposeLayer,
      disposeMask,
      getFileForOpening,
      createFile,
      writeTempFile,
      deleteTempFile,
      createSessionToken,
      isModal,
      setExecutionMode,
      executeAsModal,
      batchPlay,
      scalePlacedLayer,
      translatePlacedLayer,
      openDocument,
      closeTempDocument,
    },
  };
}

function createBridge(modules: UxpModules) {
  const assetStore = createInMemoryAssetStore();
  return {
    bridge: createPhotoshopHostBridge(modules, { assetStore }),
    assetStore,
  };
}

function createThumbnailGenerator(modules: UxpModules) {
  return createPhotoshopThumbnailGenerator(modules, {
    logger: createNullLogger(),
  });
}

async function resolveAssetBytes(assetStore: ReturnType<typeof createInMemoryAssetStore>, asset: { readonly storedRef?: unknown }): Promise<Uint8Array> {
  expect(asset.storedRef).toMatchObject({ kind: 'hostObject' });
  const bytes = await assetStore.resolve(asset.storedRef as StoredAssetRef);
  expect(bytes).toBeInstanceOf(ArrayBuffer);
  return new Uint8Array(bytes!);
}

describe('PhotoshopHostBridge fake harness', () => {
  it('列出 Photoshop layer tree 并保留 mask/visible 元数据', async () => {
    const { modules } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.listLayers()).resolves.toEqual([
      {
        id: 1,
        name: 'Group',
        kind: 'group',
        visible: true,
        children: [
          {
            id: 2,
            name: 'Child',
            kind: 'pixel',
            visible: false,
            hasUserMask: true,
            bounds: { left: 0, top: 0, right: 64, bottom: 64 },
          },
          {
            id: 3,
            name: 'Empty',
            kind: 'pixel',
            visible: true,
            bounds: { left: 0, top: 0, right: 0, bottom: 0 },
          },
        ],
      },
    ]);
  });

  it('通过 imaging 读取 layer，并在 mask 为 grayscale 时安全跳过预览编码', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const layerAsset = await bridge.readLayerAsAsset(2, providerPolicy);
    expect(layerAsset).toMatchObject({
      asset: { type: 'image', name: 'layer-2.png', mimeType: 'image/png' },
      metadata: { source: 'layer', name: 'layer-2.png', mimeType: 'image/png' },
      payload: { kind: 'host-object' },
      photoshopPlacement: {
        snapshot: {
          documentId: 42,
          documentSize: { width: 512, height: 384 },
          layerId: 2,
          layerBoundsNoEffects: { left: 0, top: 0, right: 64, bottom: 64 },
          selectionBounds: null,
        },
        placementRect: { left: 0, top: 0, right: 64, bottom: 64 },
        providerInputPlan: expect.objectContaining({
          sourceWidth: 64,
          sourceHeight: 64,
          targetWidth: 2048,
          targetHeight: 2048,
          fit: 'preserve-ratio',
          maxSideBucket: 2048,
          effectiveMultiple: 2,
          maxSide: 2048,
          wasUpscaled: true,
        }),
      },
    });
    expect(layerAsset.asset.data).toBeUndefined();
    expect((await resolveAssetBytes(assetStore, layerAsset.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    await expect(bridge.readLayerMaskAsAsset(2)).resolves.toBeUndefined();

    expect(spies.getPixels).toHaveBeenNthCalledWith(1, {
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 64, height: 64 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, {
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 2048, height: 2048 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    expect(spies.getLayerMask).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      kind: 'user',
      componentSize: 8,
    });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer pixels' });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer mask' });
    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(2);
    expect(spies.disposeMask).toHaveBeenCalledTimes(1);
  });

  it('为 Photoshop 图层独立生成 bounded thumbnail derivative 和 provider derivative', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules({
      activeLayerBounds: { _left: 0, _top: 0, _right: 3000, _bottom: 1500 },
    });
    const { bridge } = createBridge(modules);

    const layerAsset = await bridge.readLayerAsAsset(2, providerPolicy);

    expect(layerAsset.resource.derivatives.thumbnail).toMatchObject({
      kind: 'ready',
      role: 'thumbnail',
      mimeType: 'image/png',
    });
    expect(layerAsset.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 1024,
      mimeType: 'image/png',
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 256, height: 128 },
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 2048, height: 1024 },
    }));
    expect(layerAsset.preview).toMatchObject({ kind: 'object-url', url: 'blob:thumb-1' });
    expect(create).toHaveBeenCalledTimes(1);
    layerAsset.preview.dispose?.();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('layer pixels 未转成 RGB 时返回清晰错误并释放 imageData', async () => {
    const { modules, spies } = createFakeModules({ layerColorSpace: 'Lab' });
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(2, providerPolicy)).rejects.toThrow('Photoshop capture requires RGB image data, got Lab.');

    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(1);
  });

  it('layer pixels 未按 8-bit 返回时给出清晰错误并释放 imageData', async () => {
    const { modules, spies } = createFakeModules({ layerData: new Uint16Array(64 * 64 * 4) });
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(2, providerPolicy)).rejects.toThrow('Photoshop capture requires 8-bit component data.');

    expect(spies.encodeImageData).not.toHaveBeenCalled();
    expect(spies.disposeLayer).toHaveBeenCalledTimes(1);
  });

  it('读取空 bounds 图层前返回清晰错误', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(3, providerPolicy)).rejects.toThrow('Photoshop layer has no readable pixels: Empty');

    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.executeAsModal).not.toHaveBeenCalled();
  });

  it('通过 UXP file picker 读取 image file', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile({ maxSide: 1024 });

    expect(spies.getFileForOpening).toHaveBeenCalledWith({
      types: ['png', 'jpg', 'jpeg', 'webp'],
      allowMultiple: false,
    });
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'picked.png',
      mimeType: 'image/png',
    });
    expect(asset?.asset.data).toBeUndefined();
    expect(asset?.asset.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/png', name: 'picked.png' });
    expect(asset?.metadata.source).toBe('file');
  });

  it('按 picker 文件名推断 JPEG MIME，避免后续 PNG 预检误判', async () => {
    const { modules } = createFakeModules({
      pickedFileName: 'picked.JPG',
      pickedFileData: arrayBufferFromBytes(VALID_1024_JPEG),
    });
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile({ maxSide: 1024 });

    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'picked.JPG',
      mimeType: 'image/jpeg',
    });
    expect(asset?.asset.data).toBeUndefined();
    expect(asset?.asset.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/jpeg', name: 'picked.JPG' });
  });

  it('拒绝 structurally unsafe picker image，避免坏 bytes 进入会话 attachment', async () => {
    const { modules } = createFakeModules({
      pickedFileName: 'picked.png',
      pickedFileData: arrayBufferFromBytes(LEGACY_TRUNCATED_MOCK_PNG),
    });
    const { bridge } = createBridge(modules);

    await expect(bridge.pickImageFile(providerPolicy)).rejects.toThrow('PNG asset chunk CRC is invalid.');
  });

  it('uses the app-local PNG derivative path for resized local files', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'tiny.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(512, 512)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Normalize local image for provider input' });
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.asset.storedRef).toMatchObject({
      kind: 'hostObject',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
      name: 'tiny.png',
    });
    expect(asset?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(asset?.asset.data).toBeUndefined();
  });

  it('uses the app-local JPEG derivative path for resized local files', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'tiny.jpg',
      pickedFileData: arrayBufferFromBytes(realJpegWithSize(512, 512)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Normalize local image for provider input' });
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'tiny.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
      name: 'tiny.png',
    });
    expect(asset?.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 2048,
      height: 2048,
      mimeType: 'image/png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('normalizes RGB PNG local files into RGBA before app-local resize', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'rgb.png',
      pickedFileData: arrayBufferFromBytes(realRgbPngWithSize(224, 225)),
    });
    const { bridge, assetStore } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(asset?.asset).toMatchObject({
      type: 'image',
      name: 'rgb.png',
      mimeType: 'image/png',
    });
    expect(asset?.metadata).toMatchObject({
      source: 'file',
      width: 2016,
      height: 2025,
      mimeType: 'image/png',
      name: 'rgb.png',
    });
    const bytes = await resolveAssetBytes(assetStore, asset!.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('downscales very large local files within the selected provider max side', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'large.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(3000, 1800)),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
  });

  it('normalizes local files when only provider multiple/min-side policy changes size', async () => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'wide.png',
      pickedFileData: arrayBufferFromBytes(realPngWithSize(1201, 800)),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
  });

  it('为无需 provider resize 的本地文件仍生成 bounded thumbnail preview', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules({
      pickedFileName: 'ready.png',
      pickedFileData: arrayBufferFromBytes(pngWithSize(2048, 2048)),
    });
    const { bridge } = createBridge(modules);

    const asset = await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(asset?.preview).toMatchObject({ kind: 'object-url', url: 'blob:thumb-1' });
    expect(asset?.asset.storedRef).toMatchObject({ name: 'ready.png', mimeType: 'image/png' });
    expect(create).toHaveBeenCalledTimes(1);
    asset?.preview.dispose?.();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('keeps WEBP on the host-native temp-document path until app-local support is proven', async () => withObjectUrlMock(async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x03, 0x00, 0xff, 0x03, 0x00,
    ]);
    const { modules, spies } = createFakeModules({
      pickedFileName: 'picked.webp',
      pickedFileData: arrayBufferFromBytes(webpBytes),
    });
    const { bridge } = createBridge(modules);

    await bridge.pickImageFile(providerPolicy);

    expect(spies.openDocument).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenCalled();
    expect(spies.closeTempDocument).toHaveBeenCalledTimes(1);
  }));

  it('为 PNG storedRef provider output 通过 app-local path 生成 bounded thumbnail', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'echo.png', mimeType: 'image/png' },
      bytes: realPngWithSize(4096, 2048),
      mimeType: 'image/png',
      maxSide: 256,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.writeTempFile).not.toHaveBeenCalled();
    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.closeTempDocument).not.toHaveBeenCalled();
    expect(spies.deleteTempFile).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    preview?.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('keeps RGB PNG filter 3/4 pixels stable through app-local decode and encode', async () => withObjectUrlMock(async ({ blobs }) => {
    const fixture = rgbFilterRegressionPng();
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'filtered-rgb.png', mimeType: 'image/png' },
      bytes: fixture.bytes,
      mimeType: 'image/png',
      maxSide: 512,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.openDocument).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(1);

    const encoded = new Uint8Array(await blobs[0]!.arrayBuffer());
    const decoded = decodePng(encoded);

    expect(decoded.width).toBe(fixture.width);
    expect(decoded.height).toBe(fixture.height);
    expect(decoded.channels === 3 || decoded.channels === 4).toBe(true);
    expect(decodedPngRgbAt(decoded, 0)).toEqual([10, 20, 30]);
    expect(decodedPngRgbAt(decoded, 1)).toEqual([80, 90, 100]);
    expect(decodedPngRgbAt(decoded, 2)).toEqual([130, 140, 150]);
    expect(decodedPngRgbAt(decoded, 3)).toEqual([220, 230, 240]);

    const samplePixels = [0, 1, 4, 7];
    for (const pixel of samplePixels) {
      const source = pixel * 3;
      expect(decodedPngRgbAt(decoded, pixel)).toEqual([
        fixture.pixels[source],
        fixture.pixels[source + 1],
        fixture.pixels[source + 2],
      ]);
    }

    preview?.release();
  }));

  it('为 WEBP storedRef provider output 保留 host-native temp-document thumbnail path', async () => withObjectUrlMock(async ({ create, revoke }) => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x03, 0x00, 0xff, 0x03, 0x00,
    ]);
    const { modules, spies } = createFakeModules();
    const createThumbnail = createThumbnailGenerator(modules);

    const preview = await createThumbnail?.({
      asset: { type: 'image', name: 'echo.webp', mimeType: 'image/webp' },
      bytes: webpBytes,
      mimeType: 'image/webp',
      maxSide: 256,
    });

    expect(preview).toMatchObject({ url: 'blob:thumb-1' });
    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-thumb-\d+\.webp$/), { overwrite: true });
    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(Uint8Array), { format: 'binary' });
    expect(spies.openDocument).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenCalledWith(expect.objectContaining({
      documentID: 99,
      targetSize: { width: 256, height: 256 },
    }));
    expect(spies.closeTempDocument).toHaveBeenCalledTimes(1);
    expect(spies.deleteTempFile).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    preview?.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('captureActiveImage materializes active layer as PNG with placement metadata', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    expect(capture.sourceKind).toBe('layer');
    expect(capture.image.asset).toMatchObject({
      type: 'image',
      name: 'photoshop-layer-2.png',
      mimeType: 'image/png',
    });
    expect(capture.image.asset.data).toBeUndefined();
    expect((await resolveAssetBytes(assetStore, capture.image.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(capture.placement.snapshot).toMatchObject({
      documentId: 42,
      documentSize: { width: 512, height: 384 },
      layerId: 2,
      layerBoundsNoEffects: { left: 0, top: 0, right: 64, bottom: 64 },
      selectionBounds: null,
    });
    expect(capture.placement.placementRect).toEqual({ left: 0, top: 0, right: 64, bottom: 64 });
    expect(capture.placement.providerInputPlan).toMatchObject({
      sourceWidth: 64,
      sourceHeight: 64,
      targetWidth: 2048,
      targetHeight: 2048,
      wasUpscaled: true,
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 64, height: 64 },
      applyAlpha: false,
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 2048, height: 2048 },
      applyAlpha: false,
    }));
    expect(spies.getSelection).not.toHaveBeenCalled();
  });

  it('captureActiveImage pads Photoshop-trimmed pixel results back to requested frame', async () => {
    const { modules } = createFakeModules({
      pixelResultSourceBounds: { left: 8, top: 4, right: 24, bottom: 20 },
      pixelResultSize: { width: 16, height: 16 },
    });
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    const bytes = await resolveAssetBytes(assetStore, capture.image.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('captureActiveImage maps cached sourceBounds by pyramid level before padding', async () => {
    const { modules } = createFakeModules({
      pixelResultSourceBounds: { left: 4, top: 2, right: 12, bottom: 10 },
      pixelResultLevel: 1,
      pixelResultSize: { width: 8, height: 8 },
    });
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    const bytes = await resolveAssetBytes(assetStore, capture.image.asset);
    expect(bytes.slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
  });

  it('captureActiveImage applies selection mask when selection bounds exist', async () => {
    const { modules, spies } = createFakeModules({
      selectionBounds: { left: 8, top: 8, right: 40, bottom: 40 },
    });
    const { bridge } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    expect(capture.sourceKind).toBe('selection');
    expect(capture.placement.snapshot.selectionBounds).toEqual({ left: 8, top: 8, right: 40, bottom: 40 });
    expect(capture.placement.placementRect).toEqual({ left: 8, top: 8, right: 40, bottom: 40 });
    expect(spies.getSelection).toHaveBeenCalledWith({
      documentID: 42,
      sourceBounds: { left: 8, top: 8, right: 40, bottom: 40 },
      targetSize: { width: 2048, height: 2048 },
      componentSize: 8,
    });
  });

  it('placeAssetOnCanvas 生成 temporary file/session token 并在 modal 内调用 placeEvent', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    });

    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-ps-\d+\.png$/), { overwrite: true });
    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(spies.createSessionToken).toHaveBeenCalledTimes(1);
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Place generated image' });
    expect(spies.batchPlay).toHaveBeenCalledWith(
      [
        {
          _obj: 'placeEvent',
          null: {
            _path: 'session-token-1',
            _kind: 'local',
          },
        },
      ],
      { synchronousExecution: false },
    );
    expect(spies.deleteTempFile).toHaveBeenCalledTimes(1);
  });

  it('unbound no-photoshop-capture placement targets the active Photoshop document', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-ps-\d+\.png$/), { overwrite: true });
  });

  it('unbound no-photoshop-capture placement rejects missing active Photoshop document', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    })).rejects.toThrow('requires an active Photoshop document');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('unbound multiple-documents placement rejects before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'multiple-documents',
    })).rejects.toThrow('ambiguous across multiple source documents');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placeAssetOnCanvas resolves hostObject storedRef before writing the temporary file', async () => {
    const { modules, spies } = createFakeModules();
    const assetStore = createInMemoryAssetStore();
    const storedRef = await assetStore.put(arrayBufferFromBytes(VALID_TRANSPARENT_PNG), {
      mimeType: 'image/png',
      name: 'stored.png',
    });
    const bridge = createPhotoshopHostBridge(modules, { assetStore });

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'stored.png',
      mimeType: 'image/png',
      storedRef,
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    });

    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
  });

  it('exact-frame placement targets capture document and transforms the placed layer', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 10, top: 20, right: 138, bottom: 148 },
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.scalePlacedLayer).toHaveBeenCalledWith(200, 200);
    expect(spies.translatePlacedLayer).toHaveBeenCalledWith(10, 20);
  });

  it('document-only placement accepts provider-owned output ratio without transform', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.scalePlacedLayer).not.toHaveBeenCalled();
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();
  });

  it('exact-frame placement rejects provider output ratio mismatch before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 0, top: 0, right: 345, bottom: 321 },
    })).rejects.toThrow('Exact-frame placement requires matching aspect ratio');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('exact-frame placement rejects document mismatch before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: { width?: number; height?: number } };
    app.activeDocument = { ...app.activeDocument, width: 256, height: 384 };
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 10, top: 20, right: 138, bottom: 148 },
    })).rejects.toThrow('document mismatch');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects missing document before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('no longer available');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects ambiguous reopened document matches before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [
      { id: 99, name: 'source.psd', width: 512, height: 384 },
      { id: 100, name: 'source.psd', width: 512, height: 384 },
    ];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentName: 'source.psd',
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('ambiguous across 2 documents');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects weak reopened document matches before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [
      { id: 99, name: 'source.psd', width: 512, height: 384 },
    ];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentName: 'source.psd',
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('weak document match requires explicit confirmation');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('串行执行 Photoshop modal 操作，避免并发 executeAsModal 互相踩踏', async () => {
    const { modules, spies } = createFakeModules();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    spies.executeAsModal
      .mockImplementationOnce(async (callback: () => Promise<unknown>) => {
        order.push('first-start');
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        const result = await callback();
        order.push('first-end');
        return result;
      })
      .mockImplementationOnce(async (callback: () => Promise<unknown>) => {
        order.push('second-start');
        const result = await callback();
        order.push('second-end');
        return result;
      });
    const { bridge } = createBridge(modules);

    const first = bridge.readLayerAsAsset(2, providerPolicy);
    const second = bridge.readLayerMaskAsAsset(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['first-start']);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    expect(spies.setExecutionMode).toHaveBeenCalledWith({ enableErrorStacktraces: true });
  });

  it('modal slot 长时间不可用时返回清晰错误而不是永久等待', async () => {
    vi.useFakeTimers();
    try {
      const executeAsModal = vi.fn(async () => undefined);
      const runHostModal = createHostModalRunner(
        {
          executeAsModal,
          isModal: () => true,
        },
        createNullLogger(),
      );

      const pending = runHostModal(async () => undefined, { commandName: 'Blocked modal' });
      const rejection = expect(pending).rejects.toThrow('Photoshop modal state did not become available.');
      await vi.runAllTimersAsync();

      await rejection;
      expect(executeAsModal).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('placeAssetOnCanvas 拒绝旧 mock 坏 PNG，避免进入 Photoshop placeEvent', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(
      bridge.placeAssetOnCanvas({
        type: 'image',
        name: 'legacy-mock.png',
        data: LEGACY_TRUNCATED_MOCK_PNG,
        mimeType: 'image/png',
      }, {
        kind: 'document-only',
        documentId: 42,
        documentSizeAtCapture: { width: 512, height: 384 },
      }),
    ).rejects.toThrow('PNG asset chunk CRC is invalid.');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.writeTempFile).not.toHaveBeenCalled();
    expect(spies.createSessionToken).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('依赖缺失时返回不会触碰 Photoshop/UXP 的 stub bridge', async () => {
    const { bridge } = createBridge({});

    await expect(bridge.listLayers()).resolves.toEqual([]);
    await expect(bridge.pickImageFile(providerPolicy)).resolves.toBeUndefined();
    await expect(bridge.readLayerMaskAsAsset(1)).resolves.toBeUndefined();
    await expect(bridge.readLayerAsAsset(1, providerPolicy)).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.captureActiveImage(providerPolicy)).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.placeAssetOnCanvas({ type: 'image' }, { kind: 'unbound', reason: 'no-photoshop-capture' })).rejects.toThrow('unavailable outside UXP');
  });
});
