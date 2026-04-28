/**
 * submitJob 命令实现。
 *
 * 提交一个 workflow 执行并等待结果。
 */

import type { Job, JobError } from '@imagen-ps/core-engine';
import { createRuntimeError } from '@imagen-ps/core-engine';
import { getRuntime } from '../runtime.js';
import type { CommandResult, SubmitJobInput } from './types.js';

/**
 * 判断 unknown 是否已携带 `JobError` 结构。
 */
function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Partial<JobError>;
  return typeof candidate.category === 'string' && typeof candidate.message === 'string';
}

/**
 * 将执行期异常收敛为 `JobError`。
 *
 * - 若 error 已是 `JobError`，原样返回（保留原始 category）
 * - 若 error 是普通 `Error`，映射为 `category: 'runtime'`
 * - 其他情况，构造 `category: 'runtime'` 的 fallback
 */
export function toJobError(error: unknown): JobError {
  if (isJobError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createRuntimeError(error.message, {
      name: error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  }

  return createRuntimeError('Unknown error during job submission.', {
    cause: String(error),
  });
}

/**
 * 提交一个 workflow 执行并等待结果。
 *
 * @param input - 包含 workflow 名称与 job 输入
 * @returns 成功时 `{ ok: true, value: Job }`，失败时 `{ ok: false, error: JobError }`
 *
 * @example
 * ```ts
 * const result = await submitJob({
 *   workflow: 'provider-generate',
 *   input: { provider: 'mock', prompt: 'a cat' },
 * });
 *
 * if (result.ok) {
 *   console.log('Job completed:', result.value);
 * } else {
 *   console.error('Job failed:', result.error);
 * }
 * ```
 */
export async function submitJob(input: SubmitJobInput): Promise<CommandResult<Job>> {
  const runtime = getRuntime();

  try {
    const job = await runtime.runWorkflow(input.workflow, input.input);
    return { ok: true, value: job };
  } catch (error) {
    return { ok: false, error: toJobError(error) };
  }
}
