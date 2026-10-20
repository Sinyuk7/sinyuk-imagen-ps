import { createRuntime, type DurableJobRecord, type Workflow } from '@imagen-ps/core-engine';
import { afterEach, describe, expect, it } from 'vitest';
import { executeJob } from './commands/execute-job.js';
import type { JobHistoryStore } from './commands/types.js';
import { reconcileStaleRunningTaskRecords } from './commands/task-history.js';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setJobHistoryStore,
  setTaskStore,
} from './runtime.js';
import {
  TASK_RECORD_SCHEMA_VERSION,
  assertTaskRecord,
  decodeTaskRecord,
  type TaskRecord,
  type TaskStore,
} from './task.js';

const CREATED_AT = '2026-07-18T00:00:00.000Z';

function runningTask(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    schemaVersion: TASK_RECORD_SCHEMA_VERSION,
    taskId: 'task-v2',
    status: 'running',
    operation: 'text-to-image',
    prompt: 'generic prompt',
    attachments: [],
    outputs: [],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    execution: {
      backend: { id: 'fake-backend', label: 'Fake Backend' },
      connection: { id: 'connection-1', label: 'Studio Connection' },
      target: { id: 'target-1', label: 'Editorial Target' },
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function memoryTaskStore(initial: readonly TaskRecord[] = []): TaskStore & { readonly records: Map<string, TaskRecord> } {
  const records = new Map(initial.map((record) => [record.taskId, record]));
  return {
    records,
    async put(record) {
      assertTaskRecord(record);
      records.set(record.taskId, record);
    },
    async get(taskId) {
      return records.get(taskId);
    },
    async list(query) {
      const values = [...records.values()]
        .filter((record) => query?.status === undefined || record.status === query.status)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return query?.limit === undefined ? values : values.slice(0, query.limit);
    },
    async delete(taskId) {
      records.delete(taskId);
    },
  };
}

afterEach(() => {
  _resetForTesting();
});

describe('Task v3 current-state contract', () => {
  it('persists bounded structured provider task usage and rejects non-finite values', () => {
    const record = runningTask({
      status: 'completed',
      finishedAt: CREATED_AT,
      taskUsage: { metrics: [{ id: 'runninghub-coins', value: '12', unit: 'coins' }] },
    });
    expect(decodeTaskRecord(record)).toEqual({ ok: true, value: record });
    expect(decodeTaskRecord({ ...record, taskUsage: { metrics: [{ id: 'runninghub-coins', value: 'Infinity', unit: 'coins' }] } })).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('decodes bounded backend-neutral records', () => {
    const record = runningTask({ latestJobId: 'job-latest' });

    expect(decodeTaskRecord(record)).toEqual({ ok: true, value: record });
  });

  it('persists a bounded primary Edit Region snapshot without treating it as an attachment', () => {
    const record = runningTask({
      operation: 'image-edit',
      attachments: [{
        kind: 'photoshop-layer',
        attachmentId: 'attachment-primary',
        asset: { ref: { kind: 'hostObject', ref: 'image-primary', mimeType: 'image/png' } },
      }],
      editRegion: {
        targetAttachmentId: 'attachment-primary',
        source: { host: 'photoshop', documentId: 42, layerId: 7 },
        geometry: {
          sourceBounds: { left: 10, top: 20, right: 110, bottom: 120 },
          targetWidth: 100,
          targetHeight: 100,
        },
        mask: { ref: { kind: 'hostObject', ref: 'mask-primary', mimeType: 'image/png' }, width: 100, height: 100 },
        encoding: 'grayscale-png',
        bitDepth: 8,
        polarity: 'white-edit',
      },
    });

    expect(decodeTaskRecord(record)).toEqual({ ok: true, value: record });
  });

  it.each([
    ['raw bytes', {
      mask: { ref: { kind: 'hostObject', ref: 'mask-primary' }, bytes: new Uint8Array([1, 2, 3]) },
    }],
    ['native path', {
      source: { host: 'photoshop', nativePath: '/tmp/mask.png' },
    }],
    ['secret', {
      source: { host: 'photoshop', authorization: 'Bearer secret-token-value' },
    }],
    ['unknown field', {
      unexpected: true,
    }],
  ])('rejects Edit Region %s', (_label, override) => {
    const record = runningTask({
      operation: 'image-edit',
      attachments: [{
        kind: 'photoshop-layer',
        attachmentId: 'attachment-primary',
        asset: { ref: { kind: 'hostObject', ref: 'image-primary', mimeType: 'image/png' } },
      }],
      editRegion: {
        targetAttachmentId: 'attachment-primary',
        source: { host: 'photoshop', documentId: 42, layerId: 7 },
        geometry: { sourceBounds: { left: 0, top: 0, right: 100, bottom: 100 }, targetWidth: 100, targetHeight: 100 },
        mask: { ref: { kind: 'hostObject', ref: 'mask-primary', mimeType: 'image/png' }, width: 100, height: 100 },
        encoding: 'grayscale-png',
        bitDepth: 8,
        polarity: 'white-edit',
        ...override,
      } as TaskRecord['editRegion'],
    });

    expect(decodeTaskRecord(record)).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('isolates v1 as unknown-schema without migration', () => {
    const result = decodeTaskRecord({
      schemaVersion: 1,
      taskId: 'legacy-task',
      status: 'running',
      operation: 'text-to-image',
      prompt: 'legacy prompt',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      execution: { profileId: 'legacy-profile' },
      executionJobId: 'legacy-job',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unknown-schema',
      message: 'Unsupported task record schemaVersion.',
      taskId: 'legacy-task',
    });
  });

  it('isolates v2 records after the Edit Region schema change', () => {
    const result = decodeTaskRecord({
      ...runningTask(),
      schemaVersion: 2,
    });

    expect(result).toMatchObject({ ok: false, reason: 'unknown-schema' });
  });

  it.each([
    ['root execution alias', { executionJobId: 'legacy-job' }],
    ['Provider-shaped execution summary', { execution: { profileId: 'legacy-profile' } }],
    ['Provider-shaped attachment input', {
      attachments: [{
        kind: 'local-file',
        attachmentId: 'attachment-1',
        asset: { ref: { kind: 'hostObject', ref: 'asset-1' } },
        providerInput: { ref: { kind: 'hostObject', ref: 'prepared-1' } },
      }],
    }],
    ['Provider-shaped output source', {
      status: 'completed',
      outputs: [{
        outputId: 'output-1',
        index: 0,
        kind: 'image',
        asset: { ref: { kind: 'hostObject', ref: 'asset-1' } },
        source: { providerAssetKind: 'storedRef' },
      }],
      finishedAt: CREATED_AT,
    }],
    ['native path evidence', {
      attachments: [{
        kind: 'local-file',
        attachmentId: 'attachment-1',
        asset: { ref: { kind: 'hostObject', ref: 'asset-1' } },
        evidence: { nativePath: '/tmp/private-image.png' },
      }],
    }],
    ['credential-bearing resource URL', {
      status: 'completed',
      outputs: [{
        outputId: 'output-1',
        index: 0,
        kind: 'image',
        asset: { ref: { kind: 'url', ref: 'https://example.test/image.png?token=private' } },
      }],
      finishedAt: CREATED_AT,
    }],
  ])('rejects %s when it masquerades as v2', (_label, legacyFields) => {
    const result = decodeTaskRecord({ ...runningTask(), ...legacyFields });

    expect(result).toMatchObject({ ok: false, reason: 'malformed', taskId: 'task-v2' });
  });
});

describe('Task v3 lifecycle scenarios', () => {
  it('marks only stale running records interrupted after restart', async () => {
    const stale = runningTask({ taskId: 'stale', latestJobId: 'job-stale' });
    const active = runningTask({ taskId: 'active', latestJobId: 'job-active' });
    const completed = runningTask({
      taskId: 'completed',
      status: 'completed',
      outputs: [],
      finishedAt: CREATED_AT,
    });
    const store = memoryTaskStore([stale, active, completed]);
    setTaskStore(store);

    const reconciled = await reconcileStaleRunningTaskRecords(['active']);

    expect(reconciled).toHaveLength(1);
    expect(store.records.get('stale')).toMatchObject({
      status: 'interrupted',
      latestJobId: 'job-stale',
      error: { category: 'interrupted', message: 'App restarted before completion.' },
      outputs: [],
    });
    expect(store.records.get('stale')?.finishedAt).toBeTruthy();
    expect(store.records.get('active')?.status).toBe('running');
    expect(store.records.get('completed')?.status).toBe('completed');
  });

  it('keeps only bounded remote-may-continue evidence for stale ComfyUI Tasks', async () => {
    const record = runningTask({
      taskId: 'comfyui-running',
      execution: {
        backend: { id: 'comfyui', label: 'ComfyUI' },
        connection: { id: 'connection-a', label: 'Studio ComfyUI' },
        target: { id: 'workflow-a', label: 'D01' },
      },
    });
    const taskStore = memoryTaskStore([record]);
    setTaskStore(taskStore);

    const reconciled = await reconcileStaleRunningTaskRecords([]);
    expect(reconciled).toMatchObject([{
      taskId: 'comfyui-running',
      status: 'interrupted',
      error: {
        category: 'interrupted',
        details: { remoteMayContinue: true },
      },
    }]);
    expect(JSON.stringify(reconciled)).not.toMatch(/promptId|operationId|receipt|remotePath/i);
  });
});

describe('generic Job execution scenarios', () => {
  it('preserves workflow and Retry attempt metadata in Job and durable history', async () => {
    const workflow: Workflow = {
      name: 'local-render',
      version: '1',
      steps: [{
        name: 'render',
        kind: 'execution',
        adapter: 'local-render',
        input: { prompt: '${prompt}' },
        outputKey: 'result',
      }],
    };
    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [{ adapter: 'local-render', async dispatch() { return { assets: [] }; } }],
    });
    _setRuntimeInstanceForTesting(Object.assign(runtime, {
      providerRegistry: { list: () => [], get: () => undefined, getByProviderId: () => undefined },
    }) as never);
    const records: DurableJobRecord[] = [];
    setJobHistoryStore({
      async put(record) { records.push(record); },
      async get(jobId) { return records.find((record) => record.jobId === jobId); },
      async list() { return records; },
      async delete() {},
    } satisfies JobHistoryStore);

    const result = await executeJob({
      execution: { workflow: workflow.name, input: { prompt: 'retry prompt' } },
      originJobId: 'job-origin',
      retryAttempt: 2,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { originJobId: 'job-origin', retryAttempt: 2 },
    });
    expect(records).toMatchObject([{
      workflow: workflow.name,
      input: { prompt: 'retry prompt' },
      originJobId: 'job-origin',
      retryAttempt: 2,
    }]);

    await expect(executeJob({
      execution: { workflow: workflow.name, input: { prompt: 'invalid retry' } },
      originJobId: 'job-origin',
    })).resolves.toMatchObject({ ok: false, error: { category: 'validation' } });
  });
});
