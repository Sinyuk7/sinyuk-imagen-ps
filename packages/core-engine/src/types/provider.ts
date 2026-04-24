/**
 * Provider dispatch 边界类型。
 *
 * 故意保持抽象 —— core-engine 不感知 provider 参数语义与 HTTP 细节。
 */

/** Provider 调用的最小引用。 */
export interface ProviderRef {
  /** Provider 标识符（如 `"openai-compatible"`、`"mock"`）。 */
  readonly provider: string;

  /** 透传至 provider 层的不透明参数。 */
  readonly params: Record<string, unknown>;
}

/** 单个 provider adapter 的最小契约。 */
export interface ProviderDispatchAdapter {
  /** 当前 adapter 所属的 provider 标识符。 */
  readonly provider: string;

  /**
   * 执行一次 provider 调用。
   *
   * `params` 的具体语义由 provider 层拥有，engine 仅做透传。
   */
  dispatch(params: Record<string, unknown>): Promise<unknown>;
}

/** Provider 调用的抽象边界。 */
export interface ProviderDispatcher {
  /**
   * 根据 `ProviderRef` 路由到对应 adapter 并执行。
   *
   * engine 仅依赖这个 runtime contract，不感知 provider registry 或 transport 细节。
   */
  dispatch(ref: ProviderRef): Promise<unknown>;
}
