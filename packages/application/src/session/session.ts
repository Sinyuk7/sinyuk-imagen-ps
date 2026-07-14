import { assertTaskRecord, createValidationError, type Job, type JobEvent } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { getJob as defaultGetJob } from '../commands/get-job.js';
import { getProviderProfile as defaultGetProviderProfile } from '../commands/provider-profiles.js';
import { retryJob as defaultRetryJob } from '../commands/retry-job.js';
import { submitJob as defaultSubmitJob, toJobError } from '../commands/submit-job.js';
import { subscribeJobEvents as defaultSubscribeJobEvents } from '../commands/subscribe-job-events.js';
import { putTaskRecord as defaultPutTaskRecord } from '../commands/task-history.js';
import type { CommandResult, SubmitJobInput, TaskRecord, Unsubscribe } from '../commands/types.js';
import { getRuntimeLogger } from '../runtime.js';
import {
  MAX_RUNNING_TASKS_GLOBAL,
  MAX_RUNNING_TASKS_PER_PROFILE,
} from './queue-policy.js';
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

interface QueuedTaskEntry extends Omit<SessionQueuedTaskSnapshot, 'status' | 'removable' | 'jobId'> {
  readonly request: SubmitJobInput;
  readonly taskRecord?: TaskRecord;
  status: 'queued' | 'starting';
  removable: boolean;
  jobId?: string;
  blocked: boolean;
}

function inferJobType(job: Job): 'generate' | 'edit' | string {
  const workflow = typeof job.input._workflowName === 'string' ? job.input._workflowName : undefined;
  if (workflow === 'provider-edit') return 'edit';
  if (workflow === 'provider-generate') return 'generate';
  return workflow ?? 'generate';
}

function inferPhase(status: string): string | undefined {
  switch (status) {
    case 'created':
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return undefined;
  }
}

function profileIdFromInput(input: Record<string, unknown>): string | undefined {
  return typeof input.providerProfileId === 'string'
    ? input.providerProfileId
    : typeof input.profileId === 'string'
      ? input.profileId
      : undefined;
}

function modelIdFromInput(input: Record<string, unknown>): string | undefined {
  const providerOptions = input.providerOptions;
  if (typeof providerOptions !== 'object' || providerOptions === null || Array.isArray(providerOptions)) {
    return undefined;
  }
  const model = (providerOptions as Record<string, unknown>).model;
  return typeof model === 'string' ? model : undefined;
}

function taskIdFromJob(job: Job): string | undefined {
  return typeof job.input.__clientTaskId === 'string' ? job.input.__clientTaskId : undefined;
}

function toJobSessionSnapshot(job: Job): JobSessionSnapshot {
  const taskId = taskIdFromJob(job);
  return {
    id: job.id,
    type: inferJobType(job),
    status: job.status,
    phase: inferPhase(job.status),
    canRetry: job.status === 'failed',
    canCancel: false,
    ...(taskId !== undefined ? { taskId } : {}),
    ...(job.output !== undefined ? { output: job.output } : {}),
    ...(job.error !== undefined ? { error: job.error } : {}),
  };
}

function cloneFrozenValue<T>(value: T): T {
  if (value instanceof Uint8Array) {
    return value.slice() as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneFrozenValue(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = cloneFrozenValue(item);
    }
    return clone as T;
  }
  return value;
}

function frozenRequest(input: SubmitJobInput): SubmitJobInput {
  return {
    workflow: input.workflow,
    input: cloneFrozenValue(input.input),
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
    ...(input.taskRecord !== undefined ? { taskRecord: cloneFrozenValue(input.taskRecord) } : {}),
  };
}

