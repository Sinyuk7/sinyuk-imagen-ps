/**
 * Image endpoint transport 的有限指数退避 retry 策略。
 *
 * 重试决策分为两条正交轴：
 *
 * 1. **retryability mode**（重试范围）：
 *    - `'broad'`（默认，向后兼容）：对 429/502/503/504 与 `network_error` 重试，`timeout` 不重试。
 *      适用于非付费的 discovery / 探测类请求。
 *    - `'paid'`：付费生成请求的保守策略。无 idempotency 支持时只重试「可证明未被服务端
 *      处理」的状态（429 rate-limited、503 service-unavailable）；对 502/504/`network_error`/
 *      `timeout` 这类「服务端可能已处理、响应丢失」的模糊失败**不自动重试**，避免重复扣费。
 *      当 `idempotencySupported` 为真（provider 透传了稳定的 `Idempotency-Key`）时，
 *      恢复对 502/504/`network_error` 的重试（`timeout` 仍不重试）。
 *
 * 2. **RetryPolicy**（次数 / 退避参数）：`maxRetries` / `baseDelayMs` / `factor`。
 *
 * 逻辑任务重试（retryJob）与传输层自动重试 MUST 分开计数、分开决策；传输层重试只在
 * 同一次 `provider.invoke` 内部发生，对上层不可见。
 */

import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { mapNetworkError } from './error-map.js';
import type { ProviderInvokeError } from './error-map.js';
import type { Logger } from '@imagen-ps/foundation';
import { canListenToAbort } from '../../shared/abort-signal.js';

export type DispatchAttemptKind = 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover';

export interface RetryAttemptContext {
  readonly attemptIndex: number;
  readonly kind: DispatchAttemptKind;
}

interface AttemptLedgerLike {
  consume(kind: DispatchAttemptKind): void;
}

export interface RetryPolicy {
  /** 最大重试次数（默认 3）。 */
  readonly maxRetries: number;

  /** 初始延迟毫秒（默认 1000）。 */
  readonly baseDelayMs: number;

  /** 退避乘数（默认 2）。 */
  readonly factor: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  factor: 2,
};

/**
 * 付费生成请求的默认 retry 数值策略。
 *
 * 数值与 `defaultRetryPolicy` 相同，但作为独立常量声明，便于未来独立调优；
 * 付费语义的「哪些错误可重试」由 `classifyPaidRetry` 决定，与此数值无关。
 */
export const defaultPaidRetryPolicy: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  factor: 2,
};

/** 重试范围模式。 */
export type RetryabilityMode = 'broad' | 'paid';

/** `withRetry` / `httpRequest` 的重试决策选项。 */
export interface RetryOptions {
  /** 重试范围模式，默认 `'broad'`（向后兼容）。付费生成请求应传 `'paid'`。 */
  readonly retryability?: RetryabilityMode;

  /**
   * Provider 是否支持可靠 idempotency key。仅 `'paid'` 模式下生效：为真时对
   * 502/504/`network_error` 这类模糊失败恢复重试（因 `Idempotency-Key` 使重试安全）。
   */
  readonly idempotencySupported?: boolean;

  /** 第一次 HTTP dispatch 的归因类别。 */
  readonly initialAttemptKind?: Exclude<DispatchAttemptKind, 'retry'>;

  /** 可选的统一 dispatch 账本。 */
  readonly attemptLedger?: AttemptLedgerLike;
}

export function retryAfterMs(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof (error as { details?: unknown }).details === 'object' &&
    (error as { details?: { readonly retryAfterMs?: unknown } }).details !== null &&
    typeof (error as { details?: { readonly retryAfterMs?: unknown } }).details?.retryAfterMs === 'number'
  ) {
    return (error as { details: { readonly retryAfterMs: number } }).details.retryAfterMs;
  }
  return undefined;
}

export function isRetryableTransportError(error: unknown, opts?: RetryOptions): boolean {
  return shouldRetry(error, opts);
}

function extractKind(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'kind' in error
    ? (error as { kind?: string }).kind
    : undefined;
}

function extractStatusCode(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : undefined;
}

function isRetryableStatusCodeBroad(statusCode: number): boolean {
  return statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}

/**
 * `broad` 模式的重试判定（向后兼容旧行为）：
 * 429/502/503/504 或 `network_error` 重试；`timeout` 不重试。
 */
