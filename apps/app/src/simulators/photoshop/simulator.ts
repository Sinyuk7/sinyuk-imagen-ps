import type { Asset, AssetStore, StoredAssetRef } from '@imagen-ps/application';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import type { CanonicalMaskAsset } from '../../shared/domain/mask-source';
import { encode as encodePng } from 'fast-png';
import type { PhotoshopCaptureResult, PlacementIntent } from '../../shared/domain/photoshop-placement';
import type { ProviderInputSizePolicy } from '../../shared/image/resize';
import type { LayerInfo, ReadLayerMaskAsAssetInput } from '../../shared/ports/host-port';

export type PhotoshopSimulatorScenarioId =
  | 'no-document'
  | 'empty-document'
  | 'seeded-document'
  | 'comfyui-image'
  | 'mask-capable-layer'
  | 'host-busy'
  | 'file-picker-cancelled'
  | 'place-asset-failure';

export interface PhotoshopSimulator {
  readonly scenarioId: PhotoshopSimulatorScenarioId;
  listLayers(): readonly LayerInfo[];
  captureActiveImage(policy: ProviderInputSizePolicy): Promise<PhotoshopCaptureResult>;
  readLayerAsAsset(layerId: number, policy: ProviderInputSizePolicy): Promise<HostImageAsset>;
  readLayerMaskAsAsset(input: ReadLayerMaskAsAssetInput): Promise<HostImageAsset | undefined>;
  placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void>;
}

function svgDataUrl(label: string, width: number, height: number, fill: string, alpha = false): string {
  const opacity = alpha ? '0.58' : '1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}" fill-opacity="${opacity}"/><text x="12" y="28" font-family="Arial" font-size="18" fill="#111">${label}</text></svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function storedRefToAssetPayload(ref: StoredAssetRef): Asset {
  return {
    type: 'image',
    ...(ref.name ? { name: ref.name } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    storedRef: ref,
  };
}

function dataUrlBytes(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function bytesViewBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function storedHostImageAsset(
  assetStore: AssetStore,
  asset: Asset,
  options: {
    readonly source: HostImageAsset['metadata']['source'];
    readonly previewUrl: string;
    readonly width?: number;
    readonly height?: number;
  },
): Promise<HostImageAsset> {
  const bytes =
    asset.data instanceof Uint8Array
      ? bytesViewBuffer(asset.data)
      : typeof asset.data === 'string'
        ? dataUrlBytes(asset.data)
        : new ArrayBuffer(0);
  const storedRef = await assetStore.put(bytes, {
    ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    ...(asset.name ? { name: asset.name } : {}),
  });
  return createHostImageAsset(storedRefToAssetPayload(storedRef), {
    ...options,
    payloadKind: 'host-object',
    payloadRef: storedRef.ref,
    byteSize: storedRef.byteSize,
  });
}

interface SeededSimulatorAsset {
  readonly asset: Asset;
  readonly previewUrl: string;
  readonly width: number;
  readonly height: number;
}

function seededAsset(index: number): SeededSimulatorAsset {
  const width = 240 + index * 12;
  const height = index % 2 === 0 ? 160 : 220;
  const fills = ['#f4d35e', '#0d3b66', '#ee964b', '#5f0f40', '#9a031e', '#2a9d8f', '#e9c46a', '#264653', '#8ab17d', '#f72585'];
  const fill = fills[index % fills.length]!;
  const red = Number.parseInt(fill.slice(1, 3), 16);
  const green = Number.parseInt(fill.slice(3, 5), 16);
  const blue = Number.parseInt(fill.slice(5, 7), 16);
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = index === 9 ? 148 : 255;
  }
  const data = encodePng({ width, height, data: pixels, channels: 4, depth: 8 });
  return {
    asset: { type: 'image', name: `sim-layer-${index + 1}.png`, data, mimeType: 'image/png' },
    previewUrl: svgDataUrl(`Layer ${index + 1}`, width, height, fill, index === 9),
    width,
    height,
  };
}

async function toStoredAsset(assetStore: AssetStore, seeded: SeededSimulatorAsset): Promise<HostImageAsset> {
  return storedHostImageAsset(assetStore, seeded.asset, {
    source: 'simulator',
    previewUrl: seeded.previewUrl,
    width: seeded.width,
    height: seeded.height,
  });
}

async function comfyUiImageCapture(assetStore: AssetStore): Promise<HostImageAsset> {
  const width = 256;
  const height = 160;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      data[offset] = Math.round((x / (width - 1)) * 255);
      data[offset + 1] = Math.round((y / (height - 1)) * 255);
      data[offset + 2] = 160;
    }
  }
  const bytes = encodePng({ width, height, data, channels: 3, depth: 8 });
  return storedHostImageAsset(assetStore, {
    type: 'image',
    name: 'sim-comfyui-capture.png',
    data: bytes,
    mimeType: 'image/png',
  }, {
    source: 'simulator',
    previewUrl: svgDataUrl('ComfyUI capture', width, height, '#2a9d8f'),
    width,
    height,
  });
}

