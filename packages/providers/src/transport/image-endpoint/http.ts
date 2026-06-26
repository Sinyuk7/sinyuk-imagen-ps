/**
 * Image endpoint HTTP transport 统一封装。
 *
 * 禁止在 provider 内部直接调用裸 fetch；所有请求必须通过此模块。
 */

import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { mapHttpError, mapNetworkError } from './error-map.js';
import { withRetry, defaultRetryPolicy } from './retry.js';
import type { RetryPolicy, RetryOptions } from './retry.js';
import type { Logger } from '@imagen-ps/foundation';
import { canListenToAbort } from '../../shared/abort-signal.js';

export interface HttpRequest {
  /** 完整请求 URL。 */
  readonly url: string;

  /** HTTP method。 */
  readonly method: 'GET' | 'POST';

  /** 请求 headers。 */
  readonly headers?: Readonly<Record<string, string>>;

  /** 请求 body（JSON 序列化前）或 multipart body。 */
  readonly body?: unknown;

  /** 单次请求超时毫秒。 */
  readonly timeoutMs?: number;
}

export interface HttpResponse {
  /** HTTP 状态码。 */
  readonly status: number;

  /** 响应 headers（只读）。 */
  readonly headers: Headers;

  /** 已解析的 JSON body。 */
  readonly data: unknown;
}

interface TimeoutSignalHandle {
  readonly signal: AbortSignal;
  dispose(): void;
}

function createTimeoutSignal(timeoutMs: number | undefined): TimeoutSignalHandle | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return {
      signal: AbortSignal.timeout(timeoutMs),
      dispose: () => undefined,
    };
  }

  if (typeof AbortController === 'undefined') {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    const error = new Error('Request timed out.');
    error.name = 'TimeoutError';
    controller.abort(error);
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
    },
  };
}

function mergeAbortSignals(signal: AbortSignal | undefined, timeoutSignal: AbortSignal | undefined): AbortSignal | undefined {
  if (signal !== undefined && timeoutSignal !== undefined) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      try {
        return AbortSignal.any([signal, timeoutSignal]);
      } catch {
        return timeoutSignal;
      }
    }
    return timeoutSignal;
  }

  return signal ?? timeoutSignal;
}

async function fetchOnce(args: HttpRequest, signal?: AbortSignal): Promise<HttpResponse> {
  const { url, method, headers, body, timeoutMs } = args;

  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const mergedSignal = mergeAbortSignals(signal, timeoutSignal?.signal);
  const fetchSignal = canListenToAbort(mergedSignal) ? mergedSignal : undefined;

  try {
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const isMultipartBlob =
      typeof body === 'object' &&
      body !== null &&
      (body as { kind?: unknown }).kind === 'multipart' &&
      (body as { body?: unknown }).body instanceof Blob &&
      typeof (body as { contentType?: unknown }).contentType === 'string';
    const multipartBlob = isMultipartBlob
      ? (body as { readonly body: Blob; readonly contentType: string })
      : undefined;
    const init: RequestInit = {
      method,
      headers: {
        ...(multipartBlob
          ? { 'Content-Type': multipartBlob.contentType }
          : isMultipart
            ? {}
            : { 'Content-Type': 'application/json' }),
        ...(headers ?? {}),
      },
      body:
        body !== undefined
          ? multipartBlob
            ? multipartBlob.body
            : isMultipart
              ? body
              : JSON.stringify(body)
          : undefined,
    };
    if (fetchSignal !== undefined) {
      init.signal = fetchSignal;
    }

    const response = await fetch(url, init);

    let data: unknown;
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error?: { message?: string } }).error?.message === 'string'
          ? (data as { error: { message: string } }).error.message
          : `HTTP ${response.status}: ${response.statusText}`;

      throw mapHttpError({
        statusCode: response.status,
        message,
        details: { url, method, responseBody: data },
      });
    }

    return {
      status: response.status,
      headers: response.headers,
      data,
    };
  } catch (error) {
    // 若已是我们自己的结构化错误，直接抛出
    if (
      typeof error === 'object' &&
      error !== null &&
      'kind' in error &&
      typeof (error as { kind?: string }).kind === 'string'
    ) {
      throw error;
    }

    throw mapNetworkError(error);
  } finally {
    timeoutSignal?.dispose();
  }
}

export interface HttpRequestResult {
  /** 成功响应。 */
  readonly response: HttpResponse;

  /** retry 期间收集到的结构化诊断。 */
  readonly diagnostics: readonly ProviderDiagnostic[];
}

/**
 * 执行带 retry 的 HTTP 请求。
 *
 * @param request HTTP 请求参数
 * @param policy 可选的 retry 策略（默认指数退避 3 次）
 * @param signal 可选的取消信号
 * @param logger 可选 Logger
 * @param opts 重试决策选项（`retryability` / `idempotencySupported`）；付费生成
 *   请求应传 `{ retryability: 'paid', idempotencySupported }` 以启用保守重试策略。
 */
export async function httpRequest(
  request: HttpRequest,
  policy: RetryPolicy = defaultRetryPolicy,
  signal?: AbortSignal,
  logger?: Logger,
  opts?: RetryOptions,
): Promise<HttpRequestResult> {
  const diagnostics: ProviderDiagnostic[] = [];
  const transportLogger =
    logger?.child({ package: 'providers', component: 'transport' }) ??
    logger;
  const span = transportLogger?.startSpan('transport.request');

  try {
    const response = await withRetry(
      () => fetchOnce(request, signal),
      policy,
      signal,
      (diagnostic) => {
        diagnostics.push(diagnostic);
      },
      transportLogger,
      opts,
    );

    span?.finish();
    return {
      response,
      diagnostics,
    };
  } catch (error) {
    span?.fail(error);
    throw error;
  }
}