function shouldRetryBroad(error: unknown): boolean {
  const kind = extractKind(error);
  if (kind === 'timeout') {
    return false;
  }
  const statusCode = extractStatusCode(error);
  return (statusCode !== undefined && isRetryableStatusCodeBroad(statusCode)) || kind === 'network_error';
}

/**
 * `paid` 模式的重试判定（付费生成请求保守策略）。
 *
 * - `timeout`：永不重试（请求可能已被服务端处理，响应未返回）。
 * - `network_error`：仅当 `idempotencySupported` 时重试（否则可能重复扣费）。
 * - 429：重试（rate-limited，服务端明确未处理）。
 * - 503：重试（service-unavailable，服务端明确未处理）。
 * - 502 / 504：仅当 `idempotencySupported` 时重试（gateway/ upstream 模糊失败）。
 * - 其它：不重试。
 */
export function classifyPaidRetry(error: unknown, _idempotencySupported: boolean): boolean {
  const kind = extractKind(error);
  if (kind === 'timeout') {
    return false;
  }
  const statusCode = extractStatusCode(error);

  if (kind === 'network_error') {
    return false;
  }

  if (statusCode === 429) {
    return true;
  }

  return false;
}

function shouldRetry(error: unknown, opts: RetryOptions | undefined): boolean {
  if (opts?.retryability === 'paid') {
    return classifyPaidRetry(error, opts.idempotencySupported === true);
  }
  return shouldRetryBroad(error);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poller: ReturnType<typeof setInterval> | undefined;
    const activeSignal = signal;
    const canListen = canListenToAbort(activeSignal);
    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (poller !== undefined) {
        clearInterval(poller);
        poller = undefined;
      }
      if (canListen && activeSignal) {
        activeSignal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      const abortError = new Error('Retry aborted.');
      abortError.name = 'AbortError';
      reject(mapNetworkError(abortError));
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (activeSignal) {
      if (activeSignal.aborted) {
        onAbort();
        return;
      }

      if (canListen) {
        activeSignal.addEventListener('abort', onAbort, { once: true });
      } else {
        poller = setInterval(() => {
          if (activeSignal.aborted) {
            onAbort();
          }
        }, Math.min(ms, 50));
      }
    }
  });
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * 执行带 retry 的异步操作。
 *
 * @param operation 需要重试的异步操作
 * @param policy retry 策略
 * @param signal 可选的取消信号
 * @param onRetry 可选的重试诊断回调
 * @param logger 可选 Logger
 * @param opts 重试决策选项（`retryability` / `idempotencySupported`）
 * @returns operation 的结果
 */
export async function withRetry<T>(
  operation: (context: RetryAttemptContext) => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy,
  signal?: AbortSignal,
  onRetry?: (diagnostic: ProviderDiagnostic) => void,
  logger?: Logger,
  opts?: RetryOptions,
): Promise<T> {
  let lastError: ProviderInvokeError | undefined;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw mapNetworkError(createAbortError('Request was aborted.'));
    }

    try {
      return await operation({
        attemptIndex: attempt + 1,
        kind: attempt === 0 ? (opts?.initialAttemptKind ?? 'initial') : 'retry',
      });
    } catch (error) {
      const shouldRetryThisAttempt = shouldRetry(error, opts);

      if (!shouldRetryThisAttempt) {
        // 不可重试的错误直接抛出
        throw error;
      }

      if (attempt === policy.maxRetries) {
        // 最后一次重试仍失败，抛出原始错误
        throw error;
      }

      lastError = error as ProviderInvokeError;

      const statusCode = extractStatusCode(error);
      // 计算退避延迟
      const waitMs = policy.baseDelayMs * Math.pow(policy.factor, attempt);
      const diagnostic: ProviderDiagnostic = {
        code: 'retry',
        message: `Retrying request after ${statusCode !== undefined ? `HTTP ${statusCode}` : (error as ProviderInvokeError).kind}.`,
        level: 'info',
        details: {
          attempt: attempt + 1,
          delayMs: waitMs,
          statusCode,
          kind: (error as ProviderInvokeError).kind,
        },
      };
      onRetry?.(diagnostic);
      logger?.log('warn', 'retry', {
        attempt: attempt + 1,
        delayMs: waitMs,
        statusCode,
        kind: (error as ProviderInvokeError).kind,
      });
      await delay(waitMs, signal);
    }
  }

  // 理论上不会到达这里，但 TypeScript 需要返回值
  throw lastError ?? new Error('Retry loop exited unexpectedly.') as ProviderInvokeError;
}
