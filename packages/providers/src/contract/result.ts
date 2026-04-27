import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostics } from './diagnostics.js';

/**
 * Provider result 契约。
 *
 * provider 必须把上游响应归一化为 `assets`，
 * `raw` 仅保留为调试期开口，调用方不能依赖其稳定 shape。
 *
 * 字段缺省约定（关闭 OPEN_ITEMS OI-1 follow-up）：
 * - `diagnostics`：无诊断时 **省略字段**（不要写 `diagnostics: undefined`）。
 *   这与 TS optional 语义、`JSON.stringify` 行为一致，并避免 `undefined` 在
 *   跨包序列化边界出现歧义。调用方应使用 `result.diagnostics?.length ?? 0`
 *   或可选链访问。
 * - `raw`：调试可观测开口（OPEN_ITEMS providers#2 决策结果）。**保留**字段，
 *   类型仍为 `unknown`，但**不属于 SemVer 稳定面**，shape 可能随 provider 内部
 *   实现演进而变化。生产代码（含 share_command、UI 主路径）只能消费 `assets`
 *   与 `diagnostics`；`raw` 仅供测试断言、本地调试与故障排查使用。
 */

/** provider invoke 的稳定返回值。 */
export interface ProviderInvokeResult {
  /** 归一化后的输出资源。 */
  readonly assets: readonly Asset[];

  /** 非阻塞的结构化诊断。**无诊断时省略字段，不要赋值 `undefined`。** */
  readonly diagnostics?: ProviderDiagnostics;

  /**
   * 调试可观测开口（**非稳定面**）。
   *
   * shape 由各 provider 自行决定，可能随版本变化；生产代码不得依赖。
   * 仅供测试断言、本地调试、故障排查使用。
   */
  readonly raw?: unknown;
}