function validationError(input: SubmitJobInput): ApplicationError | undefined {
  const taskId = input.input.__clientTaskId;
  const roundId = input.input.__clientRoundId;
  const profileId = profileIdFromInput(input.input);
  const prompt = input.input.prompt;
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    return createValidationError('Session submission requires __clientTaskId.');
  }
  if (typeof roundId === 'string' && roundId !== taskId) {
    return createValidationError('__clientRoundId must match __clientTaskId.', { taskId, roundId });
  }
  if (profileId === undefined || profileId.trim().length === 0) {
    return createValidationError('Session submission requires profileId.', { taskId });
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return createValidationError('Session submission requires a prompt.', { taskId });
  }
  if (input.workflow === 'provider-edit' && (!Array.isArray(input.input.images) || input.input.images.length === 0)) {
    return createValidationError('Image edit requires at least one provider input image.', { taskId });
  }
  if (input.taskRecord === undefined) {
    return createValidationError('Session submission requires a frozen task record.', { taskId });
  }
  {
    try {
      assertTaskRecord(input.taskRecord);
    } catch (error) {
      return createValidationError(
        error instanceof Error ? error.message : 'Session task record is invalid.',
        { taskId },
      );
    }
    if (input.taskRecord.taskId !== taskId || input.taskRecord.status !== 'running') {
      return createValidationError('Session task record must be running and match __clientTaskId.', { taskId });
    }
    const operation = input.workflow === 'provider-edit' ? 'image-edit' : 'text-to-image';
    if (
      input.taskRecord.operation !== operation
      || input.taskRecord.prompt !== prompt
      || input.taskRecord.execution?.profileId !== profileId
    ) {
      return createValidationError('Session task record does not match the provider request.', { taskId });
    }
  }
  return undefined;
}

function publicQueuedTask(entry: QueuedTaskEntry): SessionQueuedTaskSnapshot {
  return {
    taskId: entry.taskId,
    createdAt: entry.createdAt,
    profileId: entry.profileId,
    operation: entry.operation,
    prompt: entry.prompt,
    ...(entry.modelId !== undefined ? { modelId: entry.modelId } : {}),
    status: entry.status,
    removable: entry.removable,
    ...(entry.jobId !== undefined ? { jobId: entry.jobId } : {}),
  };
}

function cloneSnapshot(snapshot: ImagenSessionSnapshot): ImagenSessionSnapshot {
  return {
    ...(snapshot.selectedProfileId !== undefined ? { selectedProfileId: snapshot.selectedProfileId } : {}),
    ...(snapshot.selectedModelId !== undefined ? { selectedModelId: snapshot.selectedModelId } : {}),
    ...(snapshot.activeJobId !== undefined ? { activeJobId: snapshot.activeJobId } : {}),
    jobs: snapshot.jobs.map((job) => ({ ...job })),
    queuedTasks: snapshot.queuedTasks.map((task) => ({ ...task })),
    ...(snapshot.lastError !== undefined ? { lastError: snapshot.lastError } : {}),
  };
}

function updateJobList(jobs: readonly JobSessionSnapshot[], job: Job): readonly JobSessionSnapshot[] {
  const next = toJobSessionSnapshot(job);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index === -1) return [...jobs, next];
  const clone = jobs.slice();
  clone[index] = next;
  return clone;
}

function failedTaskRecord(record: TaskRecord, error: ApplicationError, now: string): TaskRecord {
  return {
    ...record,
    status: 'failed',
    outputs: [],
    error: { category: error.category, message: error.message },
    updatedAt: now,
    finishedAt: now,
  };
}

