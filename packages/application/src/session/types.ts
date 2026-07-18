import type { Job, JobError, JobEventHandler, Unsubscribe } from '../commands/types.js';
import type { ExecuteJobInput } from '../commands/execute-job.js';
import type { CommandResult } from '../commands/types.js';
import type { GenerationBackend, GenerationCommand } from '../generation/types.js';
import type { TaskRecord } from '../task.js';
import type { Logger } from '@imagen-ps/foundation';

/** Session 对外暴露的 bounded Application error。 */
export type ApplicationError = JobError;

/** Session 中单次 Job attempt 的 UI snapshot。 */
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

/** Session queue 接受 generation 后的公开确认。 */
export interface EnqueueAcknowledgement {
  readonly taskId: string;
  readonly status: 'queued';
}

/** Pre-dispatch work 的最小只读 UI snapshot。 */
export interface SessionQueuedTaskSnapshot {
  readonly taskId: string;
  readonly status: 'queued' | 'starting';
  readonly removable: boolean;
  readonly jobId?: string;
}

/** Application Session 当前公开状态。 */
export interface ImagenSessionSnapshot {
  readonly jobs: readonly JobSessionSnapshot[];
  readonly queuedTasks: readonly SessionQueuedTaskSnapshot[];
  readonly lastError?: ApplicationError;
}

/** Session 依赖的 generic Application commands。 */
export interface ImagenSessionCommands {
  readonly executeJob: (input: ExecuteJobInput) => Promise<CommandResult<Job>>;
  readonly getJob: (jobId: string) => Job | undefined;
  readonly subscribeJobEvents: (handler: JobEventHandler) => Unsubscribe;
  readonly putTaskRecord: (record: TaskRecord) => Promise<void>;
  readonly getTaskRecord: (taskId: string) => Promise<TaskRecord | undefined>;
}

/** Session snapshot subscriber。 */
export type ImagenSessionSubscriber = (snapshot: ImagenSessionSnapshot) => void;

/** Backend-neutral Application Session controller。 */
export interface ImagenSessionController {
  readonly submitJob: (command: GenerationCommand) => Promise<CommandResult<EnqueueAcknowledgement>>;
  readonly removeQueuedTask: (taskId: string) => boolean;
  readonly retryJob: (jobId: string) => Promise<CommandResult<Job>>;
  readonly getSnapshot: () => ImagenSessionSnapshot;
  readonly subscribe: (subscriber: ImagenSessionSubscriber) => Unsubscribe;
  readonly dispose: () => void;
}

/** 创建 Application Session 的 composition options。 */
export interface CreateImagenSessionOptions {
  readonly backends?: readonly GenerationBackend[];
  readonly commands?: Partial<ImagenSessionCommands>;
  readonly logger?: Logger;
}
