import type { JobError } from '@imagen-ps/core-engine';
import { deepFreeze, isPlainRecord, utf8ByteLength } from './internal/value.js';

/** ComfyUI shared error stage。 */
export type ComfyUiErrorStage = 'prepare' | 'upload' | 'submit' | 'observe' | 'download' | 'project';

/** ComfyUI shared bounded error code。 */
export type ComfyUiErrorCode =
  | 'invalid-connection'
  | 'invalid-workflow'
  | 'prompt-no-outputs'
  | 'asset-unavailable'
  | 'upload-failed'
  | 'submission-rejected'
  | 'submission-unknown'
  | 'execution-failed'
  | 'execution-state-unknown'
  | 'history-timeout'
  | 'unsafe-output'
  | 'download-failed'
  | 'projection-failed'
  | 'bridge-incompatible';

/** Generic Retry 可使用的 bounded disposition。 */
export type ComfyUiRetryDisposition = 'same-task-new-job' | 'new-task-only';

/** Bridge 返回的安全 bounded error code。 */
export type ComfyUiBridgeErrorCode =
  | 'bridge-incompatible'
  | 'identity-mismatch'
  | 'invalid-request'
  | 'invalid-workflow'
  | 'limit-exceeded'
  | 'submission-rejected'
  | 'submission-unknown'
  | 'unsupported-command';

/** 可展示的 ComfyUI 节点执行摘要；不包含 traceback、路径或原始响应。 */
export interface ComfyUiExecutionFailure {
  readonly nodeId?: string;
  readonly nodeType?: string;
  readonly message?: string;
}

/** ComfyUI error 中唯一允许进入 Job/Task 的 details。 */
export interface ComfyUiExecutionErrorDetails {
  readonly [key: string]: unknown;
  readonly stage: ComfyUiErrorStage;
  readonly code: ComfyUiErrorCode;
  readonly messageKey: string;
  readonly remoteMayContinue: boolean;
  readonly retryDisposition: ComfyUiRetryDisposition;
  readonly bridgeCode?: ComfyUiBridgeErrorCode;
  readonly executionError?: ComfyUiExecutionFailure;
}

/** Core 可保留的 structured ComfyUI `JobError`。 */
export interface ComfyUiExecutionError extends JobError {
  readonly category: 'execution';
  readonly message: 'ComfyUI execution failed.';
  readonly details: ComfyUiExecutionErrorDetails;
}

const STAGES: ReadonlySet<string> = new Set(['prepare', 'upload', 'submit', 'observe', 'download', 'project']);
const CODES: ReadonlySet<string> = new Set([
  'invalid-connection',
  'invalid-workflow',
  'prompt-no-outputs',
  'asset-unavailable',
  'upload-failed',
  'submission-rejected',
  'submission-unknown',
  'execution-failed',
  'execution-state-unknown',
  'history-timeout',
  'unsafe-output',
  'download-failed',
  'projection-failed',
  'bridge-incompatible',
]);
const BRIDGE_CODES: ReadonlySet<string> = new Set([
  'bridge-incompatible',
  'identity-mismatch',
  'invalid-request',
  'invalid-workflow',
  'limit-exceeded',
  'submission-rejected',
  'submission-unknown',
  'unsupported-command',
]);
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NODE_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_. -]{0,127}$/;
const UNSAFE_EXECUTION_MESSAGE_PATTERN = /(?:https?|file):\/\/|(?:^|[\s("' ])(?:\/|~\/|[A-Za-z]:[\\/])|\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/i;

/** 将远端 History 的失败摘要限制为可持久化、可展示的安全字段。 */
export function normalizeComfyUiExecutionFailure(value: unknown): ComfyUiExecutionFailure | undefined {
  if (!isPlainRecord(value) || Object.keys(value).some((key) => !['nodeId', 'nodeType', 'message'].includes(key))) return undefined;
  const nodeId = typeof value.nodeId === 'string' && NODE_ID_PATTERN.test(value.nodeId) ? value.nodeId : undefined;
  const nodeType = typeof value.nodeType === 'string' && NODE_TYPE_PATTERN.test(value.nodeType) ? value.nodeType : undefined;
  const message = typeof value.message === 'string'
    && value.message.trim().length > 0
    && utf8ByteLength(value.message) <= 512
    && !/[\u0000-\u001f\u007f]/.test(value.message)
    && !UNSAFE_EXECUTION_MESSAGE_PATTERN.test(value.message)
    ? value.message.trim()
    : undefined;
  return nodeId === undefined && nodeType === undefined && message === undefined
    ? undefined
    : { ...(nodeId === undefined ? {} : { nodeId }), ...(nodeType === undefined ? {} : { nodeType }), ...(message === undefined ? {} : { message }) };
}

/** 构造不含 raw transport facts 的 structured execution error。 */
export function createComfyUiExecutionError(
  stage: ComfyUiErrorStage,
  code: ComfyUiErrorCode,
  options: { readonly remoteMayContinue?: boolean; readonly bridgeCode?: ComfyUiBridgeErrorCode; readonly executionError?: ComfyUiExecutionFailure } = {},
): ComfyUiExecutionError {
  const remoteMayContinue = options.remoteMayContinue ?? false;
  const executionError = code === 'execution-failed'
    ? normalizeComfyUiExecutionFailure(options.executionError)
    : undefined;
  return deepFreeze({
    category: 'execution' as const,
    message: 'ComfyUI execution failed.' as const,
    details: {
      stage,
      code,
      messageKey: `comfyui.${stage}.${code}`,
      remoteMayContinue,
      retryDisposition: stage === 'prepare' || stage === 'upload'
        ? 'same-task-new-job' as const
        : 'new-task-only' as const,
      ...(options.bridgeCode === undefined ? {} : { bridgeCode: options.bridgeCode }),
      ...(executionError === undefined ? {} : { executionError }),
    },
  });
}

/** 判断 unknown value 是否为完整 bounded ComfyUI execution error。 */
export function isComfyUiExecutionError(value: unknown): value is ComfyUiExecutionError {
  if (!isPlainRecord(value) || value.category !== 'execution' || value.message !== 'ComfyUI execution failed.') return false;
  const details = value.details;
  if (!isPlainRecord(details)) return false;
  return STAGES.has(String(details.stage))
    && CODES.has(String(details.code))
    && details.messageKey === `comfyui.${String(details.stage)}.${String(details.code)}`
    && typeof details.remoteMayContinue === 'boolean'
    && (details.retryDisposition === 'same-task-new-job' || details.retryDisposition === 'new-task-only')
    && (details.bridgeCode === undefined || BRIDGE_CODES.has(String(details.bridgeCode)))
    && (details.executionError === undefined || (details.code === 'execution-failed' && normalizeComfyUiExecutionFailure(details.executionError) !== undefined))
    && Object.keys(details).every((key) => ['stage', 'code', 'messageKey', 'remoteMayContinue', 'retryDisposition', 'bridgeCode', 'executionError'].includes(key));
}

/** Unknown failures 映射为当前 stage 的安全 bounded error。 */
export function normalizeComfyUiExecutionError(
  error: unknown,
  context: {
    readonly stage: ComfyUiErrorStage;
    readonly code: ComfyUiErrorCode;
    readonly remoteMayContinue?: boolean;
  },
): ComfyUiExecutionError {
  if (isComfyUiExecutionError(error)) return deepFreeze({ ...error, details: { ...error.details } });
  return createComfyUiExecutionError(context.stage, context.code, {
    remoteMayContinue: context.remoteMayContinue,
  });
}
