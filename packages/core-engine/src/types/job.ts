/**
 * Job lifecycle 状态模型。
 *
 * 本文件所有类型均为 serializable 且 host-agnostic。
 */

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
  readonly error: unknown | undefined;

  /** 创建时间戳（ISO 8601）。 */
  readonly createdAt: string;

  /** 最后更新时间戳（ISO 8601）。 */
  readonly updatedAt: string;
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
   * OUTPUT: 新创建 Job 的稳定 id。
   * SIDE EFFECT: 在 store 中插入一条 status 为 `'created'` 的记录。
   * FAILURE: 若 input 不符合序列化要求，行为暂定（待 invariant-guards 收敛后补全）。
   */
  submitJob(input: JobInput): string;

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
   * OUTPUT: 重试后的 job id（可能是新 id 或原 id，暂定）。
   * SIDE EFFECT: 在 store 中创建新的 job 记录或更新原记录状态。
   * FAILURE: 若指定 job 不存在或尚未失败，行为暂定（待实现时收敛）。
   */
  retryJob(id: string): string;
}
