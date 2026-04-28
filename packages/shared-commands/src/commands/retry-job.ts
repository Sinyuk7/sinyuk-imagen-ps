/**
 * retryJob 命令
 */

import type { Job } from '@imagen-ps/core-engine';
import { createValidationError } from '@imagen-ps/core-engine';
import { getRuntime } from '../runtime.js';
import type { CommandResult } from './types.js';
import { toJobError, WORKFLOW_NAME_KEY } from './submit-job.js';

/** 重试指定 job，用相同输入创建新任务 */
export async function retryJob(jobId: string): Promise<CommandResult<Job>> {
  const runtime = getRuntime();
  const originalJob = runtime.store.getJob(jobId);

  if (!originalJob) {
    return {
      ok: false,
      error: createValidationError(`Job "${jobId}" not found.`),
    };
  }

  const { input } = originalJob;
  const workflowName = input?.[WORKFLOW_NAME_KEY] as string | undefined;

  if (!workflowName) {
    return {
      ok: false,
      error: createValidationError(`Job "${jobId}" is missing _workflowName in input, cannot retry.`),
    };
  }

  try {
    const newJob = await runtime.runWorkflow(workflowName, input);
    return { ok: true, value: newJob };
  } catch (error) {
    return { ok: false, error: toJobError(error) };
  }
}
