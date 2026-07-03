import { describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import type {
  Job,
  JobEvent,
  JobEventHandler,
  RetryJobInput,
  SubmitJobInput,
  Unsubscribe,
} from '../commands/types.js';
import { createImagenSession } from './session.js';
import type { ImagenSessionCommands, ImagenSessionSnapshot } from './types.js';

function createJob(overrides: Partial<Job> & Pick<Job, 'id' | 'status' | 'input'>): Job {
  const now = '2026-06-16T00:00:00.000Z';
  return {
    output: undefined,
    error: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createCommands(): {
  readonly commands: ImagenSessionCommands;
  readonly emit: (event: JobEvent) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<JobEventHandler>();
  const unsubscribe = vi.fn();

  return {
    commands: {
      async submitJob(input: SubmitJobInput) {
        return {
          ok: true,
          value: createJob({
            id: 'job-completed',
            status: 'completed',
            input: {
              ...input.input,
              _workflowName: input.workflow,
            },
            output: {
              image: {
                assets: [],
              },
            },
          }),
        };
      },
      async retryJob(input: RetryJobInput) {
        return {
          ok: true,
          value: createJob({
            id: 'job-retry',
            status: 'running',
            input: {
              _workflowName: 'provider-generate',
              originJobId: input.jobId,
            },
          }),
        };
      },
      getJob(jobId: string) {
        return createJob({
          id: jobId,
          status: 'running',
          input: { _workflowName: 'provider-generate' },
        });
      },
      subscribeJobEvents(handler: JobEventHandler): Unsubscribe {
        listeners.add(handler);
        return () => {
          listeners.delete(handler);
          unsubscribe();
        };
      },
    },
    emit(event: JobEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    unsubscribe,
  };
}

describe('createImagenSession', () => {
  it('publishes an initial snapshot and projects completed submit results', async () => {
    const { commands } = createCommands();
    const session = createImagenSession({ commands });
    const snapshots: ImagenSessionSnapshot[] = [];

    session.subscribe((snapshot) => snapshots.push(snapshot));

    expect(snapshots).toEqual([{ jobs: [] }]);

    const result = await session.submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      },
    });

    expect(result.ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      selectedProfileId: 'mock-profile',
      selectedModelId: 'mock-image-v1',
      jobs: [
        {
          id: 'job-completed',
          type: 'generate',
          status: 'completed',
          phase: 'completed',
          canRetry: false,
          canCancel: false,
        },
      ],
    });
    expect(session.getSnapshot().activeJobId).toBeUndefined();
    expect(snapshots).toHaveLength(2);
  });

  it('passes one submit trace and profile context through session and command logs', async () => {
    const sink = createMemorySink();
    const session = createImagenSession({
      commands: {
        async submitJob(input: SubmitJobInput) {
          const logger = input.logger!.child({
            package: 'application',
            component: 'command',
            workflow: input.workflow,
            profile_id: String(input.input.profileId),
          });
          logger.startSpan('command.submit').finish();
          return {
            ok: true,
            value: createJob({
              id: 'job-completed',
              status: 'completed',
              input: {
                ...input.input,
                _workflowName: input.workflow,
              },
            }),
          };
        },
        async retryJob(input: RetryJobInput) {
          return {
            ok: true,
            value: createJob({ id: input.jobId, status: 'running', input: { _workflowName: 'provider-generate' } }),
          };
        },
        getJob() {
          return undefined;
        },
        subscribeJobEvents() {
          return () => undefined;
        },
      },
      logger: createLogger({
        sink,
        context: {
          surface: 'test',
          package: 'application',
          component: 'runtime',
        },
      }),
    });

    const result = await session.submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-profile',
        prompt: 'make an image',
      },
    });

    expect(result.ok).toBe(true);
    const sessionStart = sink.records.find((record) => record.event === 'session.command.submit.start');
    const commandStart = sink.records.find((record) => record.event === 'command.submit.start');
    expect(commandStart?.trace_id).toBe(sessionStart?.trace_id);
    expect(commandStart?.parent_span_id).toBe(sessionStart?.span_id);
    expect(commandStart?.profile_id).toBe('mock-profile');
  });

  it('passes one retry trace through session and command logs', async () => {
    const sink = createMemorySink();
    const session = createImagenSession({
      commands: {
        async submitJob(input: SubmitJobInput) {
          return {
            ok: true,
            value: createJob({
              id: 'job-completed',
              status: 'completed',
              input: {
                ...input.input,
                _workflowName: input.workflow,
              },
            }),
          };
        },
        async retryJob(input: RetryJobInput) {
          const logger = input.logger!.child({
            package: 'application',
            component: 'command',
            workflow: 'provider-generate',
            profile_id: 'mock-profile',
          });
          logger.startSpan('command.retry', { job_id: input.jobId }).finish();
          return {
            ok: true,
            value: createJob({
              id: 'job-retry',
              status: 'completed',
              input: {
                _workflowName: 'provider-generate',
                profileId: 'mock-profile',
                originJobId: input.jobId,
              },
            }),
          };
        },
        getJob() {
          return undefined;
        },
        subscribeJobEvents() {
          return () => undefined;
        },
      },
      logger: createLogger({
        sink,
        context: {
          surface: 'test',
          package: 'application',
          component: 'runtime',
        },
      }),
    });

    const result = await session.retryJob('failed-job');

    expect(result.ok).toBe(true);
    const sessionStart = sink.records.find((record) => record.event === 'session.command.retry.start');
    const commandStart = sink.records.find((record) => record.event === 'command.retry.start');
    expect(commandStart?.trace_id).toBe(sessionStart?.trace_id);
    expect(commandStart?.parent_span_id).toBe(sessionStart?.span_id);
    expect(commandStart?.profile_id).toBe('mock-profile');
  });

  it('passes submit abort signal through to the command layer without storing it in job input', async () => {
    let received: SubmitJobInput | undefined;
    const abortController = new AbortController();
    const { commands } = createCommands();
    const session = createImagenSession({
      commands: {
        ...commands,
        async submitJob(input: SubmitJobInput) {
          received = input;
          return commands.submitJob(input);
        },
      },
    });

    const result = await session.submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-profile',
        prompt: 'make an image',
      },
      signal: abortController.signal,
    });

    expect(result.ok).toBe(true);
    expect(received?.signal).toBe(abortController.signal);
    expect(result.ok ? result.value.input : {}).not.toHaveProperty('signal');
  });

  it('projects lifecycle events and failed job errors without inventing cancel support', () => {
    const { commands, emit, unsubscribe } = createCommands();
    const session = createImagenSession({ commands });

    emit({
      type: 'running',
      job: createJob({
        id: 'job-running',
        status: 'running',
        input: {
          _workflowName: 'provider-edit',
          providerProfileId: 'edit-profile',
        },
      }),
    });

    expect(session.getSnapshot()).toMatchObject({
      selectedProfileId: 'edit-profile',
      activeJobId: 'job-running',
      jobs: [
        {
          id: 'job-running',
          type: 'edit',
          status: 'running',
          phase: 'running',
          canRetry: false,
          canCancel: false,
        },
      ],
    });

    emit({
      type: 'failed',
      job: createJob({
        id: 'job-running',
        status: 'failed',
        input: {
          _workflowName: 'provider-edit',
          providerProfileId: 'edit-profile',
        },
        error: {
          category: 'runtime',
          message: 'failed job',
        },
      }),
    });

    expect(session.getSnapshot()).toMatchObject({
      lastError: {
        category: 'runtime',
        message: 'failed job',
      },
      jobs: [
        {
          id: 'job-running',
          type: 'edit',
          status: 'failed',
          canRetry: true,
          canCancel: false,
        },
      ],
    });
    expect(session.getSnapshot().activeJobId).toBeUndefined();

    session.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

/**
 * Deferred + counting commands harness：用于 in-flight 去重测试。
 *
 * 复用 createCommands() 的 Set<JobEventHandler> 监听器模式。retryJob 每次（若被调用）
 * mint 一个不同的 id（`job-retry-${retryCalls}`），使得「新建 Job 数」可观测。
 * submitJob 同理按调用序号 mint。deferred 统一以 `{ ok:true, value: Job }` 形态 resolve，
 * 便于在 command 内构造 `{ ok:true, value: failedJob }`（failure-as-success）路径。
 */
type DeferredJobResult = { readonly ok: true; readonly value: Job };

function createDeferredCommands(): {
  readonly commands: ImagenSessionCommands;
  readonly counts: { submitCalls: number; retryCalls: number };
  readonly distinctRetryJobIds: string[];
  readonly distinctSubmitJobIds: string[];
  readonly retryThrows: { value: boolean };
  readonly retryDeferred: {
    readonly promise: Promise<DeferredJobResult>;
    resolve: (value: DeferredJobResult) => void;
    reject: (error: unknown) => void;
  };
  readonly submitDeferred: {
    readonly promise: Promise<DeferredJobResult>;
    resolve: (value: DeferredJobResult) => void;
    reject: (error: unknown) => void;
  };
  readonly emit: (event: JobEvent) => void;
} {
  const listeners = new Set<JobEventHandler>();
  const counts = { submitCalls: 0, retryCalls: 0 };
  const distinctRetryJobIds: string[] = [];
  const distinctSubmitJobIds: string[] = [];
  const retryThrows = { value: false };

  let resolveRetry!: (value: DeferredJobResult) => void;
  let rejectRetry!: (error: unknown) => void;
  const retryPromise = new Promise<DeferredJobResult>((resolve, reject) => {
    resolveRetry = resolve;
    rejectRetry = reject;
  });

  let resolveSubmit!: (value: DeferredJobResult) => void;
  let rejectSubmit!: (error: unknown) => void;
  const submitPromise = new Promise<DeferredJobResult>((resolve, reject) => {
    resolveSubmit = resolve;
    rejectSubmit = reject;
  });

  const commands: ImagenSessionCommands = {
    async submitJob(input: SubmitJobInput) {
      counts.submitCalls += 1;
      const id = `job-submit-${counts.submitCalls}`;
      distinctSubmitJobIds.push(id);
      const base = await submitPromise;
      return {
        ok: true,
        value: { ...base.value, id, input: { ...base.value.input, ...input.input } } as Job,
      };
    },
    async retryJob(input: RetryJobInput) {
      counts.retryCalls += 1;
      const id = `job-retry-${counts.retryCalls}`;
      distinctRetryJobIds.push(id);
      if (retryThrows.value) {
        throw new Error('command boom');
      }
      const base = await retryPromise;
      return {
        ok: true,
        value: {
          ...base.value,
          id,
          input: { ...base.value.input, originJobId: input.jobId, _workflowName: 'provider-generate' } as Job['input'],
        } as Job,
      };
    },
    getJob(jobId: string) {
      return createJob({
        id: jobId,
        status: 'failed',
        input: { _workflowName: 'provider-generate' },
      });
    },
    subscribeJobEvents(handler: JobEventHandler): Unsubscribe {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };

  return {
    commands,
    counts,
    distinctRetryJobIds,
    distinctSubmitJobIds,
    retryThrows,
    retryDeferred: { promise: retryPromise, resolve: resolveRetry, reject: rejectRetry },
    submitDeferred: { promise: submitPromise, resolve: resolveSubmit, reject: rejectSubmit },
    emit(event: JobEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function completedJobResult(id: string): DeferredJobResult {
  return {
    ok: true,
    value: createJob({
      id,
      status: 'completed',
      input: { _workflowName: 'provider-generate' },
      output: { image: { assets: [] } },
    }),
  };
}

function failedJobResult(id: string): DeferredJobResult {
  return {
    ok: true,
    value: createJob({
      id,
      status: 'failed',
      input: { _workflowName: 'provider-generate' },
      error: { category: 'provider', message: 'failed' },
    }),
  };
}

describe('createImagenSession in-flight dedup', () => {
  it('5 concurrent retries of one failed job share a single command call / new job', async () => {
    const { commands, counts, distinctRetryJobIds, retryDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const attempts = Array.from({ length: 5 }, () => session.retryJob('failed-1'));
    // 仅第 1 次穿透到 command；其余 4 次复用同一 in-flight promise。
    expect(counts.retryCalls).toBe(1);
    expect(distinctRetryJobIds).toHaveLength(1);

    retryDeferred.resolve(completedJobResult('job-retry-1'));
    const results = await Promise.all(attempts);

    expect(counts.retryCalls).toBe(1);
    expect(results).toHaveLength(5);
    // 5 次意图都拿到同一个新 Job id。
    const ids = results.map((result) => (result.ok ? result.value.id : ''));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe('job-retry-1');
  });

  it('reuses the in-flight promise while retry is pending (deferred resolved once)', async () => {
    const { commands, counts, retryDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const first = session.retryJob('failed-1');
    const second = session.retryJob('failed-1');
    expect(counts.retryCalls).toBe(1);

    retryDeferred.resolve(completedJobResult('job-retry-1'));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (firstResult.ok && secondResult.ok) {
      expect(firstResult.value.id).toBe(secondResult.value.id);
    }
  });

  it('releases the lock after {ok:true,value:failedJob}; next retry proceeds', async () => {
    const { commands, counts, retryDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const burst = Array.from({ length: 3 }, () => session.retryJob('failed-1'));
    expect(counts.retryCalls).toBe(1);
    retryDeferred.resolve(failedJobResult('job-retry-1'));
    await Promise.all(burst);

    // 锁已释放：新的明确 retry 意图应再次穿透到 command。
    const next = session.retryJob('failed-1');
    expect(counts.retryCalls).toBe(2);
    retryDeferred.resolve(completedJobResult('job-retry-2'));
    const nextResult = await next;
    expect(nextResult.ok).toBe(true);
  });

  it('releases the lock when the command rejects (exception path)', async () => {
    const { commands, counts, retryThrows, retryDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    retryThrows.value = true;
    const burst = Array.from({ length: 3 }, () => session.retryJob('failed-1').catch(() => undefined));
    expect(counts.retryCalls).toBe(1);
    await Promise.all(burst);

    // 锁已释放：下一次 retry 正常进入 command。
    retryThrows.value = false;
    const next = session.retryJob('failed-1');
    expect(counts.retryCalls).toBe(2);
    retryDeferred.resolve(completedJobResult('job-retry-2'));
    await next;
  });

  it('dedupes concurrent submits with the same __clientRoundId', async () => {
    const { commands, counts, distinctSubmitJobIds, submitDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const input = {
      workflow: 'provider-generate' as const,
      input: { __clientRoundId: 'round-1', prompt: 'a', provider: 'mock' },
    };
    const attempts = Array.from({ length: 4 }, () => session.submitJob(input));
    expect(counts.submitCalls).toBe(1);
    expect(distinctSubmitJobIds).toHaveLength(1);

    submitDeferred.resolve(completedJobResult('job-submit-1'));
    const results = await Promise.all(attempts);
    const ids = results.map((result) => (result.ok ? result.value.id : ''));
    expect(new Set(ids).size).toBe(1);
  });

  it('does not serialize concurrent submits with distinct __clientRoundId', async () => {
    const { commands, counts, distinctSubmitJobIds, submitDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const a = session.submitJob({
      workflow: 'provider-generate',
      input: { __clientRoundId: 'round-a', prompt: 'a', provider: 'mock' },
    });
    const b = session.submitJob({
      workflow: 'provider-generate',
      input: { __clientRoundId: 'round-b', prompt: 'b', provider: 'mock' },
    });

    expect(counts.submitCalls).toBe(2);
    expect(distinctSubmitJobIds).toHaveLength(2);

    submitDeferred.resolve(completedJobResult('shared'));
    const [resultA, resultB] = await Promise.all([a, b]);
    if (resultA.ok && resultB.ok) {
      expect(resultA.value.id).not.toBe(resultB.value.id);
    }
  });

  it('clears in-flight maps on dispose', async () => {
    const { commands, counts, retryDeferred } = createDeferredCommands();
    const session = createImagenSession({ commands });

    const pending = session.retryJob('failed-1');
    expect(counts.retryCalls).toBe(1);
    session.dispose();

    // dispose 后 registry 已清空；新的 retry 应重新穿透（旧 in-flight 不再复用）。
    const next = session.retryJob('failed-1');
    expect(counts.retryCalls).toBe(2);

    retryDeferred.resolve(completedJobResult('job-retry-1'));
    await Promise.allSettled([pending, next]);
  });
});
