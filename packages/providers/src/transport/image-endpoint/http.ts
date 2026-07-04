/**
 * Image endpoint HTTP transport 统一封装。
 *
 * 禁止在 provider 内部直接调用裸 fetch；所有请求必须通过此模块。
 */

import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { mapHttpError, mapNetworkError } from './error-map.js';
import { withRetry, defaultRetryPolicy } from './retry.js';
import type { RetryPolicy, RetryOptions } from './retry.js';
import type { DispatchAttemptKind } from './retry.js';
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

type ParsedResponseKind = 'json' | 'text' | 'text-json-fallback';

interface TimeoutSignalHandle {
  readonly signal: AbortSignal;
  dispose(): void;
}

interface AttemptLedgerLike {
  consume(kind: DispatchAttemptKind): void;
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

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return undefined;
  }
  return Math.max(0, at - Date.now());
}

function mergeHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> | undefined {
  return headers ? { ...headers } : undefined;
}

function stripMultipartContentType(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'content-type') {
      next[key] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function constructorNameOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const ctor = value.constructor;
  return typeof ctor?.name === 'string' && ctor.name.length > 0 ? ctor.name : undefined;
}

function summarizeRequestBody(body: unknown): Record<string, unknown> {
  if (body === undefined) {
    return { bodyKind: 'none' };
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const fieldNames: string[] = [];
    const textFieldNames = new Set<string>();
    const fileFieldNames = new Set<string>();
    const fileFieldCounts = new Map<string, number>();

    for (const [key, value] of body.entries()) {
      fieldNames.push(key);
      if (typeof value === 'string') {
        textFieldNames.add(key);
        continue;
      }
      fileFieldNames.add(key);
      fileFieldCounts.set(key, (fileFieldCounts.get(key) ?? 0) + 1);
    }

    return {
      bodyKind: 'multipart',
      bodyConstructorName: constructorNameOf(body),
      bodyFieldNames: Array.from(new Set(fieldNames)),
      bodyTextFieldNames: Array.from(textFieldNames),
      bodyFileFieldNames: Array.from(fileFieldNames),
      bodyFileFieldCounts: Object.fromEntries(fileFieldCounts),
    };
  }

  if (Array.isArray(body)) {
    return {
      bodyKind: 'json-array',
      bodyConstructorName: constructorNameOf(body),
      bodyArrayLength: body.length,
    };
  }

  if (typeof body === 'object' && body !== null) {
    return {
      bodyKind: 'json-object',
      bodyConstructorName: constructorNameOf(body),
      bodyTopLevelKeys: Object.keys(body as Record<string, unknown>),
    };
  }

  if (typeof body === 'string') {
    return {
      bodyKind: 'text',
      bodyLength: body.length,
    };
  }

  return {
    bodyKind: typeof body,
    bodyConstructorName: constructorNameOf(body),
  };
}

function summarizeResponseBody(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) {
    return {
      responseBodyKind: 'array',
      responseBodyArrayLength: data.length,
    };
  }

  if (typeof data === 'object' && data !== null) {
    return {
      responseBodyKind: 'object',
      responseBodyTopLevelKeys: Object.keys(data as Record<string, unknown>),
    };
  }

  if (typeof data === 'string') {
    return {
      responseBodyKind: 'text',
      responseTextLength: data.length,
    };
  }

  if (data === null) {
    return { responseBodyKind: 'null' };
  }

  return { responseBodyKind: typeof data };
}

function parseUrlSummary(url: string): Record<string, unknown> {
  try {
    const parsed = new URL(url);
    return {
      targetHost: parsed.host,
      targetPath: parsed.pathname,
    };
  } catch {
    return {
      targetUrl: url,
    };
  }
}

async function fetchOnce(
  args: HttpRequest,
  signal?: AbortSignal,
  logger?: Logger,
  dispatch?: {
    readonly attemptLedger?: AttemptLedgerLike;
    readonly kind: DispatchAttemptKind;
  },
): Promise<HttpResponse> {
  const { url, method, headers, body, timeoutMs } = args;

  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const mergedSignal = mergeAbortSignals(signal, timeoutSignal?.signal);
  const fetchSignal = canListenToAbort(mergedSignal) ? mergedSignal : undefined;

  try {
    dispatch?.attemptLedger?.consume(dispatch.kind);
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const mergedHeaders = mergeHeaders(headers);
    const hadExplicitContentType =
      mergedHeaders !== undefined && Object.keys(mergedHeaders).some((key) => key.toLowerCase() === 'content-type');
    const requestHeaders = isMultipart
      ? stripMultipartContentType(mergedHeaders)
      : {
          'Content-Type': 'application/json',
          ...(mergedHeaders ?? {}),
        };
    logger?.info('transport.request_summary', {
      method,
      timeoutMs,
      headerKeys: Object.keys(requestHeaders ?? {}),
      requestContentTypeMode: isMultipart ? 'multipart-auto' : body !== undefined ? 'application/json' : 'none',
      removedExplicitContentType: isMultipart && hadExplicitContentType,
      ...parseUrlSummary(url),
      ...summarizeRequestBody(body),
    });
    const init: RequestInit = {
      method,
      headers: requestHeaders,
      body:
        body !== undefined
          ? isMultipart
            ? body
            : JSON.stringify(body)
          : undefined,
    };
    if (fetchSignal !== undefined) {
      init.signal = fetchSignal;
    }

    const response = await fetch(url, init);

    let data: unknown;
    let parsedResponseKind: ParsedResponseKind;
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
        parsedResponseKind = 'json';
      } catch {
        data = await response.text();
        parsedResponseKind = 'text-json-fallback';
      }
    } else {
      data = await response.text();
      parsedResponseKind = 'text';
    }

    logger?.info('transport.response_summary', {
      statusCode: response.status,
      ok: response.ok,
      responseContentType: contentType || 'unknown',
      parsedResponseKind,
      ...parseUrlSummary(url),
      ...summarizeResponseBody(data),
    });

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
        details: {
          url,
          method,
          responseBody: data,
          retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
        },
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
      (attempt) => fetchOnce(request, signal, transportLogger, {
        attemptLedger: opts?.attemptLedger,
        kind: attempt.kind,
      }),
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
