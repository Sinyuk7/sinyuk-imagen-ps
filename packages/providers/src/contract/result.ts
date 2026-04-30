import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostics } from './diagnostics.js';

/**
 * Provider result 契约。
 *
 * provider 必须把上游响应归一化为 `assets`，
 * `raw` 仅保留为调试期开口，调用方不能依赖其稳定 shape。
 *
 * 字段缺省约定：
 * - `diagnostics` / `created` / `usage` / `metadata`：上游未提供或无值时
 *   **省略字段**（不要写 `...: undefined`）。这与 TS optional 语义、
 *   `JSON.stringify` 行为一致，并避免 `undefined` 在跨包序列化边界出现歧义。
 *   调用方应使用可选链或 `in` 操作符判断。
 * - `raw`：调试可观测开口，**保留**字段，类型仍为 `unknown`，但
 *   **不属于 SemVer 稳定面**，shape 可能随 provider 内部实现演进而变化。
 *   生产代码（含 share_command、UI 主路径）只能消费 `assets`、`diagnostics`、
 *   `created`、`usage`、`metadata`；`raw` 仅供测试断言、本地调试与故障排查使用。
 */

/** 上游返回的 token 消耗统计（来自 OpenAI `ImagesResponse.usage`）。
 *
 * 字段名为 camelCase；transport 层负责 snake_case ↔ camelCase 映射。
 * 上游未返回 usage 时，整个 `ProviderInvokeResult.usage` 字段省略。
 */
export interface ProviderInvokeUsage {
  /** 输入侧 token 总数（prompt + 引用图）。 */
  readonly inputTokens: number;

  /** 输出侧 token 总数。 */
  readonly outputTokens: number;

  /** 总 token 消耗。 */
  readonly totalTokens: number;

  /** 输入 token 细分（image / text）。 */
  readonly inputTokensDetails?: {
    readonly imageTokens: number;
    readonly textTokens: number;
  };

  /** 输出 token 细分（image / text）。 */
  readonly outputTokensDetails?: {
    readonly imageTokens: number;
    readonly textTokens: number;
  };
}

/** 上游对响应参数的回声（来自 OpenAI `ImagesResponse` 顶层元数据）。
 *
 * 字段命名为 camelCase；任何字段缺省时整体省略 `metadata`。
 */
export interface ProviderInvokeMetadata {
  /** 实际采用的背景模式。 */
  readonly background?: 'transparent' | 'opaque';

  /** 实际采用的输出格式。 */
  readonly outputFormat?: 'png' | 'jpeg' | 'webp';

  /** 实际采用的质量档位（上游仅回声 `low / medium / high`）。 */
  readonly quality?: 'low' | 'medium' | 'high';

  /** 实际采用的尺寸，例如 `'1024x1024'`。 */
  readonly size?: string;
}

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

  /** 上游返回的 Unix 秒级时间戳（来自 `ImagesResponse.created`）。 */
  readonly created?: number;

  /** 上游 token 消耗统计（来自 `ImagesResponse.usage`）。 */
  readonly usage?: ProviderInvokeUsage;

  /** 上游对响应参数的回声（`background` / `output_format` / `quality` / `size`）。 */
  readonly metadata?: ProviderInvokeMetadata;
}
