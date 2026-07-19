import type { JobError } from '@imagen-ps/core-engine';
import { deepFreeze, isPlainRecord } from './internal/value.js';

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

/** ComfyUI error 中唯一允许进入 Job/Task 的 details。 */
export interface ComfyUiExecutionErrorDetails {
  readonly [key: string]: unknown;
  readonly stage: ComfyUiErrorStage;
  readonly code: ComfyUiErrorCode;
  readonly messageKey: string;
  readonly remoteMayContinue: boolean;
  readonly retryDisposition: ComfyUiRetryDisposition;
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

/** 构造不含 raw transport facts 的 structured execution error。 */
export function createComfyUiExecutionError(
  stage: ComfyUiErrorStage,
  code: ComfyUiErrorCode,
  options: { readonly remoteMayContinue?: boolean } = {},
): ComfyUiExecutionError {
  const remoteMayContinue = options.remoteMayContinue ?? false;
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
    && Object.keys(details).every((key) => ['stage', 'code', 'messageKey', 'remoteMayContinue', 'retryDisposition'].includes(key));
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