export function createImagenSession(options?: CreateImagenSessionOptions): ImagenSessionController {
  const commands: ImagenSessionCommands = {
    submitJob: options?.commands?.submitJob ?? defaultSubmitJob,
    retryJob: options?.commands?.retryJob ?? defaultRetryJob,
    getJob: options?.commands?.getJob ?? defaultGetJob,
    subscribeJobEvents: options?.commands?.subscribeJobEvents ?? defaultSubscribeJobEvents,
    putTaskRecord: options?.commands?.putTaskRecord ?? defaultPutTaskRecord,
    getProviderProfile: options?.commands?.getProviderProfile ?? defaultGetProviderProfile,
  };
  const rootLogger = options?.logger ?? getRuntimeLogger();
  let snapshot: ImagenSessionSnapshot = { jobs: [], queuedTasks: [] };
  let queue: QueuedTaskEntry[] = [];
  let disposed = false;
  let drainRunning = false;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Set<ImagenSessionSubscriber>();
  const active = new Map<string, QueuedTaskEntry>();
  const pendingTerminalJobs = new Map<string, Job>();
  const inFlightRetry = new Map<string, Promise<CommandResult<Job>>>();
  const inFlightSubmit = new Map<string, Promise<CommandResult<EnqueueAcknowledgement>>>();

  function publish(next: ImagenSessionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const subscriber of subscribers) subscriber(cloneSnapshot(snapshot));
  }

  function publishQueue(): void {
    publish({ ...snapshot, queuedTasks: queue.map(publicQueuedTask) });
  }

  function syncJob(job: Job): void {
    const profileId = profileIdFromInput(job.input);
    const modelId = modelIdFromInput(job.input);
    const taskId = taskIdFromJob(job);
    if (taskId !== undefined) {
      const entry = active.get(taskId);
      if (entry !== undefined && entry.jobId === undefined) {
        entry.jobId = job.id;
      }
      queue = queue.filter((item) => item.taskId !== taskId);
    }
    publish({
      ...snapshot,
      ...(profileId !== undefined ? { selectedProfileId: profileId } : {}),
      ...(modelId !== undefined ? { selectedModelId: modelId } : {}),
      activeJobId: job.status === 'completed' || job.status === 'failed' ? undefined : job.id,
      jobs: updateJobList(snapshot.jobs, job),
      queuedTasks: queue.map(publicQueuedTask),
    });
  }

  function syncDispatchFailure(entry: QueuedTaskEntry, error: ApplicationError): void {
    const failure: JobSessionSnapshot = {
      id: `dispatch-failed:${entry.taskId}`,
      taskId: entry.taskId,
      type: entry.operation === 'image-edit' ? 'edit' : 'generate',
      status: 'failed',
      phase: 'failed',
      canRetry: false,
      canCancel: false,
      error,
    };
    queue = queue.filter((item) => item.taskId !== entry.taskId);
    publish({
      ...snapshot,
      jobs: [...snapshot.jobs.filter((job) => job.taskId !== entry.taskId), failure],
      queuedTasks: queue.map(publicQueuedTask),
      lastError: error,
    });
  }

  async function profileIsRunnable(entry: QueuedTaskEntry): Promise<boolean> {
    if (entry.blocked) return false;
    const result = await commands.getProviderProfile(entry.profileId);
    if (!result.ok) {
      if (result.error.category === 'validation') entry.blocked = true;
      return false;
    }
    if (!result.value.enabled) {
      entry.blocked = true;
      return false;
    }
    return true;
  }

  function runningForProfile(profileId: string): number {
    let count = 0;
    for (const entry of active.values()) {
      if (entry.profileId === profileId) count += 1;
    }
    return count;
  }

  async function earliestEligible(): Promise<QueuedTaskEntry | undefined> {
    for (const entry of queue) {
      if (entry.status !== 'queued' || entry.blocked) continue;
      if (runningForProfile(entry.profileId) >= MAX_RUNNING_TASKS_PER_PROFILE) continue;
      if (await profileIsRunnable(entry)) return entry;
    }
    return undefined;
  }

  function requestDrain(): void {
    if (disposed || drainTimer !== undefined) return;
    drainTimer = setTimeout(() => {
      drainTimer = undefined;
      void drainQueue();
    }, 0);
  }

  async function dispatch(entry: QueuedTaskEntry): Promise<void> {
    const sessionLogger = rootLogger.child({
      trace_id: generateTraceId(),
      package: 'application',
      component: 'session',
    });
    const span = sessionLogger.startSpan('session.queue.dispatch', { workflow: entry.request.workflow, task_id: entry.taskId });
    try {
      if (!(await profileIsRunnable(entry))) {
        entry.status = 'queued';
        entry.removable = true;
        publishQueue();
        return;
      }
      if (entry.taskRecord !== undefined) {
        await commands.putTaskRecord(entry.taskRecord);
      }
      const result = await commands.submitJob({
        workflow: entry.request.workflow,
        input: entry.request.input,
        ...(entry.request.signal !== undefined ? { signal: entry.request.signal } : {}),
        logger: sessionLogger.child({ span_id: span.span_id }),
        onJobCreated: async (job) => {
          entry.jobId = job.id;
          if (entry.taskRecord !== undefined) {
            await commands.putTaskRecord({ ...entry.taskRecord, executionJobId: job.id });
          }
        },
      });
      if (result.ok) {
        const pendingTerminal = pendingTerminalJobs.get(entry.taskId);
        pendingTerminalJobs.delete(entry.taskId);
        syncJob(pendingTerminal ?? result.value);
        span.finish();
        return;
      }
      if (entry.taskRecord !== undefined) {
        await commands.putTaskRecord(failedTaskRecord(entry.taskRecord, result.error, new Date().toISOString()));
      }
      syncDispatchFailure(entry, result.error);
      span.fail(result.error);
    } catch (error) {
      const normalized = toJobError(error);
      if (entry.taskRecord !== undefined) {
        try {
          await commands.putTaskRecord(failedTaskRecord(entry.taskRecord, normalized, new Date().toISOString()));
        } catch {
          // 原始持久化失败已由 session error surface 报告。
        }
      }
      syncDispatchFailure(entry, normalized);
      span.fail(normalized);
    } finally {
      active.delete(entry.taskId);
      requestDrain();
    }
  }

  async function drainQueue(): Promise<void> {
    if (disposed || drainRunning) return;
    drainRunning = true;
    try {
      while (!disposed && active.size < MAX_RUNNING_TASKS_GLOBAL) {
        const entry = await earliestEligible();
        if (entry === undefined || !queue.includes(entry) || entry.status !== 'queued') break;
        entry.status = 'starting';
        entry.removable = false;
        active.set(entry.taskId, entry);
        publishQueue();
        void dispatch(entry);
      }
    } finally {
      drainRunning = false;
    }
  }

  const unsubscribe = commands.subscribeJobEvents((event: JobEvent) => {
    const taskId = taskIdFromJob(event.job);
    if (taskId !== undefined && active.has(taskId) && (event.type === 'completed' || event.type === 'failed')) {
      pendingTerminalJobs.set(taskId, event.job);
      return;
    }
    syncJob(event.job);
    if (event.type === 'failed' && event.job.error !== undefined) {
      publish({ ...snapshot, lastError: event.job.error });
    }
  });

  return {
    submitJob(input) {
      const request = frozenRequest(input);
      const taskId = typeof request.input.__clientTaskId === 'string' ? request.input.__clientTaskId : '';
      const submitKey = typeof request.input.__clientRoundId === 'string' ? request.input.__clientRoundId : taskId;
      const existing = inFlightSubmit.get(submitKey);
      if (existing !== undefined) return existing;

      const promise = (async (): Promise<CommandResult<EnqueueAcknowledgement>> => {
        const error = validationError(request);
        if (error !== undefined) return { ok: false, error };
        const profileId = profileIdFromInput(request.input)!;
        const profile = await commands.getProviderProfile(profileId);
        if (!profile.ok) return profile;
        if (!profile.value.enabled) {
          return { ok: false, error: createValidationError(`Provider profile "${profileId}" is disabled.`, { profileId, taskId }) };
        }
        const existingEntry = queue.find((entry) => entry.taskId === taskId) ?? active.get(taskId);
        if (existingEntry !== undefined || snapshot.jobs.some((job) => job.taskId === taskId)) {
          return { ok: true, value: { taskId, status: 'queued' } };
        }
        const operation = request.workflow === 'provider-edit' ? 'image-edit' : 'text-to-image';
        const entry: QueuedTaskEntry = {
          taskId,
          createdAt: request.taskRecord?.createdAt ?? new Date().toISOString(),
          profileId,
          operation,
          prompt: String(request.input.prompt),
          ...(modelIdFromInput(request.input) !== undefined ? { modelId: modelIdFromInput(request.input) } : {}),
          status: 'queued',
          removable: true,
          request,
          ...(request.taskRecord !== undefined ? { taskRecord: request.taskRecord } : {}),
          blocked: false,
        };
        queue = [...queue, entry];
        publishQueue();
        return { ok: true, value: { taskId, status: 'queued' } };
      })().finally(() => {
        inFlightSubmit.delete(submitKey);
      });
      inFlightSubmit.set(submitKey, promise);
      void promise.then((result) => {
        if (result.ok) requestDrain();
      });
      return promise;
    },

    removeQueuedTask(taskId: string): boolean {
      const index = queue.findIndex((entry) => entry.taskId === taskId && entry.status === 'queued');
      if (index === -1) return false;
      queue = [...queue.slice(0, index), ...queue.slice(index + 1)];
      publishQueue();
      requestDrain();
      return true;
    },

    async retryJob(jobId: string) {
      const existing = inFlightRetry.get(jobId);
      if (existing) return existing;
      const retryPromise = (async () => {
        const logger = rootLogger.child({ trace_id: generateTraceId(), package: 'application', component: 'session' });
        const span = logger.startSpan('session.command.retry', { job_id: jobId });
        try {
          const result = await commands.retryJob({ jobId, logger: logger.child({ span_id: span.span_id }) });
          if (result.ok) {
            syncJob(result.value);
            span.finish();
          } else {
            publish({ ...snapshot, lastError: result.error });
            span.fail(result.error);
          }
          return result;
        } catch (error) {
          span.fail(error);
          throw error;
        }
      })().finally(() => inFlightRetry.delete(jobId));
      inFlightRetry.set(jobId, retryPromise);
      return retryPromise;
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
      unsubscribe();
      queue = [];
      subscribers.clear();
      inFlightRetry.clear();
      inFlightSubmit.clear();
    },
  };
}
