/**
 * Commands 层公开 API
 *
 * 导出命令函数与公开类型，作为 UI ↔ runtime 的唯一合规通路。
 * v1 三命令签名在发布后视为 stable，二期命令以追加方式引入。
 *
 * 边界约束：
 * - 仅暴露命令函数与公开类型
 * - 不暴露 runtime / getRuntime / store / dispatcher / registry
 */

// v1 Commands
export { submitJob } from './submit-job.js';
export { getJob } from './get-job.js';
export { subscribeJobEvents } from './subscribe-job-events.js';

// v2 Commands - Provider
export { listProviders } from './list-providers.js';
export { describeProvider } from './describe-provider.js';
export { getProviderConfig } from './get-provider-config.js';
export { saveProviderConfig } from './save-provider-config.js';

// v2 Commands - Job
export { retryJob } from './retry-job.js';

// v1 Types
export type { CommandResult, SubmitJobInput, JobEventHandler } from './types.js';

// v2 Types
export type { ConfigStorageAdapter, ProviderDescriptor, ProviderConfig } from './types.js';

// Config adapter injection (exposed for CLI / UI)
export { setConfigAdapter } from '../runtime.js';
