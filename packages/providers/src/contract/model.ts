/**
 * Provider model 候选公共类型。
 *
 * 本文件提供 `ProviderModelInfo`，作为所有 model 候选位点的统一类型：
 * - `ProviderDescriptor.defaultModels`（implementation 自带 fallback 候选清单）
 * - `Provider.discoverModels(config)` 的返回值（implementation 的运行时 discovery）
 * - `ProviderProfile.models` 的持久化形态（refresh 写入的 discovery 缓存）
 *
 * 若 provider 接入了 repo-owned model capability catalog，可在候选上附带
 * 轻量状态字段，供 application / app surface 渲染「可选 / 已保存但未发现 /
 * 自定义未校验」语义；重型 capability 与 wire mapping 仍由独立 contract
 * 模块承载，不挂在本类型里。
 */
export type ProviderModelMatchKind = 'exact' | 'alias' | 'prefix' | 'pattern' | 'default';

/** model 在当前产品语义下的选择状态。 */
export type ProviderModelSupportStatus = 'selectable' | 'saved-undiscovered' | 'custom-unchecked';

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
}
