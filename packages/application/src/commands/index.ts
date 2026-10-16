/**
 * Commands 层公开 API
 *
 * 导出命令函数与公开类型，作为 UI ↔ runtime 的唯一合规通路。
 *
 * 边界约束：
 * - 仅暴露命令函数与公开类型
 * - 不暴露 runtime / getRuntime / store / dispatcher / registry
 */

export { listProviderAccounts, saveProviderAccount } from './provider-accounts.js';
export { getCatalogParameterPreference, saveCatalogParameterPreference } from './catalog-parameter-preferences.js';
export { executeJob } from './execute-job.js';
export type { ExecuteJobInput } from './execute-job.js';
export { getJob } from './get-job.js';
export { subscribeJobEvents } from './subscribe-job-events.js';

export { listProviders } from './list-providers.js';
export { getProviderCatalog } from './provider-catalog.js';
export { describeProvider } from './describe-provider.js';
export { resolveModelBrand } from './resolve-model-brand.js';
export type { ResolveModelBrandInput } from './resolve-model-brand.js';
export { resolveProviderMaskExecutionPlan } from './provider-mask-plan.js';
export type { MaskExecutionPlan } from '@imagen-ps/providers';

export { getJobHistoryRecord, listJobHistoryRecords } from './job-history.js';
export { getTaskRecord, listTaskRecords, putTaskRecord, reconcileStaleRunningTaskRecords } from './task-history.js';
export type { ListTaskRecordsQuery } from './task-history.js';
export { resolveSecretValue } from './secret-utils.js';
export { assertTaskRecord, decodeTaskRecord, sanitizeTaskEvidenceUrl } from '../task.js';
export type {
  CommandResult,
  CatalogParameterPreference,
  CatalogParameterPreferenceRepository,
  AssetStore,
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
  EndpointClassification,
  Rect,
  ResolvedPreview,
  ResolvedTaskResource,
  StoredAssetRef,
  TaskAttachment,
  TaskEvidence,
  TaskError,
  TaskExecutionIdentity,
  TaskExecutionSummary,
  TaskOperation,
  TaskOutput,
  TaskPlacement,
  TaskRecord,
  TaskResourceRef,
  TaskStatus,
  TaskStore,
  Unsubscribe,
} from './types.js';

export type { ProviderId } from '@imagen-ps/providers';
export type { ImageOutputSelection, FixedProviderId } from '@imagen-ps/providers';

export type {
  ProviderConfig,
  ProviderDescriptor,
  ModelBrand,
  ProviderModelInfo,
  ProviderAccount,
  ProviderAccountRepository,
  SecretResolver,
  SecretStorageAdapter,
} from './types.js';


// Adapter injection（暴露给 UI / host adapters 注入自定义实现）
export {
  getAssetStore,
  getProviderAccountRepository,
  getFixedProviderResolver,
  getCatalogParameterPreferenceRepository,
  setAssetStore,
  setProviderAccountRepository,
  setCatalogParameterPreferenceRepository,
  setJobHistoryStore,
  setSecretStorageAdapter,
  setTaskStore,
  configureRuntimeLogging,
  getRuntimeLogger,
} from '../runtime.js';
