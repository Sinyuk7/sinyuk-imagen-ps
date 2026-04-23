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

/** Provider 调用的抽象边界。
 *
 *  具体实现位于 `packages/providers` 或 host adapter 中；
 *  engine 仅依赖此函数签名。
 */
export type ProviderDispatcher = (
  ref: ProviderRef,
) => Promise<unknown>;
