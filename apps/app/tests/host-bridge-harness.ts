import { expect, vi } from 'vitest';
import { encode as encodePng } from 'fast-png';
import jpeg from 'jpeg-js';
import {
  createHostModalRunner,
  createPhotoshopHostBridge,
  createPhotoshopThumbnailGenerator,
} from '../src/adapters/uxp/photoshop-host-bridge';
import type { UxpModules } from '../src/adapters/uxp/uxp-api';
import { createNullLogger } from '@imagen-ps/foundation';
import { createInMemoryAssetStore } from '../src/adapters/uxp/in-memory-host-storage';
import type { StoredAssetRef } from '@imagen-ps/application';

export { createHostModalRunner, createPhotoshopHostBridge, createPhotoshopThumbnailGenerator, createInMemoryAssetStore };

export function arrayBufferFromText(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

export function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export const VALID_TRANSPARENT_PNG = new Uint8Array([
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

export const VALID_TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
export const VALID_1024_JPEG = new Uint8Array([
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

export const VALID_1024_TRANSPARENT_PNG = (() => {
  const bytes = new Uint8Array(VALID_TRANSPARENT_PNG);
  writeUint32BE(bytes, 16, 1024);
  writeUint32BE(bytes, 20, 1024);
  writeUint32BE(bytes, 29, crc32(bytes, 12, 17));
  return bytes;
})();

export function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(VALID_TRANSPARENT_PNG);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  writeUint32BE(bytes, 29, crc32(bytes, 12, 17));
  return bytes;
}

export function realPngWithSize(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  return encodePng({
    width,
    height,
    data,
    channels: 4,
    depth: 8,
  });
}

export function realRgbPngWithSize(width: number, height: number): Uint8Array {
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

export function realJpegWithSize(width: number, height: number): Uint8Array {
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

export const LEGACY_TRUNCATED_MOCK_PNG = new Uint8Array([
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

export const providerPolicy = { maxSide: 2048 } as const;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function withObjectUrlMock<T>(
  run: (spies: { readonly create: ReturnType<typeof vi.fn>; readonly revoke: ReturnType<typeof vi.fn> }) => Promise<T>,
): Promise<T> {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let nextUrl = 1;
  const create = vi.fn(() => `blob:thumb-${nextUrl++}`);
  const revoke = vi.fn();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  try {
    return await run({ create, revoke });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

export function createFakeModules(options?: {
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

export function createBridge(modules: UxpModules) {
  const assetStore = createInMemoryAssetStore();
  return {
    bridge: createPhotoshopHostBridge(modules, { assetStore }),
    assetStore,
  };
}

export function createThumbnailGenerator(modules: UxpModules) {
  return createPhotoshopThumbnailGenerator(modules, {
    logger: createNullLogger(),
  });
}

export async function resolveAssetBytes(assetStore: ReturnType<typeof createInMemoryAssetStore>, asset: { readonly storedRef?: unknown }): Promise<Uint8Array> {
  expect(asset.storedRef).toMatchObject({ kind: 'hostObject' });
  const bytes = await assetStore.resolve(asset.storedRef as StoredAssetRef);
  expect(bytes).toBeInstanceOf(ArrayBuffer);
  return new Uint8Array(bytes!);
}
