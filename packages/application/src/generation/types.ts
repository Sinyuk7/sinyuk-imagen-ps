import type { Job, JobError } from '@imagen-ps/core-engine';
import type { TaskRecord } from '../task.js';

/** 单次 backend execution 的 workflow 与 opaque input。 */
export interface JobExecutionRequest {
  /** 已注册 workflow 的稳定名称。 */
  readonly workflow: string;

  /** 仅由 matching backend/adapter 解释的输入。 */
  readonly input: Readonly<Record<string, unknown>>;
}

/** Application 向 generation backend 发起 admission 的通用信封。 */
export interface GenerationCommand {
  /** 用户意图对应的稳定 Task identity。 */
  readonly taskId: string;

  /** owning GenerationBackend 的稳定 id。 */
  readonly backendId: string;

  /** 仅由 matching backend 解释的 bounded payload。 */
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Session scheduler 使用的可选并发 lane。 */
export interface ExecutionLane {
  /** 非空 opaque lane identity。 */
  readonly key: string;

  /** 当前 lane 的正整数并发上限。 */
  readonly maxConcurrency: number;
}

/** Dispatch 前 backend readiness 的三态判定。 */
export type ReadinessDecision =
  | { readonly status: 'ready' }
  | { readonly status: 'wait'; readonly reason: JobError }
  | { readonly status: 'reject'; readonly error: JobError };

/** Backend 对用户 Retry 的 bounded policy。 */
export interface GenerationRetryPolicy {
  /** 当前 generation 是否允许创建新 execution attempt。 */
  readonly allowed: boolean;

  /** 禁止 Retry 时可展示的安全原因。 */
  readonly reason?: string;
}

/** Backend admission 完成后的 immutable queue handoff。 */
export interface AdmittedGeneration {
  /** 与 GenerationCommand 一致的 Task identity。 */
  readonly taskId: string;

  /** owning GenerationBackend 的稳定 id。 */
  readonly backendId: string;

  /** Core Job 将执行的 workflow 与 opaque input。 */
  readonly execution: JobExecutionRequest;

  /** Job 创建前尚无 latestJobId 的 v2 running Task snapshot。 */
  readonly runningTask: TaskRecord;

  /** 可选 backend-owned concurrency lane。 */
  readonly lane?: ExecutionLane;

  /** 当前 submission 的 Retry policy。 */
  readonly retry: GenerationRetryPolicy;
}

/** GenerationBackend terminal projection 的完整输入。 */
export interface TerminalProjectionInput {
  /** 本次 Job 对应的 frozen admission。 */
  readonly admitted: AdmittedGeneration;

  /** 已进入 terminal 状态的 Job。 */
  readonly job: Job;

  /** 已写入 latestJobId 的 running Task snapshot。 */
  readonly runningTask: TaskRecord;
}

/** GenerationBackend Retry reconstruction 的完整输入。 */
export interface RetryGenerationInput {
  /** 保留 identity 的 failed Task。 */
  readonly task: TaskRecord;

  /** Task 当前 latest execution attempt。 */
  readonly latestJob: Job;
}

/** Terminal Task 成功持久化后的 follow-up 输入。 */
export interface TerminalFollowUpInput {
  /** 本次 Job 对应的 frozen admission。 */
  readonly admitted: AdmittedGeneration;

  /** 已进入 terminal 状态的 Job。 */
  readonly job: Job;

  /** 已成功持久化的 terminal Task。 */
  readonly task: TaskRecord;
}

/** Application generation policy 的唯一 backend owner。 */
export interface GenerationBackend {
  /** Backend 的稳定 identity。 */
  readonly id: string;

  /** 校验并冻结 backend-specific submission。 */
  admit(command: GenerationCommand): Promise<AdmittedGeneration>;

  /** Job 创建前重检 submission 是否仍可执行。 */
  checkReadiness(submission: AdmittedGeneration): Promise<ReadinessDecision>;

  /** 把 terminal Job 投影为同一 Task 的 terminal snapshot。 */
  projectTerminal(input: TerminalProjectionInput): Promise<TaskRecord>;

  /** 可选 Retry reconstruction；保留 Task identity 并创建新 Job attempt。 */
  retry?(input: RetryGenerationInput): Promise<AdmittedGeneration>;

  /** 可选 terminal follow-up；只在 terminal Task 已持久化后调用。 */
  afterTerminal?(input: TerminalFollowUpInput): Promise<void>;
}
