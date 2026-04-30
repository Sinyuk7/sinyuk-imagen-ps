/**
 * OpenAI-compatible HTTP transport 统一封装。
 *
 * 禁止在 provider 内部直接调用裸 fetch；所有请求必须通过此模块。
 */

import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { mapHttpError, mapNetworkError } from './error-map.js';
import { withRetry, defaultRetryPolicy } from './retry.js';
import type { RetryPolicy } from './retry.js';

export interface HttpRequest {
  /** 完整请求 URL。 */
  readonly url: string;

  /** HTTP method。 */
  readonly method: 'GET' | 'POST';

  /** 请求 headers。 */
  readonly headers?: Readonly<Record<string, string>>;

  /** 请求 body（JSON 序列化前）。 */
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

async function fetchOnce(args: HttpRequest, signal?: AbortSignal): Promise<HttpResponse> {
  const { url, method, headers, body, timeoutMs } = args;

  const timeoutSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
  const mergedSignal =
    signal !== undefined && timeoutSignal !== undefined
      ? AbortSignal.any([signal, timeoutSignal])
      : (signal ?? timeoutSignal);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: mergedSignal,
    });

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
 */
export async function httpRequest(
  request: HttpRequest,
  policy: RetryPolicy = defaultRetryPolicy,
  signal?: AbortSignal,
): Promise<HttpRequestResult> {
  const diagnostics: ProviderDiagnostic[] = [];
  const response = await withRetry(
    () => fetchOnce(request, signal),
    policy,
    signal,
    (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  );

  return {
    response,
    diagnostics,
  };
}
