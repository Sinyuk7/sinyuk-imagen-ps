import type { Asset } from '@imagen-ps/application';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import type { PhotoshopCaptureResult, PlacementIntent } from '../../shared/domain/photoshop-placement';
import type { LayerInfo } from '../../shared/ports/host-port';

export type PhotoshopSimulatorScenarioId =
  | 'no-document'
  | 'empty-document'
  | 'seeded-document'
  | 'mask-capable-layer'
  | 'host-busy'
  | 'file-picker-cancelled'
  | 'place-asset-failure';

export interface PhotoshopSimulator {
  readonly scenarioId: PhotoshopSimulatorScenarioId;
  listLayers(): readonly LayerInfo[];
  captureActiveImage(): Promise<PhotoshopCaptureResult>;
  readLayerAsAsset(layerId: number): Promise<HostImageAsset>;
  readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined>;
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

function seededAsset(index: number): HostImageAsset {
  const width = 240 + index * 12;
  const height = index % 2 === 0 ? 160 : 220;
  const fills = ['#f4d35e', '#0d3b66', '#ee964b', '#5f0f40', '#9a031e', '#2a9d8f', '#e9c46a', '#264653', '#8ab17d', '#f72585'];
  const data = svgDataUrl(`Layer ${index + 1}`, width, height, fills[index % fills.length]!, index === 9);
  return createHostImageAsset(
    { type: 'image', name: `sim-layer-${index + 1}.svg`, data, mimeType: 'image/svg+xml' },
    { source: 'simulator', previewUrl: data },
  );
}

export function createPhotoshopSimulator(scenarioId: PhotoshopSimulatorScenarioId = 'seeded-document'): PhotoshopSimulator {
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
    async readLayerAsAsset(layerId): Promise<HostImageAsset> {
      if (scenarioId === 'host-busy') throw new Error('Simulator host is busy.');
      const asset = assets[layerId - 1];
      if (!asset) throw new Error(`Simulator layer not found: ${layerId}`);
      return asset;
    },
    async captureActiveImage(): Promise<PhotoshopCaptureResult> {
      if (scenarioId === 'host-busy') throw new Error('Simulator host is busy.');
      const layer = layers[0];
      const image = assets[0];
      if (!layer || !image || !layer.bounds) throw new Error('Simulator has no active layer to capture.');
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
    async readLayerMaskAsAsset(layerId): Promise<HostImageAsset | undefined> {
      if (scenarioId !== 'mask-capable-layer' || layerId !== 1) return undefined;
      const data = svgDataUrl('Mask 1', 160, 160, '#ffffff', true);
      return createHostImageAsset({ type: 'image', name: 'sim-mask-1.svg', data, mimeType: 'image/svg+xml' }, { source: 'simulator', previewUrl: data });
    },
    async placeAssetOnCanvas(_asset: Asset, placement: PlacementIntent): Promise<void> {
      if (scenarioId === 'place-asset-failure') throw new Error('Simulator place asset failed.');
      if (placement.kind === 'unbound') throw new Error('Photoshop placement target is ambiguous.');
    },
  };
}
