import type { Asset } from '@imagen-ps/application';

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

export interface HostBridge {
  listLayers(): Promise<readonly LayerInfo[]>;
  pickImageFile(): Promise<Asset | undefined>;
  readLayerAsAsset(layerId: number): Promise<Asset>;
  readLayerMaskAsAsset(layerId: number): Promise<Asset | undefined>;
  placeAssetOnCanvas(asset: Asset): Promise<void>;
}

export function createHostBridgeStub(): HostBridge {
  return {
    async listLayers(): Promise<readonly LayerInfo[]> {
      return [];
    },
    async pickImageFile(): Promise<Asset | undefined> {
      return undefined;
    },
    async readLayerAsAsset(layerId: number): Promise<Asset> {
      throw new Error(`Photoshop layer read is unavailable outside UXP. layerId=${layerId}`);
    },
    async readLayerMaskAsAsset(): Promise<Asset | undefined> {
      return undefined;
    },
    async placeAssetOnCanvas(): Promise<void> {
      throw new Error('Photoshop writeback is unavailable outside UXP.');
    },
  };
}
