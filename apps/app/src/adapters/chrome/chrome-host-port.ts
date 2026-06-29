import type { Asset } from '@imagen-ps/application';
import { createHostImageAsset, type HostImageAsset } from '../../shared/domain/host-image-asset';
import type { PlacementIntent, PhotoshopCaptureResult } from '../../shared/domain/photoshop-placement';
import { resolveProviderInputPlan, type ProviderInputSizePolicy } from '../../shared/image/resize';
import { NON_UXP_RUNTIME_CAPABILITIES, type HostBridge, type LayerInfo } from '../../shared/ports/host-port';
import type { PhotoshopSimulator } from '../../simulators/photoshop/simulator';

export interface ChromeFilePicker {
  pick(): Promise<File | undefined>;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0;
}

function readPngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (bytes.byteLength < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
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
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'VP8X') {
    return undefined;
  }
  return {
    width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
    height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
  };
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

function ensureFileMatchesProviderInputPolicy(bytes: Uint8Array, mimeType: string, policy: ProviderInputSizePolicy): void {
  const size = readImageSize(bytes, mimeType);
  if (!size) {
    throw new Error(`Cannot inspect local image dimensions for provider input: ${mimeType}.`);
  }
  const plan = resolveProviderInputPlan(size, policy);
  if (plan.wasResized) {
    throw new Error(
      `Local image requires provider input normalization from ${plan.sourceWidth}x${plan.sourceHeight} to ${plan.targetWidth}x${plan.targetHeight}, ` +
        'but this runtime has no verified local file derivative path. Use Photoshop Capture or Choose Layer for normalized provider input.',
    );
  }
}

async function fileToHostImage(file: File, policy: ProviderInputSizePolicy): Promise<HostImageAsset> {
  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || 'image/png';
  ensureFileMatchesProviderInputPolicy(data, mimeType, policy);
  const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
  const asset: Asset = {
    type: 'image',
    name: file.name,
    data,
    mimeType,
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
    async pickImageFile(policy: ProviderInputSizePolicy): Promise<HostImageAsset | undefined> {
      const file = await options.filePicker.pick();
      return file ? fileToHostImage(file, policy) : undefined;
    },
    async captureActiveImage(policy: ProviderInputSizePolicy): Promise<PhotoshopCaptureResult> {
      return options.simulator.captureActiveImage(policy);
    },
    async readLayerAsAsset(layerId: number, policy: ProviderInputSizePolicy): Promise<HostImageAsset> {
      return options.simulator.readLayerAsAsset(layerId, policy);
    },
    async readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined> {
      return options.simulator.readLayerMaskAsAsset(layerId);
    },
    async placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void> {
      await options.simulator.placeAssetOnCanvas(asset, placement);
    },
  };
}
