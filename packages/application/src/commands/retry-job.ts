/**
 * retryJob 命令
 */

import type { Job } from '@imagen-ps/core-engine';
import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { flushJobHistoryForTerminalJob, getJobHistoryStore, getRuntime, getRuntimeLogger } from '../runtime.js';
import { scheduleProfileBalanceRefresh } from './profile-billing.js';
import type { CommandResult, RetryJobInput } from './types.js';
import { toJobError, WORKFLOW_NAME_KEY, noteExactTaskCost, profileIdFromInput } from './submit-job.js';

interface RetrySource {
  readonly workflowName: string;
  readonly input: Record<string, unknown>;
  readonly originJobId?: string;
  readonly retryAttempt?: number;
}

/** 重试指定 job，用相同输入创建新任务 */
export async function retryJob(jobId: string): Promise<CommandResult<Job>>;
export async function retryJob(input: RetryJobInput): Promise<CommandResult<Job>>;
export async function retryJob(input: string | RetryJobInput): Promise<CommandResult<Job>> {
  const jobId = typeof input === 'string' ? input : input.jobId;
  const callerLogger = typeof input === 'string' ? undefined : input.logger;
  const baseLogger = callerLogger ?? getRuntimeLogger().child({ trace_id: generateTraceId() });
  const runtime = getRuntime();
  let source: RetrySource | undefined;
  try {
    const originalJob = runtime.store.getJob(jobId);
    source = originalJob
      ? sourceFromSessionJob(originalJob)
      : await sourceFromDurableRecord(jobId);
  } catch (error) {
    const span = baseLogger.child({
      package: 'application',
      component: 'command',
    }).startSpan('command.retry', { job_id: jobId });
    span.fail(error);
    return { ok: false, error: toJobError(error) };
  }

  const profileId = source ? profileIdFromInput(source.input) : undefined;
  const commandLogger = baseLogger.child({
    package: 'application',
    component: 'command',
    ...(source?.workflowName ? { workflow: source.workflowName } : {}),
    ...(profileId ? { profile_id: profileId } : {}),
  });
  const span = commandLogger.startSpan('command.retry', { job_id: jobId });

  try {
    if (!source) {
      span.fail({ message: `Job "${jobId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Job "${jobId}" not found.`),
      };
    }

    if (!source.workflowName) {
      span.fail({ message: `Job "${jobId}" is missing _workflowName in input, cannot retry.` });
      return {
        ok: false,
        error: createValidationError(`Job "${jobId}" is missing _workflowName in input, cannot retry.`),
      };
    }

    const newJob = await runtime.runWorkflow(source.workflowName, {
      ...source.input,
      [WORKFLOW_NAME_KEY]: source.workflowName,
    }, { logger: commandLogger.child({ span_id: span.span_id }) });
    await flushJobHistoryForTerminalJob(newJob, {
      ...(source.originJobId !== undefined ? { originJobId: source.originJobId } : {}),
      ...(source.retryAttempt !== undefined ? { retryAttempt: source.retryAttempt } : {}),
    });
    if (profileId && (newJob.status === 'completed' || newJob.status === 'failed')) {
      await noteExactTaskCost(newJob, profileId);
      await scheduleProfileBalanceRefresh(profileId);
    }
    span.finish();
    return { ok: true, value: newJob };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: toJobError(error) };
  }
}

function sourceFromSessionJob(job: Job): RetrySource | undefined {
  if (job.status !== 'failed') {
    throw createValidationError(
      `Cannot retry job "${job.id}" because its status is "${job.status}" (expected "failed").`,
      { id: job.id, status: job.status },
    );
  }
  return {
    workflowName: job.input[WORKFLOW_NAME_KEY] as string | undefined ?? '',
    input: job.input,
    originJobId: job.id,
    retryAttempt: (job.retryAttempt ?? 0) + 1,
  };
}

async function sourceFromDurableRecord(jobId: string): Promise<RetrySource | undefined> {
  const record = await getJobHistoryStore().get(jobId);
  if (!record) {
    return undefined;
  }
  if (record.status !== 'failed') {
    throw createValidationError(
      `Cannot retry job "${jobId}" because its status is "${record.status}" (expected "failed").`,
      { id: jobId, status: record.status },
    );
  }
  return {
    workflowName: record.workflow,
    input: record.input,
    originJobId: record.jobId,
    retryAttempt: (record.retryAttempt ?? 0) + 1,
  };
}
