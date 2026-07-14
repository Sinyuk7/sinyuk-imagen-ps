import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CommandResult,
  Job,
  JobEventHandler,
  ProviderProfile,
  SubmitJobInput,
  TaskRecord,
} from '../commands/types.js';
import { createImagenSession } from './session.js';
import {
  MAX_RUNNING_TASKS_GLOBAL,
  MAX_RUNNING_TASKS_PER_PROFILE,
} from './queue-policy.js';
import type { ImagenSessionCommands } from './types.js';

const NOW = '2026-07-14T00:00:00.000Z';

function profile(profileId: string, enabled = true): ProviderProfile {
  return {
    profileId,
    apiFormat: 'openai-images',
    displayName: profileId,
    enabled,
    config: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function taskRecord(taskId: string, profileId: string, prompt = taskId): TaskRecord {
  return {
    schemaVersion: 1,
    taskId,
    status: 'running',
    operation: 'text-to-image',
    prompt,
    attachments: [],
    outputs: [],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    execution: { profileId },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function request(taskId: string, profileId: string, prompt = taskId): SubmitJobInput {
  return {
    workflow: 'provider-generate',
    input: {
      __clientRoundId: taskId,
      __clientTaskId: taskId,
      profileId,
      prompt,
      providerOptions: { model: 'model-1' },
      output: { count: 1, selection: { geometry: { kind: 'auto' } } },
    },
    taskRecord: taskRecord(taskId, profileId, prompt),
  };
}

function jobFor(input: SubmitJobInput, status: Job['status'] = 'completed'): Job {
  return {
    id: `job-${String(input.input.__clientTaskId)}`,
    status,
    input: { ...input.input, _workflowName: input.workflow },
    output: status === 'completed' ? { image: { assets: [] } } : undefined,
    error: status === 'failed' ? { category: 'runtime', message: 'failed' } : undefined,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface PendingDispatch {
  readonly input: SubmitJobInput;
  readonly resolve: (result: CommandResult<Job>) => void;
  readonly reject: (error: unknown) => void;
}

function createHarness() {
  const listeners = new Set<JobEventHandler>();
  const profiles = new Map<string, ProviderProfile>();
  const records = new Map<string, TaskRecord>();
  const started: SubmitJobInput[] = [];
  const pending: PendingDispatch[] = [];
  let immediateFailure: CommandResult<Job> | undefined;

  const commands: ImagenSessionCommands = {
    submitJob: vi.fn((input: SubmitJobInput) => {
      started.push(input);
      if (immediateFailure !== undefined) return Promise.resolve(immediateFailure);
      const created = jobFor(input, 'created');
      return Promise.resolve(input.onJobCreated?.(created)).then(() => {
        for (const listener of listeners) listener({ type: 'created', job: created });
        return new Promise<CommandResult<Job>>((resolve, reject) => pending.push({ input, resolve, reject }));
      });
    }),
    retryJob: vi.fn(async () => ({ ok: true as const, value: jobFor(request('retry', 'a')) })),
    getJob: vi.fn(() => undefined),
    subscribeJobEvents(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async putTaskRecord(record) {
      records.set(record.taskId, record);
    },
    async getProviderProfile(profileId) {
      const value = profiles.get(profileId);
      return value
        ? { ok: true, value }
        : { ok: false, error: { category: 'validation', message: 'missing profile' } };
    },
  };

  return {
    commands,
    profiles,
    records,
    started,
    pending,
    failNext(error: CommandResult<Job>) {
      immediateFailure = error;
    },
    complete(taskId: string) {
      const dispatch = pending.find((item) => item.input.input.__clientTaskId === taskId);
      if (!dispatch) throw new Error(`Pending dispatch "${taskId}" not found.`);
      const job = jobFor(dispatch.input);
      for (const listener of listeners) listener({ type: 'completed', job });
      dispatch.resolve({ ok: true, value: job });
    },
  };
}

async function runScheduler(): Promise<void> {
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('session task queue', () => {
  it('validates before admission and resolves acknowledgement before dispatch', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    const session = createImagenSession({ commands: harness.commands });

    const invalid = await session.submitJob({
      workflow: 'provider-generate',
      input: { __clientTaskId: 'invalid', profileId: 'a', prompt: ' ' },
    });
    expect(invalid.ok).toBe(false);
    expect(session.getSnapshot().queuedTasks).toEqual([]);
    expect(harness.records.size).toBe(0);

    const missingTaskEvidence = await session.submitJob({
      workflow: 'provider-generate',
      input: { __clientTaskId: 'missing-task-record', profileId: 'a', prompt: 'valid prompt' },
    });
    expect(missingTaskEvidence).toMatchObject({ ok: false, error: { category: 'validation' } });
    expect(harness.started).toHaveLength(0);

    const acknowledgement = await session.submitJob(request('task-1', 'a'));
    expect(acknowledgement).toEqual({ ok: true, value: { taskId: 'task-1', status: 'queued' } });
    expect(harness.started).toHaveLength(0);
    expect(session.getSnapshot().queuedTasks).toMatchObject([{ taskId: 'task-1', status: 'queued', removable: true }]);

    await runScheduler();
    expect(harness.started).toHaveLength(1);
    expect(harness.records.get('task-1')).toMatchObject({ status: 'running', executionJobId: 'job-task-1' });
    expect(session.getSnapshot().jobs).toMatchObject([{ taskId: 'task-1', id: 'job-task-1', status: 'created' }]);
    expect(session.getSnapshot().queuedTasks).toEqual([]);
  });

  it('freezes nested request data at admission', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    const session = createImagenSession({ commands: harness.commands });
    const input = request('frozen', 'a', 'original');

    await session.submitJob(input);
    (input.input.providerOptions as { model: string }).model = 'mutated';
    ((input.input.output as { selection: { geometry: { kind: string } } }).selection.geometry).kind = 'square';
    await runScheduler();

    expect(harness.started[0].input.providerOptions).toEqual({ model: 'model-1' });
    expect(harness.started[0].input.output).toEqual({ count: 1, selection: { geometry: { kind: 'auto' } } });
  });

  it('uses earliest eligible FIFO work under global and per-profile limits', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    for (const id of ['a', 'b', 'c']) harness.profiles.set(id, profile(id));
    const session = createImagenSession({ commands: harness.commands });
    const queued = [
      request('a1', 'a'), request('a2', 'a'), request('a3', 'a'),
      request('b1', 'b'), request('b2', 'b'), request('c1', 'c'),
    ];
    await Promise.all(queued.map((input) => session.submitJob(input)));
    await runScheduler();

    expect(MAX_RUNNING_TASKS_GLOBAL).toBe(5);
    expect(MAX_RUNNING_TASKS_PER_PROFILE).toBe(2);
    expect(harness.started.map((input) => input.input.__clientTaskId)).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
    expect(session.getSnapshot().queuedTasks).toMatchObject([{ taskId: 'a3', status: 'queued' }]);

    harness.complete('a1');
    await runScheduler();
    expect(harness.started.map((input) => input.input.__clientTaskId)).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'a3']);
  });

  it('removes queued tasks before dispatch and leaves an empty queue idle', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    const session = createImagenSession({ commands: harness.commands });
    await session.submitJob(request('remove-1', 'a'));
    await session.submitJob(request('remove-2', 'a'));

    expect(session.removeQueuedTask('remove-1')).toBe(true);
    expect(session.removeQueuedTask('remove-2')).toBe(true);
    expect(session.removeQueuedTask('remove-2')).toBe(false);
    await runScheduler();

    expect(harness.started).toEqual([]);
    expect(harness.records.size).toBe(0);
    expect(session.getSnapshot().queuedTasks).toEqual([]);
  });

  it('flushes a failed task record when dispatch returns an error', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    harness.failNext({ ok: false, error: { category: 'runtime', message: 'dispatch failed' } });
    const session = createImagenSession({ commands: harness.commands });
    await session.submitJob(request('failure', 'a'));
    await runScheduler();

    expect(harness.records.get('failure')).toMatchObject({
      taskId: 'failure',
      status: 'failed',
      error: { category: 'runtime', message: 'dispatch failed' },
    });
    expect(session.getSnapshot().queuedTasks).toEqual([]);
    expect(session.getSnapshot().jobs).toMatchObject([{ taskId: 'failure', status: 'failed' }]);
  });

  it('flushes a failed task record when dispatch rejects', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    const session = createImagenSession({ commands: harness.commands });
    await session.submitJob(request('rejected', 'a'));
    await runScheduler();
    harness.pending[0].reject(new Error('command rejected'));
    await runScheduler();

    expect(harness.records.get('rejected')).toMatchObject({
      taskId: 'rejected',
      status: 'failed',
      error: { category: 'runtime', message: 'command rejected' },
    });
    expect(session.getSnapshot().jobs).toMatchObject([{ taskId: 'rejected', status: 'failed' }]);
  });

  it('keeps tasks queued when their profile is deleted or disabled', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    harness.profiles.set('b', profile('b'));
    const session = createImagenSession({ commands: harness.commands });
    await session.submitJob(request('blocked', 'a'));
    await session.submitJob(request('deleted', 'b'));
    harness.profiles.set('a', profile('a', false));
    harness.profiles.delete('b');
    await runScheduler();

    expect(harness.started).toEqual([]);
    expect(harness.records.size).toBe(0);
    expect(session.getSnapshot().queuedTasks).toMatchObject([
      { taskId: 'blocked', status: 'queued', removable: true },
      { taskId: 'deleted', status: 'queued', removable: true },
    ]);
  });

  it('drops queued-only work when the session is disposed and recreated', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.profiles.set('a', profile('a'));
    const session = createImagenSession({ commands: harness.commands });
    await session.submitJob(request('reload-drop', 'a'));
    expect(session.getSnapshot().queuedTasks).toHaveLength(1);

    session.dispose();
    const reloaded = createImagenSession({ commands: harness.commands });
    expect(reloaded.getSnapshot()).toEqual({ jobs: [], queuedTasks: [] });
    expect(harness.records.size).toBe(0);
  });
});
