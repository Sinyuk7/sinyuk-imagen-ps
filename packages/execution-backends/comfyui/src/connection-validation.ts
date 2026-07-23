/** Execution 层公开的 bounded connection validation error code。 */
export type ComfyUiConnectionValidationErrorCode =
  | 'API_UNREACHABLE'
  | 'API_INVALID_RESPONSE'
  | 'WEBVIEW_LOAD_FAILED'
  | 'BRIDGE_HANDSHAKE_TIMEOUT'
  | 'BRIDGE_CONTRACT_MISMATCH'
  | 'ABORTED';

/** Connection validation 当前执行阶段。 */
export type ComfyUiConnectionValidationPhase = 'api' | 'bridge-load' | 'bridge-handshake' | 'bridge-contract';

/** Connection validation 可安全跨 package 传播的 bounded reason。 */
export type ComfyUiConnectionValidationReason =
  | 'request-failed'
  | 'status-invalid'
  | 'body-too-large'
  | 'json-invalid'
  | 'schema-invalid'
  | 'bridge-unavailable'
  | 'load-failed'
  | 'ready-timeout'
  | 'handshake-timeout'
  | 'identity-mismatch'
  | 'protocol-mismatch'
  | 'capability-mismatch'
  | 'limits-mismatch'
  | 'contract-invalid'
  | 'aborted'
  | 'unknown';

/** Frontend Bridge resolver 内部的 bounded phase。 */
export type ComfyUiFrontendBridgeResolutionPhase = 'load' | 'ready' | 'handshake' | 'contract';

/** Frontend Bridge resolver 内部的 bounded failure reason。 */
export type ComfyUiFrontendBridgeResolutionReason =
  | 'aborted'
  | 'disposed'
  | 'load-failed'
  | 'reloaded'
  | 'stale'
  | 'timeout'
  | 'identity-mismatch'
  | 'protocol-mismatch'
  | 'capability-mismatch'
  | 'limits-mismatch'
  | 'invalid-response'
  | 'unknown';

/** Resolver 向 execution validation 暴露的 phase-specific failure。 */
export interface ComfyUiFrontendBridgeResolutionError extends Error {
  readonly name: 'ComfyUiFrontendBridgeResolutionError';
  readonly phase: ComfyUiFrontendBridgeResolutionPhase;
  readonly reason: ComfyUiFrontendBridgeResolutionReason;
}

/** Execution management host 暴露的 typed connection validation failure。 */
export interface ComfyUiConnectionValidationError extends Error {
  readonly name: 'ComfyUiConnectionValidationError';
  readonly code: ComfyUiConnectionValidationErrorCode;
  readonly phase: ComfyUiConnectionValidationPhase;
  readonly reason: ComfyUiConnectionValidationReason;
}

const RESOLUTION_PHASES: ReadonlySet<string> = new Set(['load', 'ready', 'handshake', 'contract']);
const RESOLUTION_REASONS: ReadonlySet<string> = new Set([
  'aborted',
  'disposed',
  'load-failed',
  'reloaded',
  'stale',
  'timeout',
  'identity-mismatch',
  'protocol-mismatch',
  'capability-mismatch',
  'limits-mismatch',
  'invalid-response',
  'unknown',
]);
const VALIDATION_CODES: ReadonlySet<string> = new Set([
  'API_UNREACHABLE',
  'API_INVALID_RESPONSE',
  'WEBVIEW_LOAD_FAILED',
  'BRIDGE_HANDSHAKE_TIMEOUT',
  'BRIDGE_CONTRACT_MISMATCH',
  'ABORTED',
]);
const VALIDATION_PHASES: ReadonlySet<string> = new Set(['api', 'bridge-load', 'bridge-handshake', 'bridge-contract']);
const VALIDATION_REASONS: ReadonlySet<string> = new Set([
  'request-failed',
  'status-invalid',
  'body-too-large',
  'json-invalid',
  'schema-invalid',
  'bridge-unavailable',
  'load-failed',
  'ready-timeout',
  'handshake-timeout',
  'identity-mismatch',
  'protocol-mismatch',
  'capability-mismatch',
  'limits-mismatch',
  'contract-invalid',
  'aborted',
  'unknown',
]);

/** 构造不携带 raw host error 的 Bridge resolver failure。 */
export function createComfyUiFrontendBridgeResolutionError(
  phase: ComfyUiFrontendBridgeResolutionPhase,
  reason: ComfyUiFrontendBridgeResolutionReason,
): ComfyUiFrontendBridgeResolutionError {
  const error = new Error('ComfyUI Frontend Bridge resolution failed.') as ComfyUiFrontendBridgeResolutionError;
  Object.defineProperties(error, {
    name: { value: 'ComfyUiFrontendBridgeResolutionError', enumerable: true },
    phase: { value: phase, enumerable: true },
    reason: { value: reason, enumerable: true },
  });
  return Object.freeze(error);
}

/** 判断 unknown value 是否为完整 bounded Bridge resolver failure。 */
export function isComfyUiFrontendBridgeResolutionError(value: unknown): value is ComfyUiFrontendBridgeResolutionError {
  return value instanceof Error
    && value.name === 'ComfyUiFrontendBridgeResolutionError'
    && RESOLUTION_PHASES.has(String((value as Partial<ComfyUiFrontendBridgeResolutionError>).phase))
    && RESOLUTION_REASONS.has(String((value as Partial<ComfyUiFrontendBridgeResolutionError>).reason));
}

/** 构造不携带 raw endpoint、origin 或 host payload 的 connection failure。 */
export function createComfyUiConnectionValidationError(
  code: ComfyUiConnectionValidationErrorCode,
  phase: ComfyUiConnectionValidationPhase,
  reason: ComfyUiConnectionValidationReason,
): ComfyUiConnectionValidationError {
  const error = new Error('ComfyUI connection validation failed.') as ComfyUiConnectionValidationError;
  Object.defineProperties(error, {
    name: { value: 'ComfyUiConnectionValidationError', enumerable: true },
    code: { value: code, enumerable: true },
    phase: { value: phase, enumerable: true },
    reason: { value: reason, enumerable: true },
  });
  return Object.freeze(error);
}

/** 判断 unknown value 是否为 execution connection validation failure。 */
export function isComfyUiConnectionValidationError(value: unknown): value is ComfyUiConnectionValidationError {
  return value instanceof Error
    && value.name === 'ComfyUiConnectionValidationError'
    && VALIDATION_CODES.has(String((value as Partial<ComfyUiConnectionValidationError>).code))
    && VALIDATION_PHASES.has(String((value as Partial<ComfyUiConnectionValidationError>).phase))
    && VALIDATION_REASONS.has(String((value as Partial<ComfyUiConnectionValidationError>).reason));
}
