import type { Asset } from '@imagen-ps/application';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import type { PlacementIntent, PhotoshopCaptureResult } from '../../shared/domain/photoshop-placement';
import { NON_UXP_RUNTIME_CAPABILITIES, type HostBridge, type LayerInfo } from '../../shared/ports/host-port';
import type { PhotoshopSimulator } from '../../simulators/photoshop/simulator';

export interface ChromeFilePicker {
  pick(): Promise<File | undefined>;
}

async function fileToHostImage(file: File): Promise<HostImageAsset> {
  const data = new Uint8Array(await file.arrayBuffer());
  const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
  const asset: Asset = {
    type: 'image',
    name: file.name,
    data,
    mimeType: file.type || 'image/png',
  };
  return createHostImageAsset(asset, {
    source: 'file',
    previewUrl,
    payloadKind: 'inline-asset',
    disposePreview: previewUrl ? () => URL.revokeObjectURL(previewUrl) : undefined,
  });
}

export function createChromeHostPort(options: {
  readonly filePicker: ChromeFilePicker;
  readonly simulator: PhotoshopSimulator;
}): HostBridge {
  return {
    capabilities: {
      ...NON_UXP_RUNTIME_CAPABILITIES,
      runtime: 'chrome-browser',
      canListLayers: true,
      canReadLayerPixels: true,
      canPickImageFile: true,
      canPersistProfiles: true,
      canPersistHistory: true,
      canPersistBinaryAssets: true,
      canRunDirectProviders: true,
    },
    async listLayers(): Promise<readonly LayerInfo[]> {
      return options.simulator.listLayers();
    },
    async pickImageFile(): Promise<HostImageAsset | undefined> {
      const file = await options.filePicker.pick();
      return file ? fileToHostImage(file) : undefined;
    },
    async captureActiveImage(): Promise<PhotoshopCaptureResult> {
      return options.simulator.captureActiveImage();
    },
    async readLayerAsAsset(layerId: number): Promise<HostImageAsset> {
      return options.simulator.readLayerAsAsset(layerId);
    },
    async readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined> {
      return options.simulator.readLayerMaskAsAsset(layerId);
    },
    async placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void> {
      await options.simulator.placeAssetOnCanvas(asset, placement);
    },
  };
}
