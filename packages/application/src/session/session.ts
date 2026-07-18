import {
  assertNoSecrets,
  createImmutableSnapshot,
  createRuntimeError,
  createValidationError,
  type Job,
  type JobError,
  type JobEvent,
} from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { executeJob as defaultExecuteJob } from '../commands/execute-job.js';
import { getJob as defaultGetJob } from '../commands/get-job.js';
import { subscribeJobEvents as defaultSubscribeJobEvents } from '../commands/subscribe-job-events.js';
import {
  getTaskRecord as defaultGetTaskRecord,
  putTaskRecord as defaultPutTaskRecord,
} from '../commands/task-history.js';
import type { CommandResult, Unsubscribe } from '../commands/types.js';
import {
  admitGeneration,
  normalizeAdmittedGeneration,
  normalizeGenerationCommand,
} from '../generation/admission.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  ReadinessDecision,
} from '../generation/types.js';
import { getGenerationBackends, getRuntimeLogger } from '../runtime.js';
import { assertTaskRecord, type TaskRecord } from '../task.js';
import { MAX_RUNNING_TASKS_GLOBAL } from './queue-policy.js';
import type {
  ApplicationError,
  CreateImagenSessionOptions,
  EnqueueAcknowledgement,
  ImagenSessionCommands,
  ImagenSessionController,
  ImagenSessionSnapshot,
  ImagenSessionSubscriber,
  JobSessionSnapshot,
  SessionQueuedTaskSnapshot,
} from './types.js';

interface QueuedTaskEntry {
  readonly admitted: AdmittedGeneration;
  readonly originJobId?: string;
  readonly retryAttempt?: number;
  readonly settle?: (result: CommandResult<Job>) => void;
  status: 'queued' | 'starting';
  removable: boolean;
  skipThroughEpoch: number;
  jobId?: string;
}

interface TaskJobCorrelation {
  readonly taskId: string;
  readonly jobId: string;
  readonly backendId: string;
  readonly admitted: AdmittedGeneration;
  readonly runningTask: TaskRecord;
  readonly entry: QueuedTaskEntry;
}

