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
export { probeProfileEndpoints } from './profile-endpoints.js';
export {
  getProfileBillingState,
  invalidateProfileBillingState,
  noteProfileTaskBilling,
  refreshProfileBalance,
  scheduleProfileBalanceRefresh,
} from './profile-billing.js';

export { retryJob } from './retry-job.js';
export { getJobHistoryRecord, listJobHistoryRecords } from './job-history.js';
export { getTaskRecord, listTaskRecords, putTaskRecord } from './task-history.js';
export { resolveSecretValue } from './secret-utils.js';
export { assertTaskRecord, decodeTaskRecord, sanitizeTaskEvidenceUrl } from '@imagen-ps/core-engine';
export {
  PROMPT_OPTIMIZER_PROFILE_ID,
  ensurePromptOptimizerProfile,
  optimizePrompt,
  validatePromptOptimizerProfile,
} from './prompt-optimize.js';
export type { OptimizePromptInput } from './prompt-optimize.js';

export type {
  CommandResult,
  DeleteProviderProfileOptions,
  AssetStore,
  SubmitJobInput,
  Asset,
  DecodeTaskRecordResult,
  DurableJobRecord,
  FileEvidence,
  Job,
  JobError,
  JobEvent,
  JobEventHandler,
  JobStatus,
  JobHistoryStore,
  ProviderProfileTestResult,
  EndpointProbeFailureKind,
  EndpointProbeResult,
  ExactTaskCost,
  BalanceChange,
  ProfileBalanceResult,
  ProfileBillingState,
  ProbeProfileEndpointsInput,
  ProbeProfileEndpointsResult,
  RefreshProfileBalanceInput,
  RefreshProfileBalanceResult,
  Rect,
  ResolvedPreview,
  ResolvedTaskResource,
  StoredAssetRef,
  TaskAttachment,
  TaskEvidence,
  TaskError,
  TaskExecutionSnapshot,
  TaskOperation,
  TaskOutput,
  TaskPlacement,
  TaskRecord,
  TaskResourceRef,
  TaskStatus,
  TaskStore,
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

// Adapter injection（暴露给 UI / host adapters 注入自定义实现）
export {
  getAssetStore,
  setAssetStore,
  setJobHistoryStore,
  setProviderConfigResolver,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
  configureRuntimeLogging,
  getRuntimeLogger,
} from '../runtime.js';
