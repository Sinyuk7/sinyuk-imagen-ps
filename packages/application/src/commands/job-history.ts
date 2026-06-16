import type { DurableJobRecord, JobStatus } from '@imagen-ps/core-engine';
import { getJobHistoryStore } from '../runtime.js';

export interface ListJobHistoryQuery {
  /** 最多返回多少条记录。 */
  readonly limit?: number;
  /** 按 terminal status 过滤。 */
  readonly status?: JobStatus;
}

/**
 * 查询 durable job record。
 *
 * @param jobId - job 唯一标识
 * @returns 命中时返回 durable record；否则返回 undefined
 */
export async function getJobHistoryRecord(jobId: string): Promise<DurableJobRecord | undefined> {
  return getJobHistoryStore().get(jobId);
}

/**
 * 列出 durable job history。
 *
 * @param query - 可选过滤条件
 * @returns durable job record 列表
 */
export async function listJobHistoryRecords(query?: ListJobHistoryQuery): Promise<readonly DurableJobRecord[]> {
  return getJobHistoryStore().list(query);
}
