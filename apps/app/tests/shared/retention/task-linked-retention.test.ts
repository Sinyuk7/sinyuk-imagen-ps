import { describe, expect, it, vi } from 'vitest';
import type { AssetStore, DurableJobRecord, StoredAssetRef, TaskRecord } from '@imagen-ps/application';
import { createRetentionController } from '../../../src/shared/retention/controller';
import { defaultTaskLinkedRetentionPolicy, runTaskLinkedRetention } from '../../../src/shared/retention/task-linked-retention';

function taskRef(ref: string): StoredAssetRef {
  return { kind: 'hostObject', ref, mimeType: 'image/png', byteSize: 16 };
}

function completedTask(taskId: string, updatedAt: string, refs: readonly string[]): TaskRecord {
  return {
    schemaVersion: 1,
    taskId,
    status: 'completed',
    operation: 'text-to-image',
    prompt: taskId,
    attachments: [],
    outputs: refs.map((ref, index) => ({
      outputId: `${taskId}:output:${index}`,
      index,
      kind: 'image',
      asset: { ref: taskRef(ref) },
    })),
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: updatedAt,
    updatedAt,
    finishedAt: updatedAt,
  };
}

function runningTask(taskId: string, updatedAt: string, refs: readonly string[] = []): TaskRecord {
  return {
    schemaVersion: 1,
    taskId,
    status: 'running',
    operation: 'text-to-image',
    prompt: taskId,
    attachments: [],
    outputs: refs.map((ref, index) => ({
      outputId: `${taskId}:output:${index}`,
      index,
      kind: 'image',
      asset: { ref: taskRef(ref) },
    })),
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: updatedAt,
    updatedAt,
  };
}

