import type {
  CommandResult,
  Job,
  JobError,
  JobEventHandler,
  ProviderProfile,
  RetryJobInput,
  SubmitJobInput,
  TaskRecord,
  Unsubscribe,
} from '../commands/types.js';
import type { Logger } from '@imagen-ps/foundation';

export type ApplicationError = JobError;

export interface JobSessionSnapshot {
  readonly id: string;
  readonly type: 'generate' | 'edit' | string;
  readonly status: string;
  readonly phase?: string;
  readonly canRetry: boolean;
  readonly canCancel: boolean;
  readonly taskId?: string;
  readonly output?: unknown;
  readonly error?: unknown;
}

/** Session queue 接受任务后的公开确认。 */
export interface EnqueueAcknowledgement {
  readonly taskId: string;
  readonly status: 'queued';
}

/** Pre-dispatch 任务的只读 session 快照。 */
export interface SessionQueuedTaskSnapshot {
  readonly taskId: string;
  readonly createdAt: string;
  readonly profileId: string;
  readonly operation: 'text-to-image' | 'image-edit';
  readonly prompt: string;
  readonly modelId?: string;
  readonly status: 'queued' | 'starting';
  readonly removable: boolean;
  readonly jobId?: string;
}

export interface ImagenSessionSnapshot {
  readonly selectedProfileId?: string;
  readonly selectedModelId?: string;
  readonly activeJobId?: string;
  readonly jobs: readonly JobSessionSnapshot[];
  readonly queuedTasks: readonly SessionQueuedTaskSnapshot[];
  readonly lastError?: ApplicationError;
}

export interface ImagenSessionCommands {
  readonly submitJob: (input: SubmitJobInput) => Promise<CommandResult<Job>>;
  readonly retryJob: (input: RetryJobInput) => Promise<CommandResult<Job>>;
  readonly getJob: (jobId: string) => Job | undefined;
  readonly subscribeJobEvents: (handler: JobEventHandler) => Unsubscribe;
  readonly putTaskRecord: (record: TaskRecord) => Promise<void>;
  readonly getProviderProfile: (profileId: string) => Promise<CommandResult<ProviderProfile>>;
}

export type ImagenSessionSubscriber = (snapshot: ImagenSessionSnapshot) => void;

export interface ImagenSessionController {
  readonly submitJob: (input: SubmitJobInput) => Promise<CommandResult<EnqueueAcknowledgement>>;
  readonly removeQueuedTask: (taskId: string) => boolean;
  readonly retryJob: (jobId: string) => Promise<CommandResult<Job>>;
  readonly getSnapshot: () => ImagenSessionSnapshot;
  readonly subscribe: (subscriber: ImagenSessionSubscriber) => Unsubscribe;
  readonly dispose: () => void;
}

export interface CreateImagenSessionOptions {
  readonly commands?: ImagenSessionCommands;
  readonly logger?: Logger;
}
