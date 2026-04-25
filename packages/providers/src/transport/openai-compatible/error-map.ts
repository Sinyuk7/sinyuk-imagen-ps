/**
 * OpenAI-compatible provider 的标准错误类型与 failure taxonomy 映射。
 *
 * 所有 provider 层错误 MUST 被收敛为以下分类之一，
 * 禁止将原始 HTTP 错误直接抛给 runtime。
 */

/** 标准 provider 错误分类。 */
export type ProviderFailureKind =
  | 'auth_failed'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'timeout'
  | 'network_error'
  | 'invalid_response'
  | 'unknown_provider_error';

/** provider 层可抛出的结构化错误。 */
export interface ProviderInvokeError extends Error {
  /** 标准错误分类。 */
  kind: ProviderFailureKind;

  /** 可选的 HTTP 状态码。 */
  statusCode?: number;

  /** 附加结构化上下文。 */
  details?: Readonly<Record<string, unknown>>;
}

function createProviderInvokeError(
  kind: ProviderFailureKind,
  message: string,
  options?: {
    statusCode?: number;
    details?: Readonly<Record<string, unknown>>;
    cause?: unknown;
  },
): ProviderInvokeError {
  const err = new Error(message, { cause: options?.cause }) as ProviderInvokeError;
  err.name = 'ProviderInvokeError';
  err.kind = kind;
  if (options?.statusCode !== undefined) {
    err.statusCode = options.statusCode;
  }
  if (options?.details !== undefined) {
    err.details = options.details;
  }
  return err;
}

/**
 * 根据 HTTP 响应状态码与异常类型映射为标准 provider 错误。
 */
export function mapHttpError(args: {
  statusCode?: number;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}): ProviderInvokeError {
  const { statusCode, message, details, cause } = args;

  if (statusCode === 401 || statusCode === 403) {
    return createProviderInvokeError('auth_failed', message, { statusCode, details, cause });
  }

  if (statusCode === 429) {
    return createProviderInvokeError('rate_limited', message, { statusCode, details, cause });
  }

  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return createProviderInvokeError('upstream_unavailable', message, { statusCode, details, cause });
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return createProviderInvokeError('upstream_unavailable', message, { statusCode, details, cause });
  }

  if (statusCode !== undefined && statusCode >= 400) {
    return createProviderInvokeError('unknown_provider_error', message, { statusCode, details, cause });
  }

  return createProviderInvokeError('unknown_provider_error', message, { details, cause });
}

/**
 * 将 fetch 异常映射为标准 provider 错误。
 */
export function mapNetworkError(cause: unknown): ProviderInvokeError {
  const message = cause instanceof Error ? cause.message : 'Network request failed.';

  if (cause instanceof Error && cause.name === 'AbortError') {
    return createProviderInvokeError('timeout', 'Request was aborted.', { cause });
  }

  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return createProviderInvokeError('timeout', 'Request timed out.', { cause });
  }

  return createProviderInvokeError('network_error', message, { cause });
}

/**
 * 将响应解析失败映射为标准 provider 错误。
 */
export function mapInvalidResponseError(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderInvokeError {
  return createProviderInvokeError('invalid_response', message, { details });
}
