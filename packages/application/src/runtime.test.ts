import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import {
  _resetForTesting,
  setJobHistoryStore,
  setAssetStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
} from './runtime.js';
import { retryJob } from './commands/retry-job.js';
import { submitJob } from './commands/submit-job.js';
import { getTaskRecord, listTaskRecords, reconcileStaleRunningTaskRecords } from './commands/task-history.js';
import type {
  DurableJobRecord,
  JobHistoryStore,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  AssetStore,
  StoredAssetRef,
  TaskRecord,
  TaskStore,
} from './commands/types.js';

function createProfileRepository(profile: ProviderProfile): ProviderProfileRepository {
  return {
    async list() {
      return [profile];
    },
    async get(profileId: string) {
      return profileId === profile.profileId ? profile : undefined;
    },
    async save() {},
    async delete() {},
  };
}

function createSecretStorage(): SecretStorageAdapter {
  return {
    async getSecret() {
      return 'mock-key';
    },
    async setSecret() {},
    async deleteSecret() {},
  };
}

function createJobHistoryStore(records: DurableJobRecord[] = []): JobHistoryStore {
  return {
    async put(record) {
      records.push(record);
    },
    async get(jobId) {
      return records.find((record) => record.jobId === jobId);
    },
    async list() {
      return records;
    },
    async delete(jobId) {
      const index = records.findIndex((record) => record.jobId === jobId);
      if (index !== -1) {
        records.splice(index, 1);
      }
    },
  };
}

