/**
 * Image endpoint provider 的标准错误类型与 failure taxonomy 映射。
 *
 * 所有 provider 层错误 MUST 被收敛为以下分类之一，
 * 禁止将原始 HTTP 错误直接抛给 runtime。
 */

/** 标准 provider 错误分类。 */
export type ProviderFailureKind =
  | 'auth_failed'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'provider_protocol_incompatible'
  | 'timeout'
  | 'network_error'
  | 'request_invalid'
  | 'invalid_response'
  | 'unknown_provider_error';

export interface RecoveryEvidence {
  readonly source:
    | 'http_status'
    | 'response_header'
    | 'structured_error_code'
    | 'transport_signal'
    | 'body_pattern';
  readonly value?: string;
  readonly ruleId?: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

export interface RecoveryDisposition {
  readonly executionState:
    | 'rejected_before_execution'
    | 'possibly_executed'
    | 'confirmed_completed'
    | 'unknown';
  readonly wireRejection?: {
    readonly kind:
      | 'unsupported_request_content'
      | 'unsupported_media_type'
      | 'semantic_invalid'
      | 'unknown';
    readonly implicatedDimension?: 'body_kind' | 'content_type' | 'image_field' | 'image_reference' | 'unknown';
    readonly detail?: string;
  };
  readonly evidence: readonly RecoveryEvidence[];
}

/** provider 层可抛出的结构化错误。 */
export interface ProviderInvokeError extends Error {
  /** 标准错误分类。 */
  kind: ProviderFailureKind;

  /** 可选的 HTTP 状态码。 */
  statusCode?: number;

  /** 附加结构化上下文。 */
  details?: Readonly<Record<string, unknown>>;

  /** 恢复决策前的失败事实。 */
  recovery?: RecoveryDisposition;
}

function createProviderInvokeError(
  kind: ProviderFailureKind,
  message: string,
  options?: {
    statusCode?: number;
    details?: Readonly<Record<string, unknown>>;
    recovery?: RecoveryDisposition;
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
  if (options?.recovery !== undefined) {
    err.recovery = options.recovery;
  }
  return err;
}

const QWEN_EDIT_PROTOCOL_INCOMPATIBLE_MESSAGE =
  'expected io.Reader for image edits mode, got *ali.AliImageRequest';

function isProviderProtocolIncompatible(statusCode: number | undefined, message: string): boolean {
  return statusCode === 500 && message.includes(QWEN_EDIT_PROTOCOL_INCOMPATIBLE_MESSAGE);
}

function httpStatusEvidence(
  value: string,
  confidence: RecoveryEvidence['confidence'],
): readonly RecoveryEvidence[] {
  return [{ source: 'http_status', value, confidence }];
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

  if (isProviderProtocolIncompatible(statusCode, message)) {
    return createProviderInvokeError('provider_protocol_incompatible', message, {
      statusCode,
      details: {
        ...(details ?? {}),
        retryable: false,
        suggestedTransport: 'qwen-native-json',
      },
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence('5xx', 'high'),
      },
      cause,
    });
  }

  if (statusCode === 401 || statusCode === 403) {
    return createProviderInvokeError('auth_failed', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence(String(statusCode), 'high'),
      },
      cause,
    });
  }

  if (statusCode === 429) {
    return createProviderInvokeError('rate_limited', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'rejected_before_execution',
        evidence: httpStatusEvidence('429', 'high'),
      },
      cause,
    });
  }

  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return createProviderInvokeError('upstream_unavailable', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence('5xx', 'high'),
      },
      cause,
    });
  }

  if (statusCode === 415) {
    return createProviderInvokeError('request_invalid', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'rejected_before_execution',
        wireRejection: {
          kind: 'unsupported_request_content',
          implicatedDimension: 'unknown',
        },
        evidence: httpStatusEvidence('415', 'high'),
      },
      cause,
    });
  }

  if (statusCode === 422) {
    return createProviderInvokeError('request_invalid', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        wireRejection: {
          kind: 'semantic_invalid',
        },
        evidence: httpStatusEvidence('422', 'medium'),
      },
      cause,
    });
  }

  if (statusCode === 400) {
    return createProviderInvokeError('request_invalid', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence('400', 'low'),
      },
      cause,
    });
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return createProviderInvokeError('upstream_unavailable', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence('5xx', 'high'),
      },
      cause,
    });
  }

  if (statusCode !== undefined && statusCode >= 400) {
    return createProviderInvokeError('unknown_provider_error', message, {
      statusCode,
      details,
      recovery: {
        executionState: 'unknown',
        evidence: httpStatusEvidence(String(statusCode), 'low'),
      },
      cause,
    });
  }

  return createProviderInvokeError('unknown_provider_error', message, {
    details,
    recovery: {
      executionState: 'unknown',
      evidence: [],
    },
    cause,
  });
}

/**
 * 将 fetch 异常映射为标准 provider 错误。
 */
export function mapNetworkError(cause: unknown): ProviderInvokeError {
  const message = cause instanceof Error ? cause.message : 'Network request failed.';

  if (cause instanceof Error && cause.name === 'AbortError') {
    return createProviderInvokeError('timeout', 'Request was aborted.', {
      recovery: {
        executionState: 'unknown',
        evidence: [{ source: 'transport_signal', value: 'abort', confidence: 'high' }],
      },
      cause,
    });
  }

  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return createProviderInvokeError('timeout', 'Request timed out.', {
      recovery: {
        executionState: 'unknown',
        evidence: [{ source: 'transport_signal', value: 'timeout', confidence: 'high' }],
      },
      cause,
    });
  }

  return createProviderInvokeError('network_error', message, {
    recovery: {
      executionState: 'unknown',
      evidence: [{ source: 'transport_signal', value: 'network_error', confidence: 'high' }],
    },
    cause,
  });
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
