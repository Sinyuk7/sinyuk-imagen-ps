import type { Job, JobEvent, Unsubscribe } from '../commands/types.js';
import { getJob as defaultGetJob } from '../commands/get-job.js';
import { retryJob as defaultRetryJob } from '../commands/retry-job.js';
import { submitJob as defaultSubmitJob } from '../commands/submit-job.js';
import { subscribeJobEvents as defaultSubscribeJobEvents } from '../commands/subscribe-job-events.js';
import type {
  ApplicationError,
  CreateImagenSessionOptions,
  ImagenSessionCommands,
  ImagenSessionController,
  ImagenSessionSnapshot,
  ImagenSessionSubscriber,
  JobSessionSnapshot,
} from './types.js';
import { getRuntimeLogger } from '../runtime.js';

function inferJobType(job: Job): 'generate' | 'edit' | string {
  const workflow = typeof job.input._workflowName === 'string' ? job.input._workflowName : undefined;
  if (workflow === 'provider-edit') {
    return 'edit';
  }
  if (workflow === 'provider-generate') {
    return 'generate';
  }
  return workflow ?? 'generate';
}

function inferPhase(status: string): string | undefined {
  switch (status) {
    case 'created':
      return 'queued';
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

function canRetry(job: Job): boolean {
  return job.status === 'failed';
}

function selectedProfileId(job: Job): string | undefined {
  if (typeof job.input.providerProfileId === 'string') {
    return job.input.providerProfileId;
  }
  if (typeof job.input.profileId === 'string') {
    return job.input.profileId;
  }
  return undefined;
}

function selectedModelId(job: Job): string | undefined {
  const providerOptions = job.input.providerOptions;
  if (typeof providerOptions === 'object' && providerOptions !== null && !Array.isArray(providerOptions)) {
    const model = (providerOptions as Record<string, unknown>).model;
    return typeof model === 'string' ? model : undefined;
  }
  return undefined;
}

function toJobSessionSnapshot(job: Job): JobSessionSnapshot {
  return {
    id: job.id,
    type: inferJobType(job),
    status: job.status,
    phase: inferPhase(job.status),
    canRetry: canRetry(job),
    canCancel: false,
    ...(job.output !== undefined ? { output: job.output } : {}),
    ...(job.error !== undefined ? { error: job.error } : {}),
  };
}

function cloneSnapshot(snapshot: ImagenSessionSnapshot): ImagenSessionSnapshot {
  return {
    ...(snapshot.selectedProfileId !== undefined ? { selectedProfileId: snapshot.selectedProfileId } : {}),
    ...(snapshot.selectedModelId !== undefined ? { selectedModelId: snapshot.selectedModelId } : {}),
    ...(snapshot.activeJobId !== undefined ? { activeJobId: snapshot.activeJobId } : {}),
    jobs: snapshot.jobs.map((job) => ({ ...job })),
    ...(snapshot.lastError !== undefined ? { lastError: snapshot.lastError } : {}),
  };
}

function updateJobList(jobs: readonly JobSessionSnapshot[], job: Job): readonly JobSessionSnapshot[] {
  const next = toJobSessionSnapshot(job);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index === -1) {
    return [...jobs, next];
  }
  const clone = jobs.slice();
  clone[index] = next;
  return clone;
}

function updateSnapshotFromJob(snapshot: ImagenSessionSnapshot, job: Job): ImagenSessionSnapshot {
  const profileId = selectedProfileId(job);
  const modelId = selectedModelId(job);
  return {
    ...snapshot,
    ...(profileId !== undefined ? { selectedProfileId: profileId } : {}),
    ...(modelId !== undefined ? { selectedModelId: modelId } : {}),
    activeJobId: job.status === 'completed' || job.status === 'failed' ? undefined : job.id,
    jobs: updateJobList(snapshot.jobs, job),
  };
}

function updateSnapshotFromError(snapshot: ImagenSessionSnapshot, error: ApplicationError): ImagenSessionSnapshot {
  return {
    ...snapshot,
    lastError: error,
  };
}

export function createImagenSession(
  options?: CreateImagenSessionOptions,
): ImagenSessionController {
  const commands: ImagenSessionCommands = {
    submitJob: options?.commands?.submitJob ?? defaultSubmitJob,
    retryJob: options?.commands?.retryJob ?? defaultRetryJob,
    getJob: options?.commands?.getJob ?? defaultGetJob,
    subscribeJobEvents: options?.commands?.subscribeJobEvents ?? defaultSubscribeJobEvents,
  };

  let snapshot: ImagenSessionSnapshot = {
    jobs: [],
  };
  const subscribers = new Set<ImagenSessionSubscriber>();

  function publish(next: ImagenSessionSnapshot): void {
    snapshot = next;
    for (const subscriber of subscribers) {
      subscriber(cloneSnapshot(snapshot));
    }
  }

  function syncJob(job: Job): void {
    publish(updateSnapshotFromJob(snapshot, job));
  }

  const unsubscribe = commands.subscribeJobEvents((event: JobEvent) => {
    syncJob(event.job);
    if (event.type === 'failed' && event.job.error !== undefined) {
      publish(updateSnapshotFromError(snapshot, event.job.error));
    }
  });

  return {
    async submitJob(input) {
      const sessionLogger = getRuntimeLogger().child({ package: 'application', component: 'session' });
      const span = sessionLogger.startSpan('session.command.submit', { workflow: input.workflow });
      const result = await commands.submitJob(input);
      if (result.ok) {
        syncJob(result.value);
        span.finish();
      } else {
        publish(updateSnapshotFromError(snapshot, result.error));
        span.fail(result.error);
      }
      return result;
    },

    async retryJob(jobId: string) {
      const sessionLogger = getRuntimeLogger().child({ package: 'application', component: 'session' });
      const span = sessionLogger.startSpan('session.command.retry', { job_id: jobId });
      const result = await commands.retryJob(jobId);
      if (result.ok) {
        syncJob(result.value);
        span.finish();
      } else {
        publish(updateSnapshotFromError(snapshot, result.error));
        span.fail(result.error);
      }
      return result;
    },

    getSnapshot(): ImagenSessionSnapshot {
      return cloneSnapshot(snapshot);
    },

    subscribe(subscriber: ImagenSessionSubscriber): Unsubscribe {
      subscribers.add(subscriber);
      subscriber(cloneSnapshot(snapshot));
      return () => {
        subscribers.delete(subscriber);
      };
    },

    dispose(): void {
      unsubscribe();
      subscribers.clear();
    },
  };
}