function createTaskStore(records: TaskRecord[] = []): TaskStore {
  return {
    async put(record) {
      const index = records.findIndex((item) => item.taskId === record.taskId);
      if (index === -1) {
        records.push(record);
      } else {
        records[index] = record;
      }
    },
    async get(taskId) {
      return records.find((record) => record.taskId === taskId);
    },
    async list() {
      return records;
    },
    async delete(taskId) {
      const index = records.findIndex((record) => record.taskId === taskId);
      if (index !== -1) {
        records.splice(index, 1);
      }
    },
  };
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createAssetStore(seed?: { readonly ref: StoredAssetRef; readonly bytes: Uint8Array }): AssetStore {
  const records = new Map<string, ArrayBuffer>();
  if (seed) {
    records.set(seed.ref.ref, arrayBufferFromBytes(seed.bytes));
  }
  return {
    async put(bytes, meta) {
      const ref = `test-asset-${records.size + 1}`;
      records.set(ref, bytes);
      return {
        kind: 'hostObject',
        ref,
        ...(meta.mimeType ? { mimeType: meta.mimeType } : {}),
        ...(meta.name ? { name: meta.name } : {}),
        byteSize: bytes.byteLength,
      };
    },
    async resolve(ref) {
      return records.get(ref.ref);
    },
    async delete(ref) {
      records.delete(ref.ref);
    },
  };
}

function mockOpenAiImagesFetch(assertRequest?: (input: unknown, init: RequestInit | undefined) => void) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    assertRequest?.(input, init);
    return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }], output_format: 'png' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('profile dispatch runtime', () => {
  it('does not spread unresolved providerOptions placeholders into model options', async () => {
    _resetForTesting();
    setProviderProfileRepository(
      createProfileRepository({
        profileId: 'mock-profile',
        apiFormat: 'openai-images',
        displayName: 'Mock Profile',
        config: {
          apiFormat: 'openai-images',
          displayName: 'Mock Profile',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local/v1', enabled: true }],
          },
          defaultModel: 'gpt-image-2',
        },
        secretRefs: { apiKey: 'secret:mock' },
        enabled: true,
        selectedModelIds: ['gpt-image-2'],
        defaultModelId: 'gpt-image-2',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    setSecretStorageAdapter(createSecretStorage());
    const fetchSpy = mockOpenAiImagesFetch((input, init) => {
      expect(String(input)).toBe('https://mock.local/v1/images/edits');
      expect(init?.body).toBeInstanceOf(FormData);
      if (init?.body instanceof FormData) {
        expect(init.body.get('model')).toBe('gpt-image-2');
      }
    });

    const result = await submitJob({
      workflow: 'provider-edit' as never,
      input: {
        profileId: 'mock-profile',
        prompt: 'make the geometric shape blue',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const image = result.value.output?.image as { assets?: Array<{ data?: unknown; storedRef?: unknown }> };
    expect(image.assets?.[0]?.data).toBeUndefined();
    expect(image.assets?.[0]?.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/png' });
  });

  it('resolves explicit providerOptions.model into canonical request.model before provider dispatch', async () => {
    _resetForTesting();
    setProviderProfileRepository(
      createProfileRepository({
        profileId: 'mock-profile',
        apiFormat: 'openai-images',
        displayName: 'Mock Profile',
        config: {
          apiFormat: 'openai-images',
          displayName: 'Mock Profile',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local/v1', enabled: true }],
          },
          defaultModel: 'gpt-image-2',
        },
        secretRefs: { apiKey: 'secret:mock' },
        enabled: true,
        selectedModelIds: ['gpt-image-2', 'gpt-image-1'],
        defaultModelId: 'gpt-image-2',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    setSecretStorageAdapter(createSecretStorage());
    mockOpenAiImagesFetch((_input, init) => {
      expect(init?.body).toBeTypeOf('string');
      const body = JSON.parse(String(init?.body)) as { readonly model?: string; readonly providerOptions?: unknown };
      expect(body.model).toBe('gpt-image-1');
    });

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-profile',
        prompt: 'draw a square',
        providerOptions: { model: 'gpt-image-1' },
      },
    });

    expect(result.ok).toBe(true);
  });

  it('flushes terminal jobs to injected durable history without raw secret values', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        profileId: 'mock-profile',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      schemaVersion: 1,
      jobId: result.ok ? result.value.id : '',
      status: 'completed',
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        profileId: 'mock-profile',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
        },
      },
    });
    expect(records[0].outputs).toHaveLength(1);
    expect(records[0].outputs[0].kind).toBe('hostObject');
    expect(records[0].outputs[0].ref).not.toContain('base64');
    expect(JSON.stringify(records[0])).not.toContain('mock-key');
  });

  it('keeps submit command, runtime, and dispatch logs on the caller trace with profile context', async () => {
    _resetForTesting();
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: {
        surface: 'test',
        package: 'application',
        component: 'session',
      },
    });

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        profileId: 'mock-profile',
        prompt: 'simple blue square icon',
      },
      logger,
    });

    expect(result.ok).toBe(true);
    const commandStart = sink.records.find((record) => record.event === 'command.submit.start');
    const runtimeStart = sink.records.find((record) => record.event === 'runtime.job.start');
    const stepStart = sink.records.find((record) => record.event === 'runner.step.start');
    const dispatchStart = sink.records.find((record) => record.event === 'dispatch.provider.start');
    expect(commandStart?.profile_id).toBe('mock-profile');
    expect(runtimeStart?.trace_id).toBe(commandStart?.trace_id);
    expect(dispatchStart?.trace_id).toBe(commandStart?.trace_id);
    expect(runtimeStart?.parent_span_id).toBe(commandStart?.span_id);
    expect(stepStart?.parent_span_id).toBe(runtimeStart?.span_id);
    expect(dispatchStart?.parent_span_id).toBe(stepStart?.span_id);
    expect(dispatchStart?.profile_id).toBe('mock-profile');
    expect(dispatchStart?.provider_id).toBe('mock');
  });

  it('keeps retry command, runtime, and dispatch logs on the caller trace with profile context', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));
    const first = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        profileId: 'mock-profile',
        prompt: '',
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: {
        surface: 'test',
        package: 'application',
        component: 'session',
      },
    });
    const result = await retryJob({
      jobId: first.value.id,
      logger,
    });

    expect(result.ok).toBe(true);
    const commandStart = sink.records.find((record) => record.event === 'command.retry.start');
    const runtimeStart = sink.records.find((record) => record.event === 'runtime.job.start');
    const stepStart = sink.records.find((record) => record.event === 'runner.step.start');
    const dispatchStart = sink.records.find((record) => record.event === 'dispatch.provider.start');
    expect(commandStart?.profile_id).toBe('mock-profile');
    expect(runtimeStart?.trace_id).toBe(commandStart?.trace_id);
    expect(dispatchStart?.trace_id).toBe(commandStart?.trace_id);
    expect(runtimeStart?.parent_span_id).toBe(commandStart?.span_id);
    expect(stepStart?.parent_span_id).toBe(runtimeStart?.span_id);
    expect(dispatchStart?.parent_span_id).toBe(stepStart?.span_id);
    expect(dispatchStart?.profile_id).toBe('mock-profile');
    expect(dispatchStart?.provider_id).toBe('mock');
  });

  it('updates an existing running task to terminal state with materialized output refs', async () => {
    _resetForTesting();
    const jobs: DurableJobRecord[] = [];
    const tasks: TaskRecord[] = [{
      schemaVersion: 1,
      taskId: 'task-1',
      status: 'running',
      operation: 'text-to-image',
      prompt: 'simple blue square icon',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      execution: {
        profileId: 'mock-profile',
        profileName: 'Mock Profile',
      },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    }];
    setJobHistoryStore(createJobHistoryStore(jobs));
    setTaskStore(createTaskStore(tasks));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        __clientTaskId: 'task-1',
        provider: 'mock',
        profileId: 'mock-profile',
        prompt: 'simple blue square icon',
        output: { count: 1 },
      },
    });

    expect(result.ok).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: 'task-1',
      status: 'completed',
      executionJobId: result.ok ? result.value.id : '',
      outputs: [{
        outputId: 'task-1:output:0',
        index: 0,
        kind: 'image',
        asset: { ref: { kind: 'hostObject', mimeType: 'image/png' } },
        source: { providerAssetKind: 'storedRef' },
      }],
      execution: {
        profileId: 'mock-profile',
        profileName: 'Mock Profile',
        output: { count: 1 },
      },
    });
    expect(tasks[0].finishedAt).toBeDefined();
    expect(JSON.stringify(tasks[0])).not.toContain('providerOptions');
    expect(JSON.stringify(tasks[0])).not.toContain('mock-key');
  });

  it('reconciles stale running task records as interrupted without mutating read semantics', async () => {
    _resetForTesting();
    const tasks: TaskRecord[] = [{
      schemaVersion: 1,
      taskId: 'running-task',
      status: 'running',
      operation: 'text-to-image',
      prompt: 'pending before restart',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    }];
    setTaskStore(createTaskStore(tasks));

    await expect(getTaskRecord('running-task')).resolves.toMatchObject({
      taskId: 'running-task',
      status: 'running',
    });
    await expect(listTaskRecords({ status: 'running' })).resolves.toMatchObject([{ taskId: 'running-task' }]);
    await expect(reconcileStaleRunningTaskRecords([])).resolves.toMatchObject([{
      taskId: 'running-task',
      status: 'interrupted',
      error: { category: 'interrupted', message: 'App restarted before completion.' },
      outputs: [],
    }]);
    await expect(listTaskRecords({ status: 'running' })).resolves.toEqual([]);
    await expect(listTaskRecords({ status: 'interrupted' })).resolves.toMatchObject([{ taskId: 'running-task' }]);
  });

  it('keeps active running tasks untouched during stale-running reconciliation', async () => {
    _resetForTesting();
    const tasks: TaskRecord[] = [{
      schemaVersion: 1,
      taskId: 'active-task',
      status: 'running',
      operation: 'text-to-image',
      prompt: 'still active',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    }];
    setTaskStore(createTaskStore(tasks));

    await expect(reconcileStaleRunningTaskRecords(['active-task'])).resolves.toEqual([]);
    await expect(getTaskRecord('active-task')).resolves.toMatchObject({
      taskId: 'active-task',
      status: 'running',
    });
  });

  it('keeps input image bytes out of durable history while resolving hostObject refs for provider dispatch', async () => {
    _resetForTesting();
    const storedRef: StoredAssetRef = {
      kind: 'hostObject',
      ref: 'input-asset-1',
      name: 'input.png',
      mimeType: 'image/png',
      byteSize: 8,
    };
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));
    setAssetStore(createAssetStore({ ref: storedRef, bytes: new Uint8Array([1, 2, 3, 4]) }));
    setProviderProfileRepository(
      createProfileRepository({
        profileId: 'mock-profile',
        apiFormat: 'openai-images',
        displayName: 'Mock Profile',
        config: {
          apiFormat: 'openai-images',
          displayName: 'Mock Profile',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
          },
          defaultModel: 'gpt-image-2',
        },
        secretRefs: { apiKey: 'secret:mock' },
        enabled: true,
        selectedModelIds: ['gpt-image-2'],
        defaultModelId: 'gpt-image-2',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    setSecretStorageAdapter(createSecretStorage());
    mockOpenAiImagesFetch();

    const result = await submitJob({
      workflow: 'provider-edit',
      input: {
        profileId: 'mock-profile',
        prompt: 'edit stored image',
        images: [{ type: 'image', name: 'input.png', mimeType: 'image/png', storedRef }],
      },
    });

    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].input.images).toEqual([{ type: 'image', name: 'input.png', mimeType: 'image/png', storedRef }]);
    expect(JSON.stringify(records[0].input)).not.toContain('"0":1');
    if (!result.ok) {
      return;
    }
    const outputAssets = (result.value.output?.image as { assets?: Array<{ data?: unknown; storedRef?: unknown }> })?.assets ?? [];
    expect(outputAssets[0]?.data).toBeUndefined();
    expect(outputAssets[0]?.storedRef).toMatchObject({ kind: 'hostObject', mimeType: 'image/png' });
    expect(JSON.stringify(records[0])).not.toContain('"data"');
  });

  it('honors aborted submit signals before resolving provider input refs', async () => {
    _resetForTesting();
    const storedRef: StoredAssetRef = {
      kind: 'hostObject',
      ref: 'input-asset-1',
      name: 'input.png',
      mimeType: 'image/png',
      byteSize: 8,
    };
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));
    setAssetStore(createAssetStore({ ref: storedRef, bytes: new Uint8Array([1, 2, 3, 4]) }));
    setProviderProfileRepository(
      createProfileRepository({
        profileId: 'mock-profile',
        apiFormat: 'openai-images',
        displayName: 'Mock Profile',
        config: {
          apiFormat: 'openai-images',
          displayName: 'Mock Profile',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
          },
          defaultModel: 'gpt-image-2',
        },
        secretRefs: { apiKey: 'secret:mock' },
        enabled: true,
        selectedModelIds: ['gpt-image-2'],
        defaultModelId: 'gpt-image-2',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    setSecretStorageAdapter(createSecretStorage());
    const abortController = new AbortController();
    abortController.abort();

    const result = await submitJob({
      workflow: 'provider-edit',
      input: {
        profileId: 'mock-profile',
        prompt: 'edit stored image',
        images: [{ type: 'image', name: 'input.png', mimeType: 'image/png', storedRef }],
      },
      signal: abortController.signal,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error).toMatchObject({
        category: 'validation',
        message: 'Job submission was cancelled.',
      });
    }
    expect(records[0]?.input.images).toEqual([{ type: 'image', name: 'input.png', mimeType: 'image/png', storedRef }]);
    expect(JSON.stringify(records[0]?.input)).not.toContain('"data"');
  });

  it('rejects terminal history flush when job input contains secret values', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        secretValues: {
          apiKey: 'sk-live-secret',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('secret value');
    expect(records).toHaveLength(0);
  });

  it('flushes terminal retry results to durable history', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const first = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'missing-provider',
        prompt: 'will fail',
      },
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.status).toBe('failed');
    expect(records).toHaveLength(1);

    const retry = await retryJob(first.value.id);

    expect(retry.ok).toBe(true);
    if (!retry.ok) {
      return;
    }
    expect(retry.value.status).toBe('failed');
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      jobId: retry.value.id,
      status: 'failed',
      workflow: 'provider-generate',
      originJobId: first.value.id,
      retryAttempt: 1,
    });
  });
});
