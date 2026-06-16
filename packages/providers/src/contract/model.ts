/**
 * Provider model 候选公共类型。
 *
 * 本文件提供 `ProviderModelInfo`，作为所有 model 候选位点的统一极简类型：
 * - `ProviderDescriptor.defaultModels`（implementation 自带 fallback 候选清单）
 * - `Provider.discoverModels(config)` 的返回值（implementation 的运行时 discovery）
 * - `ProviderProfile.models` 的持久化形态（refresh 写入的 discovery 缓存）
 *
 * 三个出现位点共用同一类型，避免再制造同义结构；本类型刻意不携带
 * `capabilities` / `metadata` / `paramSchema` / `limits` / `cost` 等"可执行 schema"
 * 字段，未来若有真实需求需通过单独 capability 引入，不得搭载到本类型上。
 */
export interface ProviderModelInfo {
  /** model 的稳定标识，等同于 provider 调用时 `request.providerOptions.model` 的值。 */
  readonly id: string;

  /** 可选的展示名，供 UI 渲染。 */
  readonly displayName?: string;
}
