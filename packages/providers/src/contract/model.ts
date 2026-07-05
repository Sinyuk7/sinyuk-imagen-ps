/** model 在本地 catalog 中的 matcher 命中类型。 */
export type ProviderModelMatchKind = 'exact' | 'alias' | 'prefix' | 'pattern' | 'default';

/** Provider 远端 discovery 返回的纯事实。 */
export interface DiscoveredModel {
  /** 远端返回且已做 transport 确定性规范化的 wire model ID。 */
  readonly id: string;
}

/** catalog 证据强度，避免把未知能力误写成不支持。 */
export type SupportEvidence = 'supported' | 'unsupported' | 'unknown';

/** repo-owned catalog 可证明的 model 能力摘要。 */
export interface ProviderModelCapabilities {
  /** 图像生成 / 编辑操作能力。 */
  readonly operations: {
    readonly textToImage: ModelOperationCapability;
    readonly imageEdit: ModelOperationCapability;
  };

  /** 图像输入能力；缺少可靠证据时保持 unknown。 */
  readonly inputImages?: {
    readonly maxCount?: number;
    readonly mask: SupportEvidence;
  };
}

/** 单个操作的能力和尺寸证据。 */
export interface ModelOperationCapability {
  readonly support: SupportEvidence;
  readonly sizePresets: readonly ('512' | '1k' | '2k' | '4k')[] | 'unknown';
  readonly reason?: ProviderModelCapabilityReason;
}

/** catalog 能力摘要原因。 */
export type ProviderModelCapabilityReason =
  | 'not-in-local-catalog'
  | 'operation-unsupported'
  | 'size-unsupported'
  | 'insufficient-catalog-evidence'
  | 'unknown';

export interface ProviderModelInfo {
  /** model 的稳定标识，等同于 provider 调用时的 wire model ID。 */
  readonly id: string;

  /** 可选的静态展示名，来自 provider descriptor 或官方 catalog。 */
  readonly displayName?: string;
}
