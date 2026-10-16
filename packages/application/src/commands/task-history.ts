import { getTaskStore } from '../runtime.js';
import { assertTaskRecord, type TaskRecord, type TaskStatus } from '../task.js';
import { ActiveSlotAdmission, selectRecoveryCandidates } from '../traceable-generation.js';

/** Durable Task history 查询条件。 */
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
  const interruptedAt = new Date().toISOString();
  return {
    ...record,
    status: record.remote?.remoteTaskId ? 'running' : 'interrupted',
    ...(record.remote?.remoteTaskId ? {} : { error: {
      category: 'interrupted' as const,
      message: 'App restarted before completion.',
      ...(record.execution?.backend.id === 'comfyui' ? { details: { remoteMayContinue: true } } : {}),
    } }),
    outputs: record.outputs,
    updatedAt: interruptedAt,
    ...(record.remote?.remoteTaskId ? {} : { finishedAt: interruptedAt }),
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

/** Recovery executor；只接收已有 remote task id 的历史任务，不会重新 submit。 */
export interface TaskRecoveryExecutor {
  recover(task: TaskRecord, remoteTaskId: string): Promise<TaskRecord>;
}

/** 启动时最多恢复一次既有 remote task，容量不足时保留 running 历史。 */
export async function recoverTraceableTasks(
  executor: TaskRecoveryExecutor,
  options: { readonly admission?: ActiveSlotAdmission } = {},
): Promise<readonly TaskRecord[]> {
  const records = await getTaskStore().list({ status: 'running' });
  const candidates = selectRecoveryCandidates(records.map((task) => ({ task, remoteTaskId: task.remote?.remoteTaskId })));
  const admission = options.admission ?? new ActiveSlotAdmission();
  const recovered: TaskRecord[] = [];
  for (const candidate of candidates) {
    const remoteTaskId = candidate.remoteTaskId;
    if (!remoteTaskId) continue;
    let reservation;
    try { reservation = admission.reserve(1); } catch { continue; }
    try {
      const next = await executor.recover(candidate.task, remoteTaskId);
      assertTaskRecord(next);
      await getTaskStore().put(next);
      recovered.push(next);
    } finally { reservation.release(); }
  }
  return recovered;
}
