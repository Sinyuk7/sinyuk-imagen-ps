/**
 * OpenAI-compatible transport 的有限指数退避 retry 策略。
 *
 * 仅对以下情况触发重试：
 * - 网络错误（fetch 抛异常）
 * - HTTP 429
 * - HTTP 502 / 503 / 504
 *
 * 策略参数：最多 3 次，指数退避，支持 AbortSignal。
 */

import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { mapNetworkError } from './error-map.js';
import type { ProviderInvokeError } from './error-map.js';

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

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
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

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
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
 * @returns operation 的结果
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy,
  signal?: AbortSignal,
  onRetry?: (diagnostic: ProviderDiagnostic) => void,
): Promise<T> {
  let lastError: ProviderInvokeError | undefined;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw mapNetworkError(createAbortError('Request was aborted.'));
    }

    try {
      return await operation();
    } catch (error) {
      // 判断是否为 ProviderInvokeError 且带有 statusCode
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : undefined;

      const isNetworkError =
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        (error as { kind?: string }).kind === 'network_error';

      const isTimeoutError =
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        (error as { kind?: string }).kind === 'timeout';

      const shouldRetry =
        !isTimeoutError &&
        ((statusCode !== undefined && isRetryableStatusCode(statusCode)) || isNetworkError);

      if (!shouldRetry) {
        // 不可重试的 HTTP 错误直接抛出
        throw error;
      }

      if (attempt === policy.maxRetries) {
        // 最后一次重试仍失败，抛出原始错误
        throw error;
      }

      lastError = error as ProviderInvokeError;

      // 计算退避延迟
      const waitMs = policy.baseDelayMs * Math.pow(policy.factor, attempt);
      onRetry?.({
        code: 'retry',
        message: `Retrying request after ${statusCode !== undefined ? `HTTP ${statusCode}` : (error as ProviderInvokeError).kind}.`,
        level: 'info',
        details: {
          attempt: attempt + 1,
          delayMs: waitMs,
          statusCode,
          kind: (error as ProviderInvokeError).kind,
        },
      });
      await delay(waitMs, signal);
    }
  }

  // 理论上不会到达这里，但 TypeScript 需要返回值
  throw lastError ?? new Error('Retry loop exited unexpectedly.') as ProviderInvokeError;
}
