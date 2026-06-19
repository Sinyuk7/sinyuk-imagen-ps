import type { Asset } from '@imagen-ps/application';
import { getRuntimeLogger } from '@imagen-ps/application';
import type { Logger } from '@imagen-ps/foundation';
import { createHostBridgeStub, type HostBridge, type LayerInfo } from '../app-services/host-bridge';
import type { UxpModules } from './uxp-api';

interface PhotoshopLayer {
  readonly id: number;
  readonly name?: string;
  readonly kind?: string;
  readonly visible?: boolean;
  readonly hasUserMask?: boolean;
  readonly layers?: readonly PhotoshopLayer[];
}

interface PhotoshopApp {
  readonly activeDocument?: {
    readonly id?: number;
    readonly layers?: readonly PhotoshopLayer[];
  };
}

interface PhotoshopImageData {
  dispose(): void;
}

interface PhotoshopImaging {
  getPixels(options: Record<string, unknown>): Promise<{ readonly imageData: PhotoshopImageData }>;
  getLayerMask?(options: Record<string, unknown>): Promise<{ readonly imageData: PhotoshopImageData }>;
  encodeImageData(options: { readonly imageData: PhotoshopImageData; readonly base64: true }): Promise<string>;
}

interface PhotoshopCore {
  executeAsModal<T>(callback: () => Promise<T>, options?: { readonly commandName?: string }): Promise<T>;
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

function toLayerInfo(layer: PhotoshopLayer): LayerInfo {
  return {
    id: layer.id,
    name: layer.name ?? `Layer ${layer.id}`,
    ...(layer.kind ? { kind: String(layer.kind) } : {}),
    ...(typeof layer.visible === 'boolean' ? { visible: layer.visible } : {}),
    ...(typeof layer.hasUserMask === 'boolean' ? { hasUserMask: layer.hasUserMask } : {}),
    ...(layer.layers ? { children: layer.layers.map(toLayerInfo) } : {}),
  };
}

async function imageDataToJpegAsset(
  imaging: PhotoshopImaging,
  imageData: PhotoshopImageData,
  name: string,
): Promise<Asset> {
  try {
    const data = await imaging.encodeImageData({ imageData, base64: true });
    return {
      type: 'image',
      name,
      data,
      mimeType: 'image/jpeg',
    };
  } finally {
    imageData.dispose();
  }
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

  return {
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

    async pickImageFile(): Promise<Asset | undefined> {
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
        const asset: Asset = {
          type: 'image',
          name: file.name ?? 'selected-image',
          data: typeof data === 'string' ? data : new Uint8Array(data),
          mimeType: 'image/png',
        };
        span.finish({ picked: true, name: asset.name });
        return asset;
      } catch (error) {
        span.fail(error);
        throw error;
      }
    },

    async readLayerAsAsset(layerId: number): Promise<Asset> {
      const span = logger.startSpan('hostbridge.read_layer', { layerId });
      try {
        const result = await imaging.getPixels({
          documentID: app.activeDocument?.id,
          layerID: layerId,
          componentSize: 8,
          applyAlpha: false,
        });
        const asset = await imageDataToJpegAsset(imaging, result.imageData, `layer-${layerId}.jpg`);
        span.finish({ layerId, name: asset.name, mimeType: asset.mimeType });
        return asset;
      } catch (error) {
        span.fail(error, { layerId });
        throw error;
      }
    },

    async readLayerMaskAsAsset(layerId: number): Promise<Asset | undefined> {
      const span = logger.startSpan('hostbridge.read_layer_mask', { layerId });
      if (!imaging.getLayerMask) {
        span.finish({ hasMask: false, reason: 'unsupported' });
        return undefined;
      }
      try {
        const result = await imaging.getLayerMask({
          documentID: app.activeDocument?.id,
          layerID: layerId,
          kind: 'user',
        });
        const asset = await imageDataToJpegAsset(imaging, result.imageData, `layer-${layerId}-mask.jpg`);
        span.finish({ layerId, hasMask: true, name: asset.name, mimeType: asset.mimeType });
        return asset;
      } catch (error) {
        span.fail(error, { layerId });
        return undefined;
      }
    },

    async placeAssetOnCanvas(asset: Asset): Promise<void> {
      const span = logger.startSpan('hostbridge.place_asset', {
        name: asset.name,
        mimeType: asset.mimeType,
      });
      try {
        const { data, mimeType } = await assetToArrayBuffer(asset);
        const folder = await fs.getTemporaryFolder();
        const file = await folder.createFile(`imagen-ps-${Date.now()}.${fileExtensionFor(mimeType)}`, {
          overwrite: true,
        });
        await file.write(data, { format: fs.formats?.binary });
        const token = fs.createSessionToken(file);

        await core.executeAsModal(
          async () => {
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
          },
          { commandName: 'Place generated image' },
        );
        span.finish({ name: asset.name, mimeType });
      } catch (error) {
        span.fail(error, { name: asset.name, mimeType: asset.mimeType });
        throw error;
      }
    },
  };
}
