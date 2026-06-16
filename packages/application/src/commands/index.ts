/**
 * Commands 层公开 API
 *
 * 导出命令函数与公开类型，作为 UI ↔ runtime 的唯一合规通路。
 *
 * 边界约束：
 * - 仅暴露命令函数与公开类型
 * - 不暴露 runtime / getRuntime / store / dispatcher / registry
 */

export { submitJob } from './submit-job.js';
export { getJob } from './get-job.js';
export { subscribeJobEvents } from './subscribe-job-events.js';

export { listProviders } from './list-providers.js';
export { describeProvider } from './describe-provider.js';
export {
  deleteProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  saveProviderProfile,
  testProviderProfile,
} from './provider-profiles.js';
export {
  listProfileModels,
  refreshProfileModels,
} from './profile-models.js';

export { retryJob } from './retry-job.js';
export { getJobHistoryRecord, listJobHistoryRecords } from './job-history.js';
export { resolveSecretValue } from './secret-utils.js';

export type {
  CommandResult,
  DeleteProviderProfileOptions,
  AssetStore,
  SubmitJobInput,
  Asset,
  DurableJobRecord,
  Job,
  JobError,
  JobEvent,
  JobEventHandler,
  JobStatus,
  JobHistoryStore,
  ProviderProfileTestResult,
  StoredAssetRef,
  TestProviderProfileOptions,
  Unsubscribe,
} from './types.js';

export type {
  ProviderConfig,
  ProviderConfigResolver,
  ProviderDescriptor,
  ProviderFamily,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  ProviderProfileInput,
  ProviderProfileRepository,
  ResolvedProviderConfig,
  SecretResolver,
  SecretStorageAdapter,
} from './types.js';

// Adapter injection (exposed for CLI / UI)
export {
  setAssetStore,
  setJobHistoryStore,
  setProviderConfigResolver,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '../runtime.js';
