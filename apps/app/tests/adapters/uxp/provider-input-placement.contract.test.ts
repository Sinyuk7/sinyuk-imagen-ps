import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@imagen-ps/application';
import { createInMemoryAssetStore } from '../../../src/adapters/uxp/in-memory-host-storage';
import { createPhotoshopHostBridge } from '../../../src/adapters/uxp/photoshop-host-bridge';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';
import { derivePlacementIntent, type ConversationAttachment } from '../../../src/shared/ui/hooks/use-conversation';
import type { ImageSize, ProviderInputPlan } from '../../../src/shared/image/resize';
import { createNullLogger } from '@imagen-ps/foundation';

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

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000) +
    (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
}

function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(VALID_TRANSPARENT_PNG);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  writeUint32BE(bytes, 29, crc32(bytes, 12, 17));
  return bytes;
}

function pngSize(bytes: Uint8Array): ImageSize {
  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
  };
}

function sameRatio(a: ImageSize, b: ImageSize): boolean {
  return BigInt(a.width) * BigInt(b.height) === BigInt(a.height) * BigInt(b.width);
}

function exactRatioMessage(a: ImageSize, b: ImageSize): string {
  return `${a.width}x${a.height} must preserve ${b.width}x${b.height}`;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createFakeModules(source: ImageSize): {
  readonly modules: UxpModules;
  readonly spies: {
    readonly writeTempFile: ReturnType<typeof vi.fn>;
    readonly scalePlacedLayer: ReturnType<typeof vi.fn>;
    readonly translatePlacedLayer: ReturnType<typeof vi.fn>;
  };
} {
  const writeTempFile = vi.fn(async () => undefined);
  const scalePlacedLayer = vi.fn(async () => undefined);
  const translatePlacedLayer = vi.fn(async () => undefined);
  const deleteTempFile = vi.fn(async () => undefined);
  const activeLayerBounds = { _left: 0, _top: 0, _right: source.width, _bottom: source.height };

  const createLayerImageData = (width = source.width, height = source.height) => {
    const data = new Uint8Array(width * height * 4);
    data.fill(255);
    return {
      width,
      height,
      colorSpace: 'RGB',
      components: 4,
      pixelFormat: 'RGBA',
      getData: vi.fn(async () => data),
      dispose: vi.fn(),
    };
  };

  const layer = {
    id: 2,
    name: 'Source',
    kind: 'pixel',
    visible: true,
    bounds: activeLayerBounds,
    boundsNoEffects: activeLayerBounds,
    scale: scalePlacedLayer,
    translate: translatePlacedLayer,
  };

  return {
    modules: {
      photoshop: {
        app: {
          activeDocument: {
            id: 42,
            name: 'source.psd',
            width: Math.max(source.width, 4096),
            height: Math.max(source.height, 4096),
            selection: { bounds: null },
            activeLayers: [layer],
            layers: [layer],
          },
        },
        imaging: {
          getPixels: vi.fn(async (request?: { readonly targetSize?: { readonly width?: number; readonly height?: number } }) => ({
            imageData: createLayerImageData(request?.targetSize?.width, request?.targetSize?.height),
          })),
          encodeImageData: vi.fn(async () => 'unused'),
        },
        core: {
          executeAsModal: vi.fn(async (callback: () => Promise<unknown>) => callback()),
          isModal: vi.fn(() => false),
          setExecutionMode: vi.fn(),
        },
        action: {
          batchPlay: vi.fn(async () => undefined),
        },
      },
      uxp: {
        storage: {
          formats: { binary: 'binary' },
          localFileSystem: {
            async getTemporaryFolder() {
              return {
                async createFile() {
                  return {
                    name: 'temp-image.png',
                    write: writeTempFile,
                    delete: deleteTempFile,
                  };
                },
              };
            },
            createSessionToken: vi.fn(() => 'session-token-1'),
          },
        },
      },
    },
    spies: {
      writeTempFile,
      scalePlacedLayer,
      translatePlacedLayer,
    },
  };
}

async function runRoundTrip(source: ImageSize, maxSide: number): Promise<{
  readonly providerInputPlan: ProviderInputPlan;
  readonly placementKind: string;
  readonly providerOutputSize: ImageSize;
  readonly tempWriteSize: ImageSize;
  readonly scalePlacedLayer: ReturnType<typeof vi.fn>;
  readonly translatePlacedLayer: ReturnType<typeof vi.fn>;
}> {
  const { modules, spies } = createFakeModules(source);
  const assetStore = createInMemoryAssetStore();
  const bridge = createPhotoshopHostBridge(modules, { assetStore, logger: createNullLogger() });
  const capture = await bridge.captureActiveImage({ maxSide });
  const providerInputPlan = capture.placement.providerInputPlan;
  if (!providerInputPlan) {
    throw new Error('Expected capture to include provider input plan.');
  }

  const attachment: ConversationAttachment = {
    id: 'capture-1',
    type: 'photoshop-capture',
    name: capture.image.asset.name ?? 'capture.png',
    image: capture.image,
    previewUrl: capture.image.preview.url ?? '',
    photoshopPlacement: capture.placement,
  };
  const placement = derivePlacementIntent([attachment]);
  const providerOutputSize = {
    width: providerInputPlan.targetWidth,
    height: providerInputPlan.targetHeight,
  };
  const providerOutput: Asset = {
    type: 'image',
    name: 'provider-output.png',
    mimeType: 'image/png',
    data: pngWithSize(providerOutputSize.width, providerOutputSize.height),
  };

  await bridge.placeAssetOnCanvas(providerOutput, placement);
  const tempWrite = spies.writeTempFile.mock.calls[0]?.[0];
  if (!(tempWrite instanceof ArrayBuffer)) {
    throw new Error('Expected Photoshop placement to write an ArrayBuffer temp file.');
  }

  return {
    providerInputPlan,
    placementKind: placement.kind,
    providerOutputSize,
    tempWriteSize: pngSize(new Uint8Array(tempWrite)),
    scalePlacedLayer: spies.scalePlacedLayer,
    translatePlacedLayer: spies.translatePlacedLayer,
  };
}

describe('provider input placement contract', () => {
  it.each([
    { label: 'incident arbitrary ratio', source: { width: 345, height: 321 }, maxSide: 1024 },
    { label: 'over-bucket reducible ratio', source: { width: 10000, height: 6000 }, maxSide: 2048 },
    { label: 'over-bucket coprime ratio', source: { width: 4096, height: 1537 }, maxSide: 2048 },
    { label: 'under-bucket non-square ratio', source: { width: 317, height: 113 }, maxSide: 1024 },
  ])('preserves exact source ratio through mock edit writeback: $label', async ({ source, maxSide }) => {
    const result = await runRoundTrip(source, maxSide);
    const providerInputSize = {
      width: result.providerInputPlan.targetWidth,
      height: result.providerInputPlan.targetHeight,
    };

    expect(result.providerInputPlan.fit).toBe('preserve-ratio');
    expect(sameRatio(providerInputSize, source), exactRatioMessage(providerInputSize, source)).toBe(true);
    expect(sameRatio(result.providerOutputSize, source), exactRatioMessage(result.providerOutputSize, source)).toBe(true);
    expect(sameRatio(result.tempWriteSize, source), exactRatioMessage(result.tempWriteSize, source)).toBe(true);
    expect(result.placementKind).toBe('exact-frame');
    expect(result.scalePlacedLayer).toHaveBeenCalledTimes(1);
    expect(result.translatePlacedLayer).toHaveBeenCalledTimes(1);
  });
});
