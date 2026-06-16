/**
 * retryJob 命令
 */

import type { Job } from '@imagen-ps/core-engine';
import { createValidationError } from '@imagen-ps/core-engine';
import { flushJobHistoryForTerminalJob, getJobHistoryStore, getRuntime } from '../runtime.js';
import type { CommandResult } from './types.js';
import { toJobError, WORKFLOW_NAME_KEY } from './submit-job.js';

interface RetrySource {
  readonly workflowName: string;
  readonly input: Record<string, unknown>;
  readonly originJobId?: string;
  readonly retryAttempt?: number;
}

/** 重试指定 job，用相同输入创建新任务 */
export async function retryJob(jobId: string): Promise<CommandResult<Job>> {
  try {
    const runtime = getRuntime();
    const originalJob = runtime.store.getJob(jobId);

    const source = originalJob
      ? sourceFromSessionJob(originalJob)
      : await sourceFromDurableRecord(jobId);

    if (!source) {
      return {
        ok: false,
        error: createValidationError(`Job "${jobId}" not found.`),
      };
    }

    if (!source.workflowName) {
      return {
        ok: false,
        error: createValidationError(`Job "${jobId}" is missing _workflowName in input, cannot retry.`),
      };
    }

    const newJob = await runtime.runWorkflow(source.workflowName, {
      ...source.input,
      [WORKFLOW_NAME_KEY]: source.workflowName,
    });
    await flushJobHistoryForTerminalJob(newJob, {
      ...(source.originJobId !== undefined ? { originJobId: source.originJobId } : {}),
      ...(source.retryAttempt !== undefined ? { retryAttempt: source.retryAttempt } : {}),
    });
    return { ok: true, value: newJob };
  } catch (error) {
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
