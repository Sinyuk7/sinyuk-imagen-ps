import type { AssetStore, JobHistoryStore, StoredAssetRef, TaskRecord, TaskStore } from '@imagen-ps/application';

export interface TaskLinkedRetentionPolicy {
  readonly maxTerminalTaskRecords: number;
  readonly maxJobHistoryRecords: number;
  readonly generatedAssetHighWatermark: number;
  readonly generatedAssetLowWatermark: number;
}

export interface TaskLinkedRetentionSummary {
  readonly taskRecordsBefore: number;
  readonly taskRecordsDeleted: number;
  readonly taskRecordsDeferred: number;
  readonly jobRecordsBefore: number;
  readonly jobRecordsDeleted: number;
  readonly generatedAssetRefsBefore: number;
  readonly generatedAssetRefsDeletedDuringTrim: number;
  readonly generatedAssetRefsDeletedByWatermark: number;
  readonly generatedAssetRefsAfter: number;
}

interface RefOwner {
  readonly key: string;
  readonly ref: StoredAssetRef;
  readonly updatedAt: string;
}

function compareNewestFirst<T extends { readonly updatedAt: string }>(left: T, right: T): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function refKey(ref: StoredAssetRef): string {
  return `${ref.kind}:${ref.ref}`;
}

function taskOutputRefs(record: TaskRecord): readonly StoredAssetRef[] {
  return record.outputs.map((output) => output.asset.ref);
}

function uniqueRefOwners(records: readonly TaskRecord[]): readonly RefOwner[] {
  const owners = new Map<string, RefOwner>();
  for (const record of records) {
    if (record.status !== 'completed') {
      continue;
    }
    for (const ref of taskOutputRefs(record)) {
      const key = refKey(ref);
      const existing = owners.get(key);
      if (!existing || record.updatedAt < existing.updatedAt) {
        owners.set(key, { key, ref, updatedAt: record.updatedAt });
      }
    }
  }
  return Array.from(owners.values());
}

function retainedTaskRefKeys(records: readonly TaskRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const record of records) {
    for (const ref of taskOutputRefs(record)) {
      keys.add(refKey(ref));
    }
  }
  return keys;
}

async function deleteRefs(
  assetStore: AssetStore,
  refs: readonly RefOwner[],
): Promise<ReadonlyMap<string, boolean>> {
  const results = new Map<string, boolean>();
  for (const owner of refs) {
    try {
      await assetStore.delete(owner.ref);
      results.set(owner.key, true);
    } catch {
      results.set(owner.key, false);
    }
  }
  return results;
}

export function defaultTaskLinkedRetentionPolicy(): TaskLinkedRetentionPolicy {
  return {
    maxTerminalTaskRecords: 100,
    maxJobHistoryRecords: 50,
    generatedAssetHighWatermark: 1000,
    generatedAssetLowWatermark: 850,
  };
}

/**
 * 对 task/job history 与 task-linked generated output 做同轮保留策略。
 *
 * 约束：
 * - 只治理 `TaskRecord.outputs` 引用的生成产物。
 * - 先删可安全删除的 asset，再删对应的 task history。
 * - 删除失败时保留 task 记录，避免丢失最后的 ref 线索。
 */
export async function runTaskLinkedRetention(
  stores: {
    readonly taskStore: TaskStore;
    readonly jobHistoryStore: JobHistoryStore;
    readonly assetStore: AssetStore;
  },
  policy: TaskLinkedRetentionPolicy = defaultTaskLinkedRetentionPolicy(),
): Promise<TaskLinkedRetentionSummary> {
  const allTasks = (await stores.taskStore.list()).slice().sort(compareNewestFirst);
  const activeTasks = allTasks.filter((record) => record.status === 'running');
  const terminalTasks = allTasks.filter((record) => record.status !== 'running');
  const retainedTerminalTasks = terminalTasks.slice(0, policy.maxTerminalTaskRecords);
  const trimmedTerminalTasks = terminalTasks.slice(policy.maxTerminalTaskRecords);
  const retainedKeys = retainedTaskRefKeys([...activeTasks, ...retainedTerminalTasks]);

  const trimCandidates = new Map<string, RefOwner>();
  for (const record of trimmedTerminalTasks) {
    for (const ref of taskOutputRefs(record)) {
      const key = refKey(ref);
      if (retainedKeys.has(key) || trimCandidates.has(key)) {
        continue;
      }
      trimCandidates.set(key, { key, ref, updatedAt: record.updatedAt });
    }
  }

  const trimDeleteResults = await deleteRefs(stores.assetStore, Array.from(trimCandidates.values()));
  const deletedTaskIds = new Set<string>();
  let taskRecordsDeferred = 0;

  for (const record of trimmedTerminalTasks) {
    const refs = taskOutputRefs(record);
    const canDeleteRecord = refs.every((ref) => {
      const key = refKey(ref);
      if (retainedKeys.has(key)) {
        return true;
      }
      return trimDeleteResults.get(key) === true;
    });
    if (!canDeleteRecord) {
      taskRecordsDeferred += 1;
      continue;
    }
    await stores.taskStore.delete(record.taskId);
    deletedTaskIds.add(record.taskId);
  }

  const remainingTasks = allTasks.filter((record) => !deletedTaskIds.has(record.taskId));
  const remainingRefOwners = uniqueRefOwners(remainingTasks);
  const generatedAssetRefsBefore = remainingRefOwners.length;
  const protectedKeys = retainedTaskRefKeys(activeTasks);
  const retainedCompletedTaskKeys = retainedTaskRefKeys(
    remainingTasks
      .filter((record) => record.status === 'completed')
      .slice()
      .sort(compareNewestFirst)
      .slice(0, policy.generatedAssetLowWatermark),
  );
  const watermarkCandidates = remainingRefOwners
    .filter((owner) => !protectedKeys.has(owner.key) && !retainedCompletedTaskKeys.has(owner.key))
    .slice()
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  const watermarkDeletesNeeded =
    generatedAssetRefsBefore > policy.generatedAssetHighWatermark
      ? generatedAssetRefsBefore - policy.generatedAssetLowWatermark
      : 0;
  const watermarkDeleteTargets = watermarkCandidates.slice(0, watermarkDeletesNeeded);
  const watermarkDeleteResults = await deleteRefs(stores.assetStore, watermarkDeleteTargets);

  const allJobs = (await stores.jobHistoryStore.list()).slice().sort(compareNewestFirst);
  const trimmedJobs = allJobs.slice(policy.maxJobHistoryRecords);
  for (const record of trimmedJobs) {
    await stores.jobHistoryStore.delete(record.jobId);
  }

  const generatedAssetRefsDeletedDuringTrim = Array.from(trimDeleteResults.values()).filter(Boolean).length;
  const generatedAssetRefsDeletedByWatermark = Array.from(watermarkDeleteResults.values()).filter(Boolean).length;

  return {
    taskRecordsBefore: allTasks.length,
    taskRecordsDeleted: deletedTaskIds.size,
    taskRecordsDeferred,
    jobRecordsBefore: allJobs.length,
    jobRecordsDeleted: trimmedJobs.length,
    generatedAssetRefsBefore,
    generatedAssetRefsDeletedDuringTrim,
    generatedAssetRefsDeletedByWatermark,
    generatedAssetRefsAfter:
      generatedAssetRefsBefore - generatedAssetRefsDeletedDuringTrim - generatedAssetRefsDeletedByWatermark,
  };
}
