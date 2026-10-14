/**
 * Commands 层公开 API
 *
 * 导出命令函数与公开类型，作为 UI ↔ runtime 的唯一合规通路。
 *
 * 边界约束：
 * - 仅暴露命令函数与公开类型
 * - 不暴露 runtime / getRuntime / store / dispatcher / registry
 */

export { executeJob } from './execute-job.js';
export type { ExecuteJobInput } from './execute-job.js';
export { getJob } from './get-job.js';
export { subscribeJobEvents } from './subscribe-job-events.js';

export { listProviders } from './list-providers.js';
export { describeProvider } from './describe-provider.js';
export { projectProviderSurface, saveProviderSurfaceProfile } from './provider-surface.js';
export { resolveModelBrand } from './resolve-model-brand.js';
export type { ResolveModelBrandInput } from './resolve-model-brand.js';
export { resolveProviderMaskExecutionPlan } from './provider-mask-plan.js';
export type { MaskExecutionPlan } from '@imagen-ps/providers';
export {
  deleteProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  recoverProviderProfileSetups,
  testProviderProfile,
} from './provider-profiles.js';
export {
  listProfileModels,
} from './profile-models.js';
export {
  listOfficialModelConfigPresets,
} from './model-configs.js';
export {
  deleteModelGenerationPreference,
  getModelGenerationSettings,
  saveModelGenerationPreference,
} from './model-generation-preferences.js';
export { testProviderProfileConnection } from './profile-connection-test.js';
export {
  getProfileBillingState,
  invalidateProfileBillingState,
  noteProfileTaskBilling,
  refreshProfileBalance,
  scheduleProfileBalanceRefresh,
} from './profile-billing.js';

export { getJobHistoryRecord, listJobHistoryRecords } from './job-history.js';
export { getTaskRecord, listTaskRecords, putTaskRecord, reconcileStaleRunningTaskRecords } from './task-history.js';
export type { ListTaskRecordsQuery } from './task-history.js';
export { resolveSecretValue } from './secret-utils.js';
export { assertTaskRecord, decodeTaskRecord, sanitizeTaskEvidenceUrl } from '../task.js';
export type {
  CommandResult,
  ApiFormat,
  DeleteProviderProfileOptions,
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
  ProviderProfileTestResult,
  ProviderProfileConnectionTestResult,
  EndpointMeasurementFailureKind,
  EndpointMeasurementResult,
  EndpointClassification,
  ExactTaskCost,
  BalanceChange,
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  ImageOutputMatrix,
  ImageOutputMatrixCell,
  OfficialModelPreset,
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
  ModelGenerationPreferenceSelection,
  ModelGenerationSettings,
  MeasureProfileEndpointsInput,
  MeasureProfileEndpointsResult,
  RefreshDraftProfileModelsInput,
  ProfileBalanceResult,
  ProfileBillingState,
  ProviderResolvedOutput,
  UserModelOutputExposure,
  RefreshProfileBalanceInput,
  RefreshProfileBalanceResult,
  RequestStrategy,
  RequestStrategyId,
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
  TestProviderProfileConnectionInput,
  TestProviderProfileOptions,
  Unsubscribe,
} from './types.js';

export type {
  ProviderConfig,
  ProviderConfigResolver,
  ProviderDescriptor,
  ModelBrand,
  ProfileModelItem,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  ProviderProfileLifecycle,
  ProviderProfileRepository,
  ResolvedProviderConfig,
  SaveModelGenerationPreferenceInput,
  SecretResolver,
  SecretStorageAdapter,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';
export type {
  ProviderSurfaceIdentity,
  ProviderSurfaceProjection,
  SaveProviderSurfaceProfileInput,
} from './provider-surface.js';

// Adapter injection（暴露给 UI / host adapters 注入自定义实现）
export {
  getAssetStore,
  getModelGenerationPreferenceRepository,
  getUserModelConfigRepository,
  setAssetStore,
  setJobHistoryStore,
  setModelGenerationPreferenceRepository,
  setProviderConfigResolver,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setUserModelConfigRepository,
  setTaskStore,
  configureRuntimeLogging,
  getRuntimeLogger,
} from '../runtime.js';
