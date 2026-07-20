import { describe, expect, it } from 'vitest';
import type { JobHistoryStore, StoredAssetRef, TaskRecord, TaskStore } from '@imagen-ps/application';
import { runTaskLinkedRetention } from '../../../src/shared/retention/task-linked-retention';

function completedTask(input: {
  readonly taskId: string;
  readonly updatedAt: string;
  readonly outputRef: string;
  readonly maskRef: string;
}): TaskRecord {
  return {
    schemaVersion: 3,
    taskId: input.taskId,
    status: 'completed',
    operation: 'image-edit',
    prompt: 'replace background',
    attachments: [{
      kind: 'photoshop-layer',
      attachmentId: 'primary',
      asset: { ref: { kind: 'hostObject', ref: `${input.taskId}-primary`, mimeType: 'image/png' } },
    }],
    editRegion: {
      targetAttachmentId: 'primary',
      source: { kind: 'photoshop-user-layer-mask', documentId: 42, layerId: 7 },
      geometry: { sourceBounds: { left: 0, top: 0, right: 100, bottom: 100 }, targetWidth: 100, targetHeight: 100 },
      mask: { ref: { kind: 'hostObject', ref: input.maskRef, mimeType: 'image/png' }, width: 100, height: 100 },
      encoding: 'grayscale-png',
      bitDepth: 8,
      polarity: 'white-edit',
    },
    outputs: [{
      outputId: `${input.taskId}:output:0`,
      index: 0,
      kind: 'image',
      asset: { ref: { kind: 'hostObject', ref: input.outputRef, mimeType: 'image/png' } },
    }],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    finishedAt: input.updatedAt,
  };
}

function taskStore(records: readonly TaskRecord[]): TaskStore & { readonly records: Map<string, TaskRecord> } {
  const stored = new Map(records.map((record) => [record.taskId, record]));
  return {
    records: stored,
    async put(record) { stored.set(record.taskId, record); },
    async get(taskId) { return stored.get(taskId); },
    async list() { return Array.from(stored.values()); },
    async delete(taskId) { stored.delete(taskId); },
  };
}

describe('Task-linked retention Edit Region contract', () => {
  it('preserves retained Task Mask refs and evicts Mask refs only with trimmed Task history', async () => {
    const retained = completedTask({
      taskId: 'retained', updatedAt: '2026-07-20T00:02:00.000Z', outputRef: 'retained-output', maskRef: 'retained-mask',
    });
    const trimmed = completedTask({
      taskId: 'trimmed', updatedAt: '2026-07-20T00:01:00.000Z', outputRef: 'trimmed-output', maskRef: 'trimmed-mask',
    });
    const tasks = taskStore([retained, trimmed]);
    const deleted: StoredAssetRef[] = [];
    const jobs: JobHistoryStore = {
      async put() {}, async get() { return undefined; }, async list() { return []; }, async delete() {},
    };

    const summary = await runTaskLinkedRetention({
      taskStore: tasks,
      jobHistoryStore: jobs,
      assetStore: {
        async put() { throw new Error('unused'); },
        async resolve() { return undefined; },
        async delete(ref) { deleted.push(ref); },
      },
    }, {
      maxTerminalTaskRecords: 1,
      maxJobHistoryRecords: 0,
      generatedAssetHighWatermark: 100,
      generatedAssetLowWatermark: 50,
    });

    expect(tasks.records.get('retained')?.editRegion?.mask.ref.ref).toBe('retained-mask');
    expect(tasks.records.has('trimmed')).toBe(false);
    expect(deleted.map((ref) => ref.ref).sort()).toEqual(['trimmed-mask', 'trimmed-output']);
    expect(summary).toMatchObject({ taskRecordsDeleted: 1, generatedAssetRefsDeletedDuringTrim: 2 });
  });
});
