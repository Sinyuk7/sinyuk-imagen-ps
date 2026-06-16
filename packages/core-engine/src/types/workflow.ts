/**
 * Declarative workflow 与 step 类型。
 *
 * `transform` 与 `io` 仅为 StepKind 保留值；
 * 当前阶段不具执行语义。
 */

/** Step 执行类型判别式。 */
export type StepKind = 'provider' | 'transform' | 'io';

/** Workflow 中的单个 step。
 *
 *  Step 以声明式顺序排列，由 engine 负责执行调度。
 */
export interface Step {
  /** 可读名称（outputKey 缺失时亦作为默认 output key）。 */
  readonly name: string;

  /** 执行类型判别字段。 */
  readonly kind: StepKind;

  /** 静态或模板化的运行时 input。
   *
   *  值可通过 binding syntax 引用前序 step 的 output，
   *  由 runner 在执行阶段解析。
   */
  readonly input?: Record<string, unknown>;

  /** 本 step 输出被发布后用于下游绑定的 key。
   *
   *  省略时默认取值为 `name`。
   */
  readonly outputKey?: string;
}

/** 具名、带版本的 declarative step 序列。 */
export interface Workflow {
  /** Workflow 唯一标识。 */
  readonly name: string;

  /** 按顺序执行的 step 列表。 */
  readonly steps: readonly Step[];

  /** 可选版本标记，用于兼容性判断。 */
  readonly version?: string;
}

/** Workflow 注册表的最小契约。 */
export interface WorkflowRegistry {
  /**
   * 注册一个 workflow spec。
   *
   * FAILURE: 若 name 冲突或 workflow shape 不满足最小约束，抛出 `JobError`。
   */
  register(workflow: Workflow): Workflow;

  /**
   * 按名称读取 workflow。
   *
   * OUTPUT: 返回 immutable workflow snapshot；未命中时返回 `undefined`。
   */
  get(name: string): Workflow | undefined;

  /**
   * 列出当前已注册的全部 workflow。
   *
   * OUTPUT: 返回按注册顺序排列的 immutable workflow snapshots。
   */
  list(): readonly Workflow[];
}
