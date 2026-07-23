import {
  createRuntime,
  type ExecutionAdapter,
  type Job,
  type JobEvent,
  type Runtime,
  type Workflow,
} from '@imagen-ps/core-engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecuteJobInput } from './commands/execute-job.js';
import type { CommandResult } from './commands/types.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  ReadinessDecision,
} from './generation/types.js';
import { createImagenSession } from './session/session.js';
import { MAX_RUNNING_TASKS_GLOBAL } from './session/queue-policy.js';
import type { ImagenSessionCommands } from './session/types.js';
import { TASK_RECORD_SCHEMA_VERSION, type TaskRecord } from './task.js';

const NOW = '2026-07-18T00:00:00.000Z';
const BACKEND_ID = 'local-render';

const workflow: Workflow = {
  name: 'local-render',
  version: '1',
  steps: [{
    name: 'render',
    kind: 'execution',
    adapter: 'local-render',
    input: { taskId: '${taskId}' },
    outputKey: 'result',
  }],
};

function runningTask(taskId: string): TaskRecord {
  return {
    schemaVersion: TASK_RECORD_SCHEMA_VERSION,
    taskId,
    status: 'running',
    operation: 'text-to-image',
    prompt: taskId,
    attachments: [],
    outputs: [],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    execution: { backend: { id: BACKEND_ID, label: 'Local Render' } },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function command(taskId: string, laneKey?: string): GenerationCommand {
  return {
    taskId,
    backendId: BACKEND_ID,
    payload: {
      runningTask: runningTask(taskId),
      ...(laneKey !== undefined ? { laneKey } : {}),
      nested: { value: 'before' },
    },
  };
}

function admitted(command: GenerationCommand): AdmittedGeneration {
  const laneKey = typeof command.payload.laneKey === 'string' ? command.payload.laneKey : undefined;
  return {
    taskId: command.taskId,
    backendId: BACKEND_ID,
    execution: { workflow: workflow.name, input: { taskId: command.taskId } },
    runningTask: command.payload.runningTask as TaskRecord,
    ...(laneKey !== undefined ? { lane: { key: laneKey, maxConcurrency: 2 } } : {}),
    retry: { allowed: true },
  };
}

interface PendingExecution {
  readonly taskId: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

function createHarness() {
  const pending: PendingExecution[] = [];
  const started: string[] = [];
  const tasks = new Map<string, TaskRecord>();
  const readiness = new Map<string, ReadinessDecision>();
  const order: string[] = [];
  let projectFails = false;
  let followUpFails = false;
  let terminalPersistFails = false;

  const adapter: ExecutionAdapter = {
    adapter: 'local-render',
    async dispatch(params) {
      const taskId = String(params.taskId);
      started.push(taskId);
      return new Promise((resolve, reject) => pending.push({ taskId, resolve, reject }));
    },
  };
  const runtime: Runtime = createRuntime({ initialWorkflows: [workflow], adapters: [adapter] });
  const projectTerminal = vi.fn(async ({ job, runningTask }: Parameters<GenerationBackend['projectTerminal']>[0]) => {
    order.push('project');
    if (projectFails) throw new Error('project failed');
    const base = {
      ...runningTask,
      latestJobId: job.id,
      updatedAt: job.updatedAt,
      finishedAt: job.updatedAt,
    };
    return job.status === 'completed'
      ? { ...base, status: 'completed' as const, outputs: [] }
      : {
          ...base,
          status: 'failed' as const,
          outputs: [],
          error: {
            category: job.error?.category ?? 'execution',
            message: job.error?.message ?? 'failed',
          },
        };
  });
  const afterTerminal = vi.fn(async () => {
    order.push('follow-up');
    if (followUpFails) throw new Error('follow-up failed');
  });
  const backend: GenerationBackend = {
    id: BACKEND_ID,
    async admit(input) {
      return admitted(input);
    },
    async checkReadiness(input) {
      return readiness.get(input.taskId) ?? { status: 'ready' };
    },
    projectTerminal,
    async retry({ task }) {
      return admitted(command(task.taskId));
    },
    afterTerminal,
  };
  const commands: ImagenSessionCommands = {
    async executeJob(input: ExecuteJobInput): Promise<CommandResult<Job>> {
      try {
        const job = await runtime.runWorkflow(input.execution.workflow, input.execution.input, {
          ...(input.onJobCreated !== undefined ? { onJobCreated: input.onJobCreated } : {}),
          ...(input.signal !== undefined ? { signal: input.signal } : {}),
          ...(input.logger !== undefined ? { logger: input.logger } : {}),
          ...(input.originJobId !== undefined && input.retryAttempt !== undefined
            ? { attempt: { originJobId: input.originJobId, retryAttempt: input.retryAttempt } }
            : {}),
        });
        return { ok: true, value: job };
      } catch (error) {
        return {
          ok: false,
          error: { category: 'runtime', message: error instanceof Error ? error.message : 'execute failed' },
        };
      }
    },
    getJob(jobId) {
      return runtime.store.getJob(jobId);
    },
    subscribeJobEvents(handler: (event: JobEvent) => void) {
      return runtime.events.onAny(handler);
    },
    async putTaskRecord(record) {
      order.push(record.status === 'running' ? 'persist-running' : 'persist-terminal');
      if (record.status !== 'running' && terminalPersistFails) throw new Error('terminal persistence failed');
      tasks.set(record.taskId, record);
    },
    async getTaskRecord(taskId) {
      return tasks.get(taskId);
    },
  };

  return {
    backend,
    commands,
    pending,
    started,
    tasks,
    readiness,
    order,
    projectTerminal,
    afterTerminal,
    setProjectFails(value: boolean) { projectFails = value; },
    setFollowUpFails(value: boolean) { followUpFails = value; },
    setTerminalPersistFails(value: boolean) { terminalPersistFails = value; },
    complete(taskId: string) {
      const index = pending.findIndex((item) => item.taskId === taskId);
      if (index === -1) throw new Error(`Pending execution "${taskId}" not found.`);
      const [execution] = pending.splice(index, 1);
      execution.resolve({ assets: [] });
    },
    fail(taskId: string, error: unknown = { category: 'execution', message: 'local render failed' }) {
      const index = pending.findIndex((item) => item.taskId === taskId);
      if (index === -1) throw new Error(`Pending execution "${taskId}" not found.`);
      const [execution] = pending.splice(index, 1);
      execution.reject(error);
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

describe('backend-neutral Session contract', () => {
  it('freezes admission, acknowledges before dispatch, then correlates Job and running Task', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    const input = command('task-a', 'lane-a');

    const result = await session.submitJob(input);
    (input.payload.nested as { value: string }).value = 'after';

    expect(result).toEqual({ ok: true, value: { taskId: 'task-a', status: 'queued' } });
    expect(harness.started).toEqual([]);
    expect(session.getSnapshot().queuedTasks).toMatchObject([{ taskId: 'task-a', status: 'queued' }]);

    await runScheduler();
    expect(harness.started).toEqual(['task-a']);
    expect(harness.tasks.get('task-a')).toMatchObject({ status: 'running', latestJobId: expect.any(String) });
    expect(JSON.stringify(session.getSnapshot())).not.toContain('__client');
  });

  it('uses earliest eligible FIFO under global and declared lane caps', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    const inputs = [
      command('a1', 'a'), command('a2', 'a'), command('a3', 'a'),
      command('b1', 'b'), command('b2', 'b'), command('free'),
    ];
    await Promise.all(inputs.map((input) => session.submitJob(input)));
    await runScheduler();

    expect(MAX_RUNNING_TASKS_GLOBAL).toBe(5);
    expect(harness.started).toEqual(['a1', 'a2', 'b1', 'b2', 'free']);
    expect(session.getSnapshot().queuedTasks).toMatchObject([{ taskId: 'a3', status: 'queued' }]);

    harness.complete('a1');
    await runScheduler();
    expect(harness.started).toEqual(['a1', 'a2', 'b1', 'b2', 'free', 'a3']);
  });

  it('deduplicates same-tick submit and removes queued-only work', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });

    const [first, second] = await Promise.all([
      session.submitJob(command('same')),
      session.submitJob(command('same')),
    ]);
    expect(first).toEqual(second);
    expect(session.getSnapshot().queuedTasks).toHaveLength(1);
    expect(session.removeQueuedTask('same')).toBe(true);
    await runScheduler();
    expect(harness.started).toEqual([]);
    expect(harness.tasks.size).toBe(0);
  });

  it('rechecks wait on a later wake and rejects without creating Job, Task, or execution', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.readiness.set('waiting', {
      status: 'wait',
      reason: { category: 'validation', message: 'not ready' },
    });
    harness.readiness.set('rejected', {
      status: 'reject',
      error: { category: 'validation', message: 'rejected' },
    });
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('waiting'));
    await session.submitJob(command('rejected'));
    await runScheduler();

    expect(harness.started).toEqual([]);
    expect(harness.tasks.size).toBe(0);
    expect(session.getSnapshot().jobs).toMatchObject([{ taskId: 'rejected', status: 'failed' }]);
    expect(session.getSnapshot().queuedTasks).toMatchObject([{ taskId: 'waiting', status: 'queued' }]);

    harness.readiness.set('waiting', { status: 'ready' });
    await session.submitJob(command('wake'));
    await runScheduler();
    expect(harness.started).toEqual(['waiting', 'wake']);
  });

  it('runs terminal projection, persistence, and follow-up once in order', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('terminal'));
    await runScheduler();
    harness.complete('terminal');
    await runScheduler();

    expect(harness.tasks.get('terminal')).toMatchObject({ status: 'completed', latestJobId: expect.any(String) });
    expect(harness.projectTerminal).toHaveBeenCalledOnce();
    expect(harness.afterTerminal).toHaveBeenCalledOnce();
    expect(harness.order).toEqual(['persist-running', 'project', 'persist-terminal', 'follow-up']);
  });

  it('persists bounded failed Task on projection failure and ignores follow-up failure', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.setProjectFails(true);
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('fallback'));
    await runScheduler();
    harness.complete('fallback');
    await runScheduler();
    expect(harness.tasks.get('fallback')).toMatchObject({
      status: 'failed',
      error: { category: 'execution', message: 'Terminal projection failed.' },
    });

    harness.setProjectFails(false);
    harness.setFollowUpFails(true);
    await session.submitJob(command('follow-up'));
    await runScheduler();
    harness.complete('follow-up');
    await runScheduler();
    expect(harness.tasks.get('follow-up')?.status).toBe('completed');
  });

  it('publishes a failed snapshot when terminal Task persistence fails', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.setTerminalPersistFails(true);
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('persist-failure'));
    await runScheduler();
    harness.complete('persist-failure');
    await runScheduler();

    expect(session.getSnapshot()).toMatchObject({
      jobs: [{
        taskId: 'persist-failure',
        status: 'failed',
        canRetry: false,
        error: { category: 'runtime', message: 'Terminal Task persistence failed.' },
      }],
      lastError: { category: 'runtime', message: 'Terminal Task persistence failed.' },
    });
  });

  it('Retry keeps Task identity and creates a new Job attempt', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('retry-task'));
    await runScheduler();
    const firstJobId = harness.tasks.get('retry-task')?.latestJobId;
    harness.fail('retry-task');
    await runScheduler();
    expect(harness.tasks.get('retry-task')?.status).toBe('failed');

    const retry = session.retryJob(firstJobId!);
    await runScheduler();
    const secondJobId = harness.tasks.get('retry-task')?.latestJobId;
    expect(secondJobId).not.toBe(firstJobId);
    harness.complete('retry-task');
    await runScheduler();
    await expect(retry).resolves.toMatchObject({ ok: true, value: { id: secondJobId } });
    await expect(retry).resolves.toMatchObject({
      ok: true,
      value: { originJobId: firstJobId, retryAttempt: 1 },
    });
    expect(harness.tasks.get('retry-task')).toMatchObject({ status: 'completed', latestJobId: secondJobId });
  });

  it('hides generic Retry when execution disposition requires a new Task', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('unknown-submit'));
    await runScheduler();
    const jobId = harness.tasks.get('unknown-submit')?.latestJobId;
    harness.fail('unknown-submit', {
      category: 'execution',
      message: 'remote state is unknown',
      details: {
        retryDisposition: 'new-task-only',
        remoteMayContinue: true,
      },
    });
    await runScheduler();

    expect(session.getSnapshot().jobs.find((job) => job.id === jobId)).toMatchObject({
      status: 'failed',
      canRetry: false,
    });
    await expect(session.retryJob(jobId!)).resolves.toMatchObject({
      ok: false,
      error: { category: 'validation' },
    });
  });

  it('Regenerate uses a new Task identity and a new Job', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('original-task'));
    await runScheduler();
    const originalJobId = harness.tasks.get('original-task')?.latestJobId;
    harness.complete('original-task');
    await runScheduler();

    await session.submitJob(command('regenerated-task'));
    await runScheduler();
    const regeneratedJobId = harness.tasks.get('regenerated-task')?.latestJobId;

    expect(regeneratedJobId).toBeTruthy();
    expect(regeneratedJobId).not.toBe(originalJobId);
    expect(harness.tasks.has('original-task')).toBe(true);
    expect(harness.tasks.has('regenerated-task')).toBe(true);
  });

  it('drops queued-only work on dispose and starts a recreated Session empty', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const session = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    await session.submitJob(command('reload-drop'));
    session.dispose();

    const reloaded = createImagenSession({ backends: [harness.backend], commands: harness.commands });
    expect(reloaded.getSnapshot()).toEqual({ jobs: [], queuedTasks: [] });
    expect(harness.tasks.size).toBe(0);
    reloaded.dispose();
  });
});