function job(jobId: string, updatedAt: string): DurableJobRecord {
  return {
    schemaVersion: 1,
    jobId,
    status: 'completed',
    workflow: 'provider-generate',
    input: { prompt: jobId },
    outputs: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function createMemoryStores(input: {
  readonly tasks: readonly TaskRecord[];
  readonly jobs?: readonly DurableJobRecord[];
  readonly undeletableRefs?: readonly string[];
}) {
  const tasks = [...input.tasks];
  const jobs = [...(input.jobs ?? [])];
  const deletedRefs: string[] = [];
  const assetStore: AssetStore = {
    async put() {
      throw new Error('not used');
    },
    async resolve() {
      return undefined;
    },
    async delete(ref) {
      if (input.undeletableRefs?.includes(ref.ref)) {
        throw new Error(`cannot delete ${ref.ref}`);
      }
      deletedRefs.push(ref.ref);
    },
  };

  return {
    deletedRefs,
    stores: {
      taskStore: {
        async put(record: TaskRecord) {
          const index = tasks.findIndex((item) => item.taskId === record.taskId);
          if (index >= 0) {
            tasks[index] = record;
          } else {
            tasks.push(record);
          }
        },
        async get(taskId: string) {
          return tasks.find((item) => item.taskId === taskId);
        },
        async list() {
          return tasks.slice();
        },
        async delete(taskId: string) {
          const index = tasks.findIndex((item) => item.taskId === taskId);
          if (index >= 0) {
            tasks.splice(index, 1);
          }
        },
      },
      jobHistoryStore: {
        async put(record: DurableJobRecord) {
          const index = jobs.findIndex((item) => item.jobId === record.jobId);
          if (index >= 0) {
            jobs[index] = record;
          } else {
            jobs.push(record);
          }
        },
        async get(jobId: string) {
          return jobs.find((item) => item.jobId === jobId);
        },
        async list() {
          return jobs.slice();
        },
        async delete(jobId: string) {
          const index = jobs.findIndex((item) => item.jobId === jobId);
          if (index >= 0) {
            jobs.splice(index, 1);
          }
        },
      },
      assetStore,
    },
    snapshot() {
      return { tasks: tasks.slice(), jobs: jobs.slice() };
    },
  };
}

describe('task-linked retention', () => {
  it('deletes trimmed task assets before removing the trimmed records', async () => {
    const memory = createMemoryStores({
      tasks: [
        completedTask('task-new', '2026-07-02T00:00:03.000Z', ['asset-new']),
        completedTask('task-old', '2026-07-02T00:00:01.000Z', ['asset-old']),
      ],
      jobs: [job('job-new', '2026-07-02T00:00:03.000Z'), job('job-old', '2026-07-02T00:00:01.000Z')],
    });

    const summary = await runTaskLinkedRetention(memory.stores, {
      ...defaultTaskLinkedRetentionPolicy(),
      maxTerminalTaskRecords: 1,
      maxJobHistoryRecords: 1,
      generatedAssetHighWatermark: 1000,
      generatedAssetLowWatermark: 850,
    });

    expect(memory.deletedRefs).toContain('asset-old');
    expect(memory.snapshot().tasks.map((record) => record.taskId)).toEqual(['task-new']);
    expect(memory.snapshot().jobs.map((record) => record.jobId)).toEqual(['job-new']);
    expect(summary.taskRecordsDeleted).toBe(1);
    expect(summary.jobRecordsDeleted).toBe(1);
  });

  it('keeps trimmed records when their assets cannot be deleted', async () => {
    const memory = createMemoryStores({
      tasks: [
        completedTask('task-new', '2026-07-02T00:00:03.000Z', ['asset-new']),
        completedTask('task-old', '2026-07-02T00:00:01.000Z', ['asset-old']),
      ],
      undeletableRefs: ['asset-old'],
    });

    const summary = await runTaskLinkedRetention(memory.stores, {
      ...defaultTaskLinkedRetentionPolicy(),
      maxTerminalTaskRecords: 1,
      maxJobHistoryRecords: 50,
      generatedAssetHighWatermark: 1000,
      generatedAssetLowWatermark: 850,
    });

    expect(memory.snapshot().tasks.map((record) => record.taskId)).toEqual(['task-new', 'task-old']);
    expect(summary.taskRecordsDeleted).toBe(0);
    expect(summary.taskRecordsDeferred).toBe(1);
  });

  it('uses oldest-first high/low watermark eviction for retained completed outputs', async () => {
    const tasks = [
      completedTask('task-3', '2026-07-02T00:00:03.000Z', ['asset-3']),
      completedTask('task-2', '2026-07-02T00:00:02.000Z', ['asset-2']),
      completedTask('task-1', '2026-07-02T00:00:01.000Z', ['asset-1']),
    ];
    const memory = createMemoryStores({ tasks });

    const summary = await runTaskLinkedRetention(memory.stores, {
      ...defaultTaskLinkedRetentionPolicy(),
      maxTerminalTaskRecords: 100,
      maxJobHistoryRecords: 50,
      generatedAssetHighWatermark: 2,
      generatedAssetLowWatermark: 1,
    });

    expect(memory.deletedRefs).toEqual(['asset-1', 'asset-2']);
    expect(summary.generatedAssetRefsDeletedByWatermark).toBe(2);
  });

  it('does not evict outputs referenced by running tasks', async () => {
    const memory = createMemoryStores({
      tasks: [
        completedTask('task-3', '2026-07-02T00:00:03.000Z', ['asset-3']),
        completedTask('task-2', '2026-07-02T00:00:02.000Z', ['asset-2']),
        runningTask('task-running', '2026-07-02T00:00:04.000Z', ['asset-1']),
        completedTask('task-1', '2026-07-02T00:00:01.000Z', ['asset-1']),
      ],
    });

    await runTaskLinkedRetention(memory.stores, {
      ...defaultTaskLinkedRetentionPolicy(),
      maxTerminalTaskRecords: 100,
      maxJobHistoryRecords: 50,
      generatedAssetHighWatermark: 2,
      generatedAssetLowWatermark: 1,
    });

    expect(memory.deletedRefs).toEqual(['asset-2']);
  });
});

describe('retention controller', () => {
  it('coalesces concurrent requests into single-flight reruns', async () => {
    const calls: string[] = [];
    let release!: () => void;
    const firstSweep = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sweep = vi.fn(async (reason: 'startup' | 'generation-success') => {
      calls.push(reason);
      if (calls.length === 1) {
        await firstSweep;
      }
    });
    const controller = createRetentionController({ sweep });

    const first = controller.requestSweep('startup');
    const second = controller.requestSweep('generation-success');
    const third = controller.requestSweep('generation-success');
    release();
    await Promise.all([first, second, third]);

    expect(sweep).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['startup', 'generation-success']);
  });
});
