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

function interruptedRecord(record: TaskRecord): TaskRecord {
  return {
    ...record,
    status: 'interrupted',
    error: {
      category: 'interrupted',
      message: 'App restarted before completion.',
    },
    outputs: [],
    finishedAt: record.finishedAt ?? record.updatedAt,
  };
}

/**
 * 将不属于当前活跃 session 的 stale running task 一次性标记为 interrupted。
 *
 * 该命令用于 app 启动恢复，不应由普通 history 读取路径触发。
 */
export async function reconcileStaleRunningTaskRecords(activeTaskIds: readonly string[]): Promise<readonly TaskRecord[]> {
  const active = new Set(activeTaskIds.filter((taskId) => taskId.length > 0));
  const records = await getTaskStore().list();
  const updated: TaskRecord[] = [];
  for (const record of records) {
    if (record.status !== 'running' || active.has(record.taskId)) {
      continue;
    }
    const next = interruptedRecord(record);
    assertTaskRecord(next);
    await getTaskStore().put(next);
    updated.push(next);
  }
  return updated;
}

/** 查询 durable task record。 */
export async function getTaskRecord(taskId: string): Promise<TaskRecord | undefined> {
  return getTaskStore().get(taskId);
}

/** 列出 durable task records。 */
export async function listTaskRecords(query?: ListTaskRecordsQuery): Promise<readonly TaskRecord[]> {
  const records = await getTaskStore().list();
  const filtered = query?.status === undefined ? records : records.filter((record) => record.status === query.status);
  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}
