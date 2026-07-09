import type { Asset } from '@imagen-ps/application';
import type { HostImageAsset } from '../domain/host-image-asset';
import type { PhotoshopCaptureResult, PlacementIntent } from '../domain/photoshop-placement';
import type { ProviderInputSizePolicy } from '../image/resize';
import type { RuntimeImageUrl } from '../image/runtime-image-url';

export interface LayerInfo {
  readonly id: number;
  readonly name: string;
  readonly kind?: string;
  readonly visible?: boolean;
  readonly hasUserMask?: boolean;
  readonly bounds?: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly children?: readonly LayerInfo[];
}

export interface HostError {
  readonly code:
    | 'host-unavailable'
    | 'host-busy'
    | 'cancelled'
    | 'io-failure'
    | 'provider-browser-incompatible'
    | 'unsupported-capability'
    | 'unknown';
  readonly message: string;
  readonly cause?: unknown;
}

export type HostResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: HostError };

export interface SaveAssetToFileOptions {
  readonly suggestedName?: string;
}

export interface RuntimeCapabilities {
  readonly runtime: 'photoshop-uxp' | 'chrome-browser';
  readonly canListLayers: boolean;
  readonly canReadLayerPixels: boolean;
  readonly canReadLayerMasks: boolean;
  readonly canPickImageFile: boolean;
  readonly canPlaceAssetOnCanvas: boolean;
  readonly canSaveAssetToFile: boolean;
  readonly canGetLayerThumbnails: boolean;
  readonly canPersistProfiles: boolean;
  readonly canPersistHistory: boolean;
  readonly canPersistBinaryAssets: boolean;
  readonly canRunDirectProviders: boolean;
  readonly unsupportedReasons?: Readonly<Record<string, string>>;
}

export interface HostPort {
  readonly capabilities: RuntimeCapabilities;
  /**
   * 返回图层选择器所需的轻量树结构；bounds / mask 等重元数据允许缺省，按需读取时再向 host 查询。
   */
  listLayers(): Promise<readonly LayerInfo[]>;
  pickImageFile(policy: ProviderInputSizePolicy): Promise<HostImageAsset | undefined>;
  captureActiveImage(policy: ProviderInputSizePolicy): Promise<PhotoshopCaptureResult>;
  readLayerAsAsset(layerId: number, policy: ProviderInputSizePolicy): Promise<HostImageAsset>;
  readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined>;
  placeAssetOnCanvas(asset: Asset, placement: PlacementIntent): Promise<void>;
  saveAssetToFile(asset: Asset, options?: SaveAssetToFileOptions): Promise<void>;
  /**
   * 获取单个图层的缩略图预览。返回的 RuntimeImageUrl 需要在使用完毕后调用 release()
   * 以避免 blob/data URL 内存泄漏。不支持或无法生成时返回 undefined。
   */
  getLayerThumbnail(layerId: number, maxSide?: number): Promise<RuntimeImageUrl | undefined>;
}

export type HostBridge = HostPort;

export const NON_UXP_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  runtime: 'chrome-browser',
  canListLayers: false,
  canReadLayerPixels: false,
  canReadLayerMasks: false,
  canPickImageFile: false,
  canPlaceAssetOnCanvas: false,
  canSaveAssetToFile: false,
  canGetLayerThumbnails: false,
  canPersistProfiles: false,
  canPersistHistory: false,
  canPersistBinaryAssets: false,
  canRunDirectProviders: false,
  unsupportedReasons: {
    photoshop: 'Photoshop host APIs are unavailable in this runtime.',
  },
};

export const PHOTOSHOP_UXP_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  runtime: 'photoshop-uxp',
  canListLayers: true,
  canReadLayerPixels: true,
  canReadLayerMasks: true,
  canPickImageFile: true,
  canPlaceAssetOnCanvas: true,
  canSaveAssetToFile: true,
  canGetLayerThumbnails: true,
  canPersistProfiles: true,
  canPersistHistory: true,
  canPersistBinaryAssets: true,
  canRunDirectProviders: true,
};

/** 创建非 UXP runtime 使用的 host stub，并通过 capabilities 暴露不可用状态。 */
export function createHostBridgeStub(): HostBridge {
  return {
    capabilities: NON_UXP_RUNTIME_CAPABILITIES,
    async listLayers(): Promise<readonly LayerInfo[]> {
      return [];
    },
    async pickImageFile(): Promise<HostImageAsset | undefined> {
      return undefined;
    },
    async captureActiveImage(): Promise<PhotoshopCaptureResult> {
      throw new Error('Photoshop capture is unavailable outside UXP.');
    },
    async readLayerAsAsset(layerId: number): Promise<HostImageAsset> {
      throw new Error(`Photoshop layer read is unavailable outside UXP. layerId=${layerId}`);
    },
    async readLayerMaskAsAsset(): Promise<HostImageAsset | undefined> {
      return undefined;
    },
    async placeAssetOnCanvas(_asset: Asset, _placement: PlacementIntent): Promise<void> {
      throw new Error('Photoshop writeback is unavailable outside UXP.');
    },
    async saveAssetToFile(): Promise<void> {
      throw new Error('File save is unavailable outside supported runtimes.');
    },
    async getLayerThumbnail(): Promise<RuntimeImageUrl | undefined> {
      return undefined;
    },
  };
}