export function createPhotoshopSimulator(
  assetStore: AssetStore,
  scenarioId: PhotoshopSimulatorScenarioId = 'seeded-document',
): PhotoshopSimulator {
  const assets = Array.from({ length: 10 }, (_, index) => seededAsset(index));
  const layers: readonly LayerInfo[] =
    scenarioId === 'no-document' || scenarioId === 'empty-document'
      ? []
      : assets.map((asset, index) => ({
          id: index + 1,
          name: asset.asset.name ?? `Layer ${index + 1}`,
          kind: 'pixel',
          visible: true,
          hasUserMask: scenarioId === 'mask-capable-layer' && index === 0,
          bounds: { left: 0, top: 0, right: 240 + index * 12, bottom: index % 2 === 0 ? 160 : 220 },
        }));

  return {
    scenarioId,
    listLayers(): readonly LayerInfo[] {
      if (scenarioId === 'host-busy') throw new Error('Simulator host is busy.');
      return layers;
    },
    async readLayerAsAsset(layerId, _policy): Promise<HostImageAsset> {
      if (scenarioId === 'host-busy') throw new Error('Simulator host is busy.');
      const asset = assets[layerId - 1];
      if (!asset) throw new Error(`Simulator layer not found: ${layerId}`);
      return toStoredAsset(assetStore, asset);
    },
    async captureActiveImage(_policy): Promise<PhotoshopCaptureResult> {
      if (scenarioId === 'host-busy') throw new Error('Simulator host is busy.');
      const layer = layers[0];
      const asset = assets[0];
      if (!layer || !asset || !layer.bounds) throw new Error('Simulator has no active layer to capture.');
      const image = scenarioId === 'comfyui-image'
        ? await comfyUiImageCapture(assetStore)
        : await toStoredAsset(assetStore, asset);
      return {
        image,
        sourceKind: 'layer',
        placement: {
          snapshot: {
            documentId: 42,
            documentSize: { width: 1024, height: 768 },
            layerId: layer.id,
            layerBoundsNoEffects: layer.bounds,
            selectionBounds: null,
          },
          placementRect: layer.bounds,
        },
      };
    },
    async readLayerMaskAsAsset(input): Promise<CanonicalMaskAsset | undefined> {
      if (scenarioId !== 'mask-capable-layer' || input.layerId !== 1) return undefined;
      const data = new Uint8Array(input.targetSize.width * input.targetSize.height);
      data.fill(255);
      const bytes = encodePng({
        width: input.targetSize.width,
        height: input.targetSize.height,
        data,
        channels: 1,
        depth: 8,
      });
      const mask = await storedHostImageAsset(
        assetStore,
        { type: 'image', name: 'sim-mask-1.png', data: bytes, mimeType: 'image/png' },
        { source: 'simulator', previewUrl: svgDataUrl('Mask 1', input.targetSize.width, input.targetSize.height, '#ffffff', true), width: input.targetSize.width, height: input.targetSize.height },
      );
      return {
        ...mask,
        canonicalMask: { encoding: 'grayscale', bitDepth: 8, size: input.targetSize },
      };
    },
    async placeAssetOnCanvas(_asset: Asset, placement: PlacementIntent): Promise<void> {
      if (scenarioId === 'place-asset-failure') throw new Error('Simulator place asset failed.');
      if (placement.kind === 'unbound' && placement.reason === 'multiple-documents') {
        throw new Error('Photoshop placement target is ambiguous across multiple source documents.');
      }
      if (placement.kind === 'unbound' && scenarioId === 'no-document') {
        throw new Error('Photoshop placement target requires an active Photoshop document.');
      }
    },
  };
}
