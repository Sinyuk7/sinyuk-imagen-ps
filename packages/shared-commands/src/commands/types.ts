/**
 * Commands 层公开类型定义。
 *
 * 本模块定义 commands 层的公共类型契约，
 * 首版三命令 + 三类型签名在发布后视为 v1 stable。
 * 二期类型包括 ConfigStorageAdapter、ProviderDescriptor、ProviderConfig。
 */

import type { JobError, JobEvent, JobInput } from '@imagen-ps/core-engine';
import type {
  ProviderDescriptor as _ProviderDescriptor,
  ProviderConfig as _ProviderConfig,
} from '@imagen-ps/providers';

// Re-export provider types for commands layer consumers
export type { ProviderDescriptor, ProviderConfig } from '@imagen-ps/providers';

// 为本模块内部使用引入类型别名
type ProviderConfig = _ProviderConfig;

/**
 * 命令执行结果的统一 Result 包装。
 *
 * 成功时返回 `{ ok: true, value: T }`，
 * 失败时返回 `{ ok: false, error: JobError }`。
 */
export type CommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: JobError };

/**
 * v1 builtin workflow 名称 union。
 *
 * 约束 `submitJob` 的 workflow 参数仅能传入已知 workflow 名称。
 */
export type BuiltinWorkflowName = 'provider-generate' | 'provider-edit';

/**
 * `submitJob` 命令的输入参数。
 *
 * @property workflow - 要执行的 workflow 名称
 * @property input - job 输入数据，具体字段取决于 workflow 要求
 *
 * 各 workflow 必需字段：
 * - `provider-generate`: `provider` (string), `prompt` (string)
 * - `provider-edit`: `provider` (string), `prompt` (string), `source` (AssetRef)
 */
export interface SubmitJobInput {
  /** 要执行的 workflow 名称。 */
  readonly workflow: BuiltinWorkflowName;

  /** Job 输入数据。 */
  readonly input: JobInput;
}

/** Job lifecycle 事件处理器，接收所有事件类型 */
export type JobEventHandler = (event: JobEvent) => void;

/**
 * Config 持久化 adapter 接口
 *
 * 由 CLI / UI 注入具体实现，默认使用 in-memory adapter。
 */
export interface ConfigStorageAdapter {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  save(providerId: string, config: ProviderConfig): Promise<void>;
}
