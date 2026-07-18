import {
  createRuntimeError,
  createValidationError,
  type Job,
  type JobAttemptMetadata,
  type JobError,
} from '@imagen-ps/core-engine';
import type { Logger } from '@imagen-ps/foundation';
import type { JobExecutionRequest } from '../generation/types.js';
import { flushJobHistoryForTerminalJob, getRuntime, getRuntimeLogger } from '../runtime.js';
import type { CommandResult } from './types.js';

/** Generic Job execution command 的输入。 */
export interface ExecuteJobInput {
  /** 已完成 admission 的 workflow 与 opaque input。 */
  readonly execution: JobExecutionRequest;

  /** 可选取消信号；不进入 Job input。 */
  readonly signal?: AbortSignal;

  /** 可选调用方 logger；不进入 Job input。 */
  readonly logger?: Logger;

  /** Job 创建后的 handoff；完成后 Core 才开始 execution side effect。 */
  readonly onJobCreated?: (job: Job) => void | Promise<void>;

  /** Retry durable history 的原始 Job identity。 */
  readonly originJobId?: string;

  /** Retry durable history 的 attempt 序号。 */
  readonly retryAttempt?: number;
}

function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<JobError>;
  return typeof candidate.category === 'string' && typeof candidate.message === 'string';
}

function toExecutionError(error: unknown): JobError {
  if (isJobError(error)) return error;
  return createRuntimeError(error instanceof Error ? error.message : 'Job execution failed.');
}

function attemptMetadata(input: ExecuteJobInput): JobAttemptMetadata | undefined {
  const hasOrigin = input.originJobId !== undefined;
  const hasAttempt = input.retryAttempt !== undefined;
  if (hasOrigin !== hasAttempt) {
    throw createValidationError('Retry execution requires both originJobId and retryAttempt.');
  }
  return hasOrigin && hasAttempt
    ? { originJobId: input.originJobId!, retryAttempt: input.retryAttempt! }
    : undefined;
}

/**
 * 创建并执行一个 admitted Job，然后只刷新 durable Job history。
 *
 * 此命令不做 backend admission、Task projection、billing 或 Provider routing。
 */
export async function executeJob(input: ExecuteJobInput): Promise<CommandResult<Job>> {
  const logger = input.logger ?? getRuntimeLogger();
  const commandLogger = logger.child({
    package: 'application',
    component: 'command',
    workflow: input.execution.workflow,
  });
  const span = commandLogger.startSpan('command.execute');

  try {
    const attempt = attemptMetadata(input);
    const job = await getRuntime().runWorkflow(
      input.execution.workflow,
      input.execution.input,
      {
        logger: commandLogger.child({ span_id: span.span_id }),
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
        ...(input.onJobCreated !== undefined ? { onJobCreated: input.onJobCreated } : {}),
        ...(attempt !== undefined ? { attempt } : {}),
      },
    );
    await flushJobHistoryForTerminalJob(job, {
      workflowName: input.execution.workflow,
      ...(input.originJobId !== undefined ? { originJobId: input.originJobId } : {}),
      ...(input.retryAttempt !== undefined ? { retryAttempt: input.retryAttempt } : {}),
    });
    span.finish();
    return { ok: true, value: job };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: toExecutionError(error) };
  }
}
