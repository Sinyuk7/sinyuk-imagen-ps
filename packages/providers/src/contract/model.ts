/**
 * Provider model 候选公共类型。
 *
 * 本文件提供 `ProviderModelInfo`，作为所有 model 候选位点的统一类型：
 * - `ProviderDescriptor.defaultModels`（implementation 自带 fallback 候选清单）
 * - `Provider.discoverModels(config)` 的返回值（implementation 的运行时 discovery）
 * - `ProviderProfile.models` 的持久化形态（refresh 写入的 discovery 缓存）
 *
 * 若 provider 接入了 repo-owned model capability catalog，可在候选上附带
 * 轻量状态字段，供 application / app surface 渲染「可选 / 已保存但未发现」
 * 语义；重型 capability 与 wire mapping 仍由独立 contract
 * 模块承载，不挂在本类型里。
 */
export type ProviderModelMatchKind = 'exact' | 'alias' | 'prefix' | 'pattern' | 'default';

/** model 在当前产品语义下的选择状态。 */
export type ProviderModelSupportStatus = 'selectable' | 'saved-undiscovered';

/** catalog 证据强度，避免把未知能力误写成不支持。 */
export type SupportEvidence = 'supported' | 'unsupported' | 'unknown';

/** 当前 profile 对该 model 的运行时可用性。 */
export interface ProviderModelAvailability {
  /** 沿用现有 picker 选择状态。 */
  readonly status: ProviderModelSupportStatus;

  /** 当前不可用或未确认的原因。 */
  readonly reason?: ProviderModelAvailabilityReason;
}

/** 当前 profile 对该 model 的运行时可用性原因。 */
export type ProviderModelAvailabilityReason =
  | 'not-remotely-available'
  | 'auth-failed'
  | 'profile-misconfigured'
  | 'model-discovery-failed'
  | 'unknown';

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
  /** model 的稳定标识，等同于 provider 调用时 `request.providerOptions.model` 的值。 */
  readonly id: string;

  /** 可选的展示名，供 UI 渲染。 */
  readonly displayName?: string;

  /** 命中的本地 capability rule 标识。 */
  readonly ruleId?: string;

  /** 当前命中的 matcher 类型。 */
  readonly matchKind?: ProviderModelMatchKind;

  /** 是否允许进入正常 picker 列表。缺省视为 `true`。 */
  readonly pickerVisible?: boolean;

  /** 当前 model id 是否命中了本地 curated catalog。 */
  readonly locallySupported?: boolean;

  /** 当前运行时 discovery 是否确认该 model 可用。 */
  readonly remotelyAvailable?: boolean;

  /** 供 surface 直接渲染的选择状态。 */
  readonly supportStatus?: ProviderModelSupportStatus;

  /** 当前 profile 可用性；与理论能力分离。 */
  readonly availability?: ProviderModelAvailability;

  /** repo-owned catalog 可证明的理论能力摘要。 */
  readonly capabilities?: ProviderModelCapabilities;
}