const ERROR_CATEGORIES = new Set<JobError['category']>([
  'validation',
  'execution',
  'provider',
  'runtime',
  'workflow',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedError(error: unknown, fallback: string): ApplicationError {
  if (isRecord(error) && ERROR_CATEGORIES.has(error.category as JobError['category']) && typeof error.message === 'string') {
    const candidate = { category: error.category as JobError['category'], message: error.message };
    try {
      assertNoSecrets(candidate);
      return createImmutableSnapshot(candidate) as ApplicationError;
    } catch {
      return createRuntimeError(fallback);
    }
  }
  return createRuntimeError(fallback);
}

function taskType(task: TaskRecord, fallback: string): string {
  if (task.operation === 'text-to-image') return 'generate';
  if (task.operation === 'image-edit') return 'edit';
  return fallback;
}

function phaseForStatus(status: Job['status']): string {
  if (status === 'created' || status === 'running') return 'running';
  return status;
}

function isTerminalJob(job: Job): boolean {
  return job.status === 'completed' || job.status === 'failed';
}

function publicQueuedTask(entry: QueuedTaskEntry): SessionQueuedTaskSnapshot {
  return {
    taskId: entry.admitted.taskId,
    status: entry.status,
    removable: entry.removable,
    ...(entry.jobId !== undefined ? { jobId: entry.jobId } : {}),
  };
}

function cloneSnapshot(snapshot: ImagenSessionSnapshot): ImagenSessionSnapshot {
  return {
    jobs: snapshot.jobs.map((job) => ({ ...job })),
    queuedTasks: snapshot.queuedTasks.map((task) => ({ ...task })),
    ...(snapshot.lastError !== undefined ? { lastError: snapshot.lastError } : {}),
  };
}

function terminalProjectionFallback(correlation: TaskJobCorrelation, job: Job): TaskRecord {
  const failed: TaskRecord = {
    ...correlation.runningTask,
    status: 'failed',
    outputs: [],
    error: {
      category: 'execution',
      message: 'Terminal projection failed.',
    },
    updatedAt: job.updatedAt,
    finishedAt: job.updatedAt,
  };
  assertTaskRecord(failed);
  return createImmutableSnapshot(failed) as TaskRecord;
}

function normalizeProjectedTask(
  correlation: TaskJobCorrelation,
  job: Job,
  projected: TaskRecord,
): TaskRecord {
  assertTaskRecord(projected);
  if (projected.taskId !== correlation.taskId || projected.latestJobId !== job.id) {
    throw createValidationError('Terminal Task must preserve taskId and latestJobId.', {
      taskId: correlation.taskId,
      jobId: job.id,
    });
  }
  if (projected.status !== 'completed' && projected.status !== 'failed') {
    throw createValidationError('Terminal Task projection must be completed or failed.', {
      taskId: correlation.taskId,
      status: projected.status,
    });
  }
  if (job.status === 'failed' && projected.status !== 'failed') {
    throw createValidationError('A failed Job must project to a failed Task.', {
      taskId: correlation.taskId,
      jobId: job.id,
    });
  }
  return createImmutableSnapshot(projected) as TaskRecord;
}

function createBackendRegistry(backends: readonly GenerationBackend[]): ReadonlyMap<string, GenerationBackend> {
  const registry = new Map<string, GenerationBackend>();
  for (const backend of backends) {
    if (!isRecord(backend) || typeof backend.id !== 'string' || backend.id.trim().length === 0) {
      throw createValidationError('GenerationBackend.id must be a non-empty string.');
    }
    if (
      typeof backend.admit !== 'function'
      || typeof backend.checkReadiness !== 'function'
      || typeof backend.projectTerminal !== 'function'
    ) {
      throw createValidationError(`GenerationBackend "${backend.id}" is incomplete.`);
    }
    if (registry.has(backend.id)) {
      throw createValidationError(`GenerationBackend "${backend.id}" is already registered.`);
    }
    registry.set(backend.id, backend);
  }
  return registry;
}

function normalizeReadiness(decision: ReadinessDecision): ReadinessDecision {
  if (!isRecord(decision)) {
    throw createValidationError('ReadinessDecision must be a record.');
  }
  if (decision.status === 'ready') return Object.freeze({ status: 'ready' });
  if (decision.status === 'wait') {
    return Object.freeze({
      status: 'wait',
      reason: boundedError(decision.reason, 'Backend is not ready.'),
    });
  }
  if (decision.status === 'reject') {
    return Object.freeze({
      status: 'reject',
      error: boundedError(decision.error, 'Backend rejected the generation.'),
    });
  }
  throw createValidationError('ReadinessDecision.status must be ready, wait, or reject.');
}

/** 创建 backend-neutral Application Session。 */
export function createImagenSession(options?: CreateImagenSessionOptions): ImagenSessionController {
  const commands: ImagenSessionCommands = {
    executeJob: options?.commands?.executeJob ?? defaultExecuteJob,
    getJob: options?.commands?.getJob ?? defaultGetJob,
    subscribeJobEvents: options?.commands?.subscribeJobEvents ?? defaultSubscribeJobEvents,
    putTaskRecord: options?.commands?.putTaskRecord ?? defaultPutTaskRecord,
    getTaskRecord: options?.commands?.getTaskRecord ?? defaultGetTaskRecord,
  };
  const backends = createBackendRegistry(options?.backends ?? getGenerationBackends());
  const rootLogger = options?.logger ?? getRuntimeLogger();
  let snapshot: ImagenSessionSnapshot = { jobs: [], queuedTasks: [] };
  let queue: QueuedTaskEntry[] = [];
  let disposed = false;
  let drainRunning = false;
  let drainEpoch = 0;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Set<ImagenSessionSubscriber>();
  const active = new Map<string, QueuedTaskEntry>();
  const correlations = new Map<string, TaskJobCorrelation>();
  const terminalOnce = new Set<string>();
  const terminalPromises = new Map<string, Promise<void>>();
  const knownTaskIds = new Set<string>();
  const taskBackendIds = new Map<string, string>();
  const inFlightSubmit = new Map<string, Promise<CommandResult<EnqueueAcknowledgement>>>();
  const inFlightRetry = new Map<string, Promise<CommandResult<Job>>>();

  function publish(next: ImagenSessionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const subscriber of subscribers) subscriber(cloneSnapshot(snapshot));
  }

  function publishQueue(): void {
    publish({ ...snapshot, queuedTasks: queue.map(publicQueuedTask) });
  }

  function syncJob(job: Job, correlation?: TaskJobCorrelation): void {
    const index = snapshot.jobs.findIndex((candidate) => candidate.id === job.id);
    const previous = index === -1 ? undefined : snapshot.jobs[index];
    const taskId = correlation?.taskId ?? previous?.taskId;
    const workflow = correlation?.admitted.execution.workflow ?? previous?.type ?? 'generation';
    const retryAllowed = correlation?.admitted.retry.allowed ?? previous?.canRetry ?? false;
    const next: JobSessionSnapshot = {
      id: job.id,
      type: correlation !== undefined ? taskType(correlation.runningTask, workflow) : workflow,
      status: job.status,
      phase: phaseForStatus(job.status),
      canRetry: job.status === 'failed' && retryAllowed,
      canCancel: false,
      ...(taskId !== undefined ? { taskId } : {}),
      ...(job.output !== undefined ? { output: job.output } : {}),
      ...(job.error !== undefined ? { error: job.error } : {}),
    };
    const jobs = snapshot.jobs.slice();
    if (index === -1) jobs.push(next);
    else jobs[index] = next;
    publish({
      ...snapshot,
      jobs,
      ...(job.status === 'failed' && job.error !== undefined
        ? { lastError: boundedError(job.error, 'Job failed.') }
        : {}),
    });
  }

  function syncDispatchFailure(entry: QueuedTaskEntry, error: ApplicationError): void {
    const failure: JobSessionSnapshot = {
      id: entry.jobId ?? `dispatch-failed:${entry.admitted.taskId}`,
      taskId: entry.admitted.taskId,
      type: taskType(entry.admitted.runningTask, entry.admitted.execution.workflow),
      status: 'failed',
      phase: 'failed',
      canRetry: false,
      canCancel: false,
      error,
    };
    const jobs = snapshot.jobs.filter((job) => job.id !== failure.id);
    publish({
      ...snapshot,
      jobs: [...jobs, failure],
      queuedTasks: queue.map(publicQueuedTask),
      lastError: error,
    });
  }

  function settle(entry: QueuedTaskEntry, result: CommandResult<Job>): void {
    entry.settle?.(result);
  }

  function requestDrain(): void {
    if (disposed || drainTimer !== undefined) return;
    drainTimer = setTimeout(() => {
      drainTimer = undefined;
      void drainQueue();
    }, 0);
  }

  function releaseCorrelation(correlation: TaskJobCorrelation): void {
    correlations.delete(correlation.jobId);
    if (active.get(correlation.taskId) === correlation.entry) {
      active.delete(correlation.taskId);
    }
    requestDrain();
  }

  function removeEntryFromQueue(entry: QueuedTaskEntry): void {
    queue = queue.filter((candidate) => candidate !== entry);
  }

  function rejectBeforeJob(entry: QueuedTaskEntry, error: ApplicationError): void {
    removeEntryFromQueue(entry);
    if (active.get(entry.admitted.taskId) === entry) active.delete(entry.admitted.taskId);
    if (entry.originJobId === undefined) {
      knownTaskIds.delete(entry.admitted.taskId);
      taskBackendIds.delete(entry.admitted.taskId);
    }
    syncDispatchFailure(entry, error);
    settle(entry, { ok: false, error });
    requestDrain();
  }

  function laneRunningCount(entry: QueuedTaskEntry): number {
    const lane = entry.admitted.lane;
    if (lane === undefined) return 0;
    let count = 0;
    for (const running of active.values()) {
      if (running !== entry && running.admitted.lane?.key === lane.key) count += 1;
    }
    return count;
  }

  function earliestEligible(epoch: number): QueuedTaskEntry | undefined {
    return queue.find((entry) => (
      entry.status === 'queued'
      && entry.skipThroughEpoch < epoch
      && (entry.admitted.lane === undefined || laneRunningCount(entry) < entry.admitted.lane.maxConcurrency)
    ));
  }

  async function persistFailedStart(correlation: TaskJobCorrelation, error: ApplicationError): Promise<void> {
    const now = new Date().toISOString();
    const failed: TaskRecord = {
      ...correlation.runningTask,
      status: 'failed',
      outputs: [],
      error: {
        category: error.category,
        message: 'Execution could not start.',
      },
      updatedAt: now,
      finishedAt: now,
    };
    assertTaskRecord(failed);
    try {
      await commands.putTaskRecord(failed);
    } catch {
      rootLogger.error('session.task.start-failure-persist.failed', {
        job_id: correlation.jobId,
        backend_id: correlation.backendId,
      });
    }
  }

  async function failStartedEntry(entry: QueuedTaskEntry, error: ApplicationError): Promise<void> {
    const correlation = entry.jobId === undefined ? undefined : correlations.get(entry.jobId);
    if (correlation !== undefined) {
      await persistFailedStart(correlation, error);
      correlations.delete(correlation.jobId);
    } else if (entry.originJobId === undefined) {
      knownTaskIds.delete(entry.admitted.taskId);
      taskBackendIds.delete(entry.admitted.taskId);
    }
    removeEntryFromQueue(entry);
    if (active.get(entry.admitted.taskId) === entry) active.delete(entry.admitted.taskId);
    syncDispatchFailure(entry, error);
    settle(entry, { ok: false, error });
    requestDrain();
  }

  function finalizeTerminal(job: Job): Promise<void> {
    const existing = terminalPromises.get(job.id);
    if (existing !== undefined) return existing;
    if (terminalOnce.has(job.id) || !isTerminalJob(job)) return Promise.resolve();
    const correlation = correlations.get(job.id);
    if (correlation === undefined) return Promise.resolve();
    const backend = backends.get(correlation.backendId);
    if (backend === undefined) return Promise.resolve();

    terminalOnce.add(job.id);
    syncJob(job, correlation);
    const promise = (async () => {
      let terminalTask: TaskRecord;
      try {
        terminalTask = normalizeProjectedTask(
          correlation,
          job,
          await backend.projectTerminal({
            admitted: correlation.admitted,
            job,
            runningTask: correlation.runningTask,
          }),
        );
      } catch {
        rootLogger.warn('session.terminal.projection.failed', {
          job_id: job.id,
          backend_id: correlation.backendId,
        });
        terminalTask = terminalProjectionFallback(correlation, job);
      }

      try {
        await commands.putTaskRecord(terminalTask);
      } catch {
        const error = createRuntimeError('Terminal Task persistence failed.');
        rootLogger.error('session.terminal.persist.failed', {
          job_id: job.id,
          backend_id: correlation.backendId,
        });
        publish({ ...snapshot, lastError: error });
        settle(correlation.entry, { ok: false, error });
        return;
      }

      if (backend.afterTerminal !== undefined) {
        try {
          await backend.afterTerminal({ admitted: correlation.admitted, job, task: terminalTask });
        } catch {
          rootLogger.error('session.terminal.follow-up.failed', {
            job_id: job.id,
            backend_id: correlation.backendId,
          });
        }
      }
      settle(correlation.entry, { ok: true, value: job });
    })().finally(() => {
      releaseCorrelation(correlation);
      terminalPromises.delete(job.id);
    });
    terminalPromises.set(job.id, promise);
    return promise;
  }

  async function dispatch(entry: QueuedTaskEntry, epoch: number): Promise<void> {
    const backend = backends.get(entry.admitted.backendId);
    if (backend === undefined) {
      rejectBeforeJob(entry, createValidationError(`GenerationBackend "${entry.admitted.backendId}" is not registered.`));
      return;
    }
    const sessionLogger = rootLogger.child({
      trace_id: generateTraceId(),
      package: 'application',
      component: 'session',
    });
    const span = sessionLogger.startSpan('session.queue.dispatch', { task_id: entry.admitted.taskId });

    try {
      const readiness = normalizeReadiness(await backend.checkReadiness(entry.admitted));
      if (disposed || active.get(entry.admitted.taskId) !== entry) return;
      if (readiness.status === 'wait') {
        entry.status = 'queued';
        entry.removable = true;
        entry.skipThroughEpoch = epoch;
        active.delete(entry.admitted.taskId);
        publishQueue();
        requestDrain();
        span.finish();
        return;
      }
      if (readiness.status === 'reject') {
        rejectBeforeJob(entry, readiness.error);
        span.fail(readiness.error);
        return;
      }

      const result = await commands.executeJob({
        execution: entry.admitted.execution,
        logger: sessionLogger.child({ span_id: span.span_id }),
        ...(entry.originJobId !== undefined ? { originJobId: entry.originJobId } : {}),
        ...(entry.retryAttempt !== undefined ? { retryAttempt: entry.retryAttempt } : {}),
        onJobCreated: async (job) => {
          if (disposed || active.get(entry.admitted.taskId) !== entry) {
            throw createValidationError('Session was disposed before Job execution started.');
          }
          const runningTask: TaskRecord = {
            ...entry.admitted.runningTask,
            latestJobId: job.id,
          };
          assertTaskRecord(runningTask);
          const correlation: TaskJobCorrelation = {
            taskId: entry.admitted.taskId,
            jobId: job.id,
            backendId: entry.admitted.backendId,
            admitted: entry.admitted,
            runningTask: createImmutableSnapshot(runningTask) as TaskRecord,
            entry,
          };
          correlations.set(job.id, correlation);
          entry.jobId = job.id;
          removeEntryFromQueue(entry);
          publishQueue();
          syncJob(job, correlation);
          await commands.putTaskRecord(correlation.runningTask);
        },
      });

      if (result.ok) {
        if (isTerminalJob(result.value)) await finalizeTerminal(result.value);
        else {
          const correlation = correlations.get(result.value.id);
          if (correlation !== undefined) syncJob(result.value, correlation);
        }
        span.finish();
        return;
      }

      const terminal = entry.jobId === undefined ? undefined : commands.getJob(entry.jobId);
      if (terminal !== undefined && isTerminalJob(terminal)) {
        await finalizeTerminal(terminal);
        span.finish();
        return;
      }
      const error = boundedError(result.error, 'Job execution failed.');
      await failStartedEntry(entry, error);
      span.fail(error);
    } catch (error) {
      const normalized = boundedError(error, 'Session dispatch failed.');
      if (entry.jobId === undefined) rejectBeforeJob(entry, normalized);
      else await failStartedEntry(entry, normalized);
      span.fail(normalized);
    }
  }

  async function drainQueue(): Promise<void> {
    if (disposed || drainRunning) return;
    drainRunning = true;
    const epoch = ++drainEpoch;
    try {
      while (!disposed && active.size < MAX_RUNNING_TASKS_GLOBAL) {
        const entry = earliestEligible(epoch);
        if (entry === undefined || !queue.includes(entry)) break;
        entry.status = 'starting';
        entry.removable = false;
        active.set(entry.admitted.taskId, entry);
        publishQueue();
        void dispatch(entry, epoch);
      }
    } finally {
      drainRunning = false;
    }
  }

  const unsubscribe = commands.subscribeJobEvents((event: JobEvent) => {
    const correlation = correlations.get(event.job.id);
    if (correlation === undefined) return;
    if (event.type === 'completed' || event.type === 'failed') {
      void finalizeTerminal(event.job);
      return;
    }
    syncJob(event.job, correlation);
  });

  return {
    submitJob(command: GenerationCommand) {
      let normalized: GenerationCommand;
      try {
        normalized = normalizeGenerationCommand(command);
      } catch (error) {
        return Promise.resolve({ ok: false, error: boundedError(error, 'Generation command is invalid.') });
      }

      const pending = inFlightSubmit.get(normalized.taskId);
      if (pending !== undefined) return pending;
      const promise = (async (): Promise<CommandResult<EnqueueAcknowledgement>> => {
        if (disposed) {
          return { ok: false, error: createValidationError('Session is disposed.') };
        }
        if (knownTaskIds.has(normalized.taskId)) {
          return { ok: true, value: { taskId: normalized.taskId, status: 'queued' } };
        }
        const backend = backends.get(normalized.backendId);
        if (backend === undefined) {
          return {
            ok: false,
            error: createValidationError(`GenerationBackend "${normalized.backendId}" is not registered.`),
          };
        }
        try {
          const admitted = await admitGeneration(backend, normalized);
          if (disposed) return { ok: false, error: createValidationError('Session is disposed.') };
          if (knownTaskIds.has(admitted.taskId)) {
            return { ok: true, value: { taskId: admitted.taskId, status: 'queued' } };
          }
          const entry: QueuedTaskEntry = {
            admitted,
            status: 'queued',
            removable: true,
            skipThroughEpoch: -1,
          };
          knownTaskIds.add(admitted.taskId);
          taskBackendIds.set(admitted.taskId, admitted.backendId);
          queue = [...queue, entry];
          publishQueue();
          requestDrain();
          return { ok: true, value: { taskId: admitted.taskId, status: 'queued' } };
        } catch (error) {
          return { ok: false, error: boundedError(error, 'Generation admission failed.') };
        }
      })().finally(() => {
        inFlightSubmit.delete(normalized.taskId);
      });
      inFlightSubmit.set(normalized.taskId, promise);
      return promise;
    },

    removeQueuedTask(taskId: string): boolean {
      const entry = queue.find((candidate) => candidate.admitted.taskId === taskId && candidate.status === 'queued');
      if (entry === undefined) return false;
      removeEntryFromQueue(entry);
      if (entry.originJobId === undefined) {
        knownTaskIds.delete(taskId);
        taskBackendIds.delete(taskId);
      }
      settle(entry, { ok: false, error: createValidationError('Queued generation was removed.') });
      publishQueue();
      requestDrain();
      return true;
    },

    retryJob(jobId: string) {
      const pending = inFlightRetry.get(jobId);
      if (pending !== undefined) return pending;
      const promise = (async (): Promise<CommandResult<Job>> => {
        const latestJob = commands.getJob(jobId);
        const jobSnapshot = snapshot.jobs.find((job) => job.id === jobId);
        if (latestJob === undefined || latestJob.status !== 'failed' || jobSnapshot?.taskId === undefined) {
          return { ok: false, error: createValidationError(`Failed Job "${jobId}" is not retryable.`) };
        }
        if (!jobSnapshot.canRetry) {
          return { ok: false, error: createValidationError(`Job "${jobId}" retry is not allowed.`) };
        }
        const taskId = jobSnapshot.taskId;
        if (active.has(taskId) || queue.some((entry) => entry.admitted.taskId === taskId)) {
          return { ok: false, error: createValidationError(`Task "${taskId}" already has an active Job.`) };
        }
        try {
          const task = await commands.getTaskRecord(taskId);
          if (task === undefined || task.status !== 'failed' || task.latestJobId !== jobId) {
            return { ok: false, error: createValidationError(`Task "${taskId}" is not retryable.`) };
          }
          const backendId = taskBackendIds.get(taskId) ?? task.execution?.backend.id;
          const backend = backendId === undefined ? undefined : backends.get(backendId);
          if (backend === undefined || backend.retry === undefined) {
            return { ok: false, error: createValidationError(`Task "${taskId}" backend does not support Retry.`) };
          }
          const retryCommand = normalizeGenerationCommand({ taskId, backendId: backend.id, payload: {} });
          const admitted = normalizeAdmittedGeneration(
            retryCommand,
            backend.id,
            await backend.retry({ task, latestJob }),
          );
          taskBackendIds.set(taskId, backend.id);
          return await new Promise<CommandResult<Job>>((resolve) => {
            const entry: QueuedTaskEntry = {
              admitted,
              originJobId: latestJob.id,
              retryAttempt: (latestJob.retryAttempt ?? 0) + 1,
              settle: resolve,
              status: 'queued',
              removable: true,
              skipThroughEpoch: -1,
            };
            queue = [...queue, entry];
            publishQueue();
            requestDrain();
          });
        } catch (error) {
          return { ok: false, error: boundedError(error, 'Retry admission failed.') };
        }
      })().finally(() => {
        inFlightRetry.delete(jobId);
      });
      inFlightRetry.set(jobId, promise);
      return promise;
    },

    getSnapshot: () => cloneSnapshot(snapshot),
    subscribe(subscriber: ImagenSessionSubscriber): Unsubscribe {
      subscribers.add(subscriber);
      subscriber(cloneSnapshot(snapshot));
      return () => subscribers.delete(subscriber);
    },
    dispose(): void {
      disposed = true;
      if (drainTimer !== undefined) clearTimeout(drainTimer);
      drainTimer = undefined;
      unsubscribe();
      const dropped = queue.filter((entry) => entry.jobId === undefined);
      queue = [];
      for (const entry of dropped) {
        if (active.get(entry.admitted.taskId) === entry) active.delete(entry.admitted.taskId);
        if (entry.originJobId === undefined) {
          knownTaskIds.delete(entry.admitted.taskId);
          taskBackendIds.delete(entry.admitted.taskId);
        }
        settle(entry, { ok: false, error: createValidationError('Session disposed queued generation.') });
      }
      subscribers.clear();
      inFlightSubmit.clear();
    },
  };
}
