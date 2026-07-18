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

describe('Task v2 current-state contract', () => {
  it('decodes bounded backend-neutral records', () => {
    const record = runningTask({ latestJobId: 'job-latest' });

    expect(decodeTaskRecord(record)).toEqual({ ok: true, value: record });
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

describe('Task v2 lifecycle scenarios', () => {
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
      providerRegistry: { list: () => [], get: () => undefined, getByApiFormat: () => undefined },
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
