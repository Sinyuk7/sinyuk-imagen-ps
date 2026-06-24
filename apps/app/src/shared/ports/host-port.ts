import type { Asset } from '@imagen-ps/application';
import type { HostImageAsset } from '../domain/host-image-asset';

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

export interface RuntimeCapabilities {
  readonly runtime: 'photoshop-uxp' | 'chrome-browser';
  readonly canListLayers: boolean;
  readonly canReadLayerPixels: boolean;
  readonly canReadLayerMasks: boolean;
  readonly canPickImageFile: boolean;
  readonly canPlaceAssetOnCanvas: boolean;
  readonly canPersistProfiles: boolean;
  readonly canPersistHistory: boolean;
  readonly canPersistBinaryAssets: boolean;
  readonly canRunDirectProviders: boolean;
  readonly unsupportedReasons?: Readonly<Record<string, string>>;
}

export interface HostPort {
  readonly capabilities: RuntimeCapabilities;
  listLayers(): Promise<readonly LayerInfo[]>;
  pickImageFile(): Promise<HostImageAsset | undefined>;
  readLayerAsAsset(layerId: number): Promise<HostImageAsset>;
  readLayerMaskAsAsset(layerId: number): Promise<HostImageAsset | undefined>;
  placeAssetOnCanvas(asset: Asset): Promise<void>;
}

export type HostBridge = HostPort;

export const NON_UXP_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  runtime: 'chrome-browser',
  canListLayers: false,
  canReadLayerPixels: false,
  canReadLayerMasks: false,
  canPickImageFile: false,
  canPlaceAssetOnCanvas: false,
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
    async readLayerAsAsset(layerId: number): Promise<HostImageAsset> {
      throw new Error(`Photoshop layer read is unavailable outside UXP. layerId=${layerId}`);
    },
    async readLayerMaskAsAsset(): Promise<HostImageAsset | undefined> {
      return undefined;
    },
    async placeAssetOnCanvas(): Promise<void> {
      throw new Error('Photoshop writeback is unavailable outside UXP.');
    },
  };
}
