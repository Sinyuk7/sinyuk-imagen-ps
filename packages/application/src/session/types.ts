import type {
  CommandResult,
  Job,
  JobError,
  JobEventHandler,
  SubmitJobInput,
  Unsubscribe,
} from '../commands/types.js';

export type ApplicationError = JobError;

export interface JobSessionSnapshot {
  readonly id: string;
  readonly type: 'generate' | 'edit' | string;
  readonly status: string;
  readonly phase?: string;
  readonly canRetry: boolean;
  readonly canCancel: boolean;
  readonly output?: unknown;
  readonly error?: unknown;
}

export interface ImagenSessionSnapshot {
  readonly selectedProfileId?: string;
  readonly selectedModelId?: string;
  readonly activeJobId?: string;
  readonly jobs: readonly JobSessionSnapshot[];
  readonly lastError?: ApplicationError;
}

export interface ImagenSessionCommands {
  readonly submitJob: (input: SubmitJobInput) => Promise<CommandResult<Job>>;
  readonly retryJob: (jobId: string) => Promise<CommandResult<Job>>;
  readonly getJob: (jobId: string) => Job | undefined;
  readonly subscribeJobEvents: (handler: JobEventHandler) => Unsubscribe;
}

export type ImagenSessionSubscriber = (snapshot: ImagenSessionSnapshot) => void;

export interface ImagenSessionController {
  readonly submitJob: (input: SubmitJobInput) => Promise<CommandResult<Job>>;
  readonly retryJob: (jobId: string) => Promise<CommandResult<Job>>;
  readonly getSnapshot: () => ImagenSessionSnapshot;
  readonly subscribe: (subscriber: ImagenSessionSubscriber) => Unsubscribe;
  readonly dispose: () => void;
}

export interface CreateImagenSessionOptions {
  readonly commands?: ImagenSessionCommands;
}
