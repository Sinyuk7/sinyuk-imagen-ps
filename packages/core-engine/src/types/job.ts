/**
 * Job lifecycle 状态模型。
 *
 * 本文件所有类型均为 serializable 且 host-agnostic。
 */

import type { JobError } from '../errors.js';

/** Job 生命周期状态。 */
export type JobStatus = 'created' | 'running' | 'completed' | 'failed';

/** Job 输入 payload。 */
export type JobInput = Record<string, unknown>;

/** Job 完成后的输出 payload。 */
export type JobOutput = Record<string, unknown>;

/** 具有明确生命周期的单一工作单元。 */
export interface Job {
  /** Job 稳定标识符。 */
  readonly id: string;

  /** 当前生命周期状态。 */
  readonly status: JobStatus;

  /** 创建时提交的业务输入数据。 */
  readonly input: JobInput;

  /** 完成后产生的输出数据；未完成时为 undefined。 */
  readonly output: JobOutput | undefined;

  /** 当 status 为 `'failed'` 时的错误信息；否则为 undefined。 */
  readonly error: JobError | undefined;

  /** 创建时间戳（ISO 8601）。 */
  readonly createdAt: string;

  /** 最后更新时间戳（ISO 8601）。 */
  readonly updatedAt: string;

  /** 若本 job 为 retry 产物，指向原 failed job 的 id。 */
  readonly originJobId?: string;

  /** 当前 job 的重试次数；首次提交为 undefined，第一次 retry 为 1。 */
  readonly retryAttempt?: number;
}

/** 内存 JobStore 的最小契约。
 *
 *  精确语义（尤其是 retryJob）将在 `implement-state-infrastructure` 中收敛。
 */
export interface JobStore {
  /**
   * Submit a new job.
   *
   * INTENT: 将用户输入包装为新的 Job 并分配唯一 id。
   * INPUT: `input` — 本次 job 的业务输入数据。
   * OUTPUT: 新创建 Job 的 immutable snapshot。
   * SIDE EFFECT: 在 store 中插入一条 status 为 `'created'` 的记录。
   * FAILURE: 若 input 不符合序列化要求，抛出 `JobError`（`category: 'validation'`）。
   */
  submitJob(input: JobInput): Job;

  /**
   * Retrieve a job by id.
   *
   * INTENT: 查询单个 Job 的当前状态与数据。
   * INPUT: `id` — job 唯一标识。
   * OUTPUT: 对应的 Job 对象；若不存在则返回 `undefined`。
   * SIDE EFFECT: None（纯读取）。
   * FAILURE: 无抛错，未命中时返回 `undefined`。
   */
  getJob(id: string): Job | undefined;

  /**
   * Retry a failed job.
   *
   * INTENT: 对 status 为 `'failed'` 的 job 发起重试，生成新的执行单元。
   * INPUT: `id` — 失败 job 的标识。
   * OUTPUT: 新创建 Job 的 immutable snapshot（id 不同于原 job）。
   * SIDE EFFECT: 在 store 中创建新的 job 记录，新 job 的 `originJobId` 指向原 job，`retryAttempt` 递增。
   * FAILURE: 若指定 job 不存在或尚未失败，抛出 `JobError`（`category: 'validation'`）。
   */
  retryJob(id: string): Job;
}

/**
 * JobStore 的内部写能力，仅由 runner / runtime 内部装配使用。
 *
 * `controller` 不对外暴露给 host 层，防止 host 直接篡改状态真相。
 */
export interface JobStoreController {
  /**
   * 将 job 从 `'created'` 推进到 `'running'`。
   *
   * FAILURE: 若 job 不存在或当前状态不允许迁移，抛出 `JobError`。
   */
  markRunning(id: string): Job;

  /**
   * 将 job 从 `'running'` 推进到 `'completed'`，并设置 `output`。
   *
   * FAILURE: 若 job 不存在或当前状态不允许迁移，抛出 `JobError`。
   */
  markCompleted(id: string, output: JobOutput): Job;

  /**
   * 将 job 从 `'running'` 推进到 `'failed'`，并设置 `error`。
   *
   * FAILURE: 若 job 不存在或当前状态不允许迁移，抛出 `JobError`。
   */
  markFailed(id: string, error: JobError): Job;
}
