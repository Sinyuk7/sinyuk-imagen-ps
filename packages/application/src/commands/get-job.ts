/**
 * getJob 命令实现。
 *
 * 同步查询指定 job 的当前快照。
 */

import type { Job } from '@imagen-ps/core-engine';
import { getRuntime } from '../runtime.js';

/**
 * 同步查询指定 job 的当前快照。
 *
 * 直接返回 `Job | undefined`，不使用 Result 包装。
 * 这是纯同步查询操作，不存在异步错误场景。
 *
 * @param jobId - 要查询的 job ID
 * @returns 若存在则返回 Job 对象，否则返回 undefined
 *
 * @example
 * ```ts
 * const job = getJob('job-123');
 * if (job) {
 *   console.log('Job status:', job.status);
 * }
 * ```
 */
export function getJob(jobId: string): Job | undefined {
  const runtime = getRuntime();
  return runtime.store.getJob(jobId);
}
