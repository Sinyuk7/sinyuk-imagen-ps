import { assertTaskRecord, type TaskRecord, type TaskStatus } from '@imagen-ps/core-engine';
import { getTaskStore } from '../runtime.js';

export interface ListTaskRecordsQuery {
  /** 最多返回多少条记录。 */
  readonly limit?: number;
  /** 按 task status 过滤。 */
  readonly status?: TaskStatus;
}

/** Upsert durable task record by taskId。 */
export async function putTaskRecord(record: TaskRecord): Promise<void> {
  assertTaskRecord(record);
  await getTaskStore().put(record);
}

function projectRestartSafe(record: TaskRecord): TaskRecord {
  if (record.status !== 'running') {
    return record;
  }
  const now = new Date().toISOString();
  return {
    ...record,
    status: 'interrupted',
    error: {
      category: 'interrupted',
      message: 'App restarted before completion.',
    },
    outputs: [],
    updatedAt: now,
    finishedAt: now,
  };
}

/** 查询 durable task record。 */
export async function getTaskRecord(taskId: string): Promise<TaskRecord | undefined> {
  const record = await getTaskStore().get(taskId);
  return record ? projectRestartSafe(record) : undefined;
}

/** 列出 durable task records。 */
export async function listTaskRecords(query?: ListTaskRecordsQuery): Promise<readonly TaskRecord[]> {
  const records = (await getTaskStore().list()).map(projectRestartSafe);
  const filtered = query?.status === undefined ? records : records.filter((record) => record.status === query.status);
  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}
