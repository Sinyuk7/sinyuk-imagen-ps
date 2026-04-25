/**
 * Provider diagnostics 契约。
 *
 * 诊断信息用于观测和调试，不替代 provider result 或 engine failure taxonomy。
 */

/** 单条诊断的严重级别。 */
export type ProviderDiagnosticLevel = 'info' | 'warning' | 'error';

/** 单条结构化诊断记录。 */
export interface ProviderDiagnostic {
  /** 稳定的诊断代码。 */
  readonly code: string;

  /** 面向日志或调试的可读消息。 */
  readonly message: string;

  /** 可选的严重级别。 */
  readonly level?: ProviderDiagnosticLevel;

  /** 附加的结构化上下文。 */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** provider 调用产生的诊断集合。 */
export type ProviderDiagnostics = readonly ProviderDiagnostic[];
