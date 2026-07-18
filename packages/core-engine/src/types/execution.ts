/**
 * Backend-neutral execution dispatch 边界类型。
 *
 * Core 只识别 adapter identity 与 opaque params，不解释 backend 语义。
 */

import type { Logger } from '@imagen-ps/foundation';

/** Execution dispatch 运行期上下文。 */
export interface ExecutionContext {
  /** 可选 Logger；用于 per-run 日志传播。 */
  readonly logger?: Logger;

  /** 可选取消信号；adapter 可协作响应。 */
  readonly signal?: AbortSignal;
}

/** 单次 execution dispatch 的最小引用。 */
export interface ExecutionRef {
  /** 已注册 adapter 的稳定标识符。 */
  readonly adapter: string;

  /** 透传至 adapter 的不透明参数。 */
  readonly params: Record<string, unknown>;
}

/** 单个 execution adapter 的最小契约。 */
export interface ExecutionAdapter {
  /** 当前 adapter 的稳定标识符。 */
  readonly adapter: string;

  /** 执行一次 opaque dispatch。 */
  dispatch(params: Record<string, unknown>, context?: ExecutionContext): Promise<unknown>;
}

/** Execution dispatch 的抽象路由边界。 */
export interface ExecutionDispatcher {
  /** 按 `ExecutionRef.adapter` 路由并执行一次 dispatch。 */
  dispatch(ref: ExecutionRef, context?: ExecutionContext): Promise<unknown>;
}
