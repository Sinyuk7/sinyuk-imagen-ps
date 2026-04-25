import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostics } from './diagnostics.js';

/**
 * Provider result 契约。
 *
 * provider 必须把上游响应归一化为 `assets`，
 * `raw` 仅保留为调试期开口，调用方不能依赖其稳定 shape。
 */

/** provider invoke 的稳定返回值。 */
export interface ProviderInvokeResult {
  /** 归一化后的输出资源。 */
  readonly assets: readonly Asset[];

  /** 非阻塞的结构化诊断。 */
  readonly diagnostics?: ProviderDiagnostics;

  /** 调试用途的原始响应快照。 */
  readonly raw?: unknown;
}
