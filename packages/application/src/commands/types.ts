/**
 * Commands 层公开类型定义。
 *
 * 本模块定义 commands 层的公共类型契约。
 */

import type { DurableJobRecord, JobError, JobEvent, JobInput, JobStatus, StoredAssetRef, TaskRecord, TaskStatus } from '@imagen-ps/core-engine';
import type { Logger } from '@imagen-ps/foundation';
import type {
  ApiFormat,
  BalanceChange,
  ExactTaskCost,
  ImageAspectRatio,
  ImageOutputSelection,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputMatrixCell,
  UserModelOutputExposure,
  ProviderBalanceSnapshot,
  ProviderDescriptor as _ProviderDescriptor,
  ProviderConfig as _ProviderConfig,
} from '@imagen-ps/providers';

// Re-export provider types for commands layer consumers
export type {
  ApiFormat,
  DiscoveredModel,
  EndpointClassification,
  ProviderDescriptor,
  ProviderConfig,
  ProviderModelInfo,
  ModelBrand,
  ImageAspectRatio,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputMatrixCell,
  OfficialModelPreset,
  ProviderModelExecution,
  ProviderResolvedOutput,
  UserModelOutputExposure,
  RequestStrategy,
  RequestStrategyId,
} from '@imagen-ps/providers';
export type { BalanceChange, ExactTaskCost, ProviderBalanceSnapshot } from '@imagen-ps/providers';
export type {
  Asset,
  DecodeTaskRecordResult,
  DurableJobRecord,
  FileEvidence,
  Job,
  JobError,
  JobEvent,
  JobStatus,
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
  Unsubscribe,
} from '@imagen-ps/core-engine';

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
 * Builtin workflow 名称 union。
 *
 * 约束 `submitJob` 的 workflow 参数仅能传入已知 workflow 名称。
 */
export type BuiltinWorkflowName = 'provider-generate' | 'provider-edit';

/**
 * `submitJob` 命令的输入参数。
 *
 * @property workflow - 要执行的 workflow 名称
 * @property input - job 输入数据，具体字段取决于 workflow 要求
 */
export interface SubmitJobInput {
  /** 要执行的 workflow 名称。 */
  readonly workflow: BuiltinWorkflowName;

  /** Job 输入数据。 */
  readonly input: JobInput;

  /** 可选取消信号；不进入 durable job input。 */
  readonly signal?: AbortSignal;

  /** 可选调用方 logger；不进入 durable job input。 */
  readonly logger?: Logger;
}

/**
 * `retryJob` 命令的输入参数。
 *
 * @property jobId - 要重试的失败 job id
 * @property logger - 可选调用方 logger；不进入 durable job input
 */
export interface RetryJobInput {
  /** 要重试的失败 job id。 */
  readonly jobId: string;

  /** 可选调用方 logger；不进入 durable job input。 */
  readonly logger?: Logger;
}

/** Job lifecycle 事件处理器，接收所有事件类型 */
export type JobEventHandler = (event: JobEvent) => void;

/** JSON primitive supported by profile non-secret config. */
export type ProviderProfileConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly ProviderProfileConfigValue[]
  | { readonly [key: string]: ProviderProfileConfigValue };

/**
 * Non-secret API-format-specific provider profile config.
 *
 * This object MAY include values such as connection, defaultModel, timeoutMs,
 * and extraHeaders. It MUST NOT include secret values such as
 * apiKey, accessToken, refreshToken, or vendor credentials. ProviderConfig.apiKey
 * should be stored via secretRefs.apiKey with the secret
 * value stored via SecretStorageAdapter.
 */
export type ProviderProfileConfig = Readonly<Record<string, ProviderProfileConfigValue>>;

/**
 * Sanitized persisted provider profile. Returned commands MUST NOT include secret values.
 *
 * Profile 模型选择由 `selectedModelIds/defaultModelId` 表达。远端
 * discovery 事实存放在独立 `ModelDiscoveryCacheRepository`。
 */
export interface ProviderProfile {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly systemInstruction?: string;
  readonly enabled: boolean;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly selectedModelIds: readonly string[];
  readonly defaultModelId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for saving a provider profile.
 *
 * This is an upsert-style input: create may provide full fields, update may
 * provide partial fields and rely on existing profile state.
 *
 * secretValues are write-only command input. They are persisted through
 * SecretStorageAdapter and must never be returned by profile-facing commands.
 *
 * NOTE: 本类型 MUST NOT 声明 discovery cache 字段。远端发现事实由
 * `refreshProfileModels` 写入 `ModelDiscoveryCacheRepository`。
 */
export interface ProviderProfileInput {
  readonly profileId: string;
  readonly apiFormat?: ApiFormat;
  readonly displayName?: string;
  readonly systemInstruction?: string;
  readonly enabled?: boolean;
  readonly config?: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
  readonly selectedModelIds?: readonly string[];
  readonly defaultModelId?: string;
  /** 显式移除已保存 secret；未列出的空输入继续表示保留原 secret。 */
  readonly removedSecretNames?: readonly string[];
}

/** Host-injected repository for persisted, sanitized provider profiles. */
export interface ProviderProfileRepository {
  list(): Promise<readonly ProviderProfile[]>;
  get(profileId: string): Promise<ProviderProfile | undefined>;
  save(profile: ProviderProfile): Promise<void>;
  delete(profileId: string): Promise<void>;
}

/** 单个 profile 的远端 discovery cache。 */
export interface ModelDiscoveryCache {
  readonly profileId: string;
  readonly modelIds: readonly string[];
  readonly refreshedAt: string;
}

/** Host-injected repository for remote discovery facts. */
export interface ModelDiscoveryCacheRepository {
  get(profileId: string): Promise<ModelDiscoveryCache | undefined>;
  put(cache: ModelDiscoveryCache): Promise<void>;
  delete(profileId: string): Promise<void>;
}

export interface ModelGenerationPreferenceKey {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly operation: ImageOperation;
}

export interface ModelGenerationPreference extends ModelGenerationPreferenceKey {
  readonly selection: ImageOutputSelection;
}

export type SaveModelGenerationPreferenceInput = ModelGenerationPreference;

export interface ModelGenerationPreferenceSelection {
  readonly selection: ImageOutputSelection;
  readonly effectiveSelection: ImageOutputSelection;
  readonly imageSize: ImageOutputImageSize;
  readonly ratio: ImageAspectRatio;
  readonly outputFormat: ImageOutputFormat;
  readonly normalized: boolean;
}

export interface ModelGenerationSettings {
  readonly key: ModelGenerationPreferenceKey;
  readonly matrix: ImageOutputMatrix;
  readonly preference: ModelGenerationPreference | null;
  readonly selection: ModelGenerationPreferenceSelection;
  readonly cell: ImageOutputMatrixCell;
  readonly source: 'preference' | 'default';
}

/** Host-injected repository for model-scoped generation output preferences. */
export interface ModelGenerationPreferenceRepository {
  get(key: ModelGenerationPreferenceKey): Promise<ModelGenerationPreference | undefined>;
  save(preference: ModelGenerationPreference): Promise<void>;
  delete(key: ModelGenerationPreferenceKey): Promise<void>;
}

export interface UserModelConfig {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly baseModelId: string;
  readonly wireModelId: string;
  readonly requestStrategyId: string;
  readonly outputExposure: UserModelOutputExposure;
  /** 由 `outputExposure` 派生的运行时投影；不是用户编辑的能力真相。 */
  readonly outputMatrix: readonly ImageOutputMatrix[];
}

export interface SaveUserModelConfigInput {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly baseModelId: string;
  readonly wireModelId: string;
  readonly requestStrategyId: string;
  readonly outputExposure: UserModelOutputExposure;
}

/** Host-injected repository for user-owned model configs. */
export interface UserModelConfigRepository {
  list(apiFormat?: ApiFormat): Promise<readonly UserModelConfig[]>;
  get(apiFormat: ApiFormat, modelId: string): Promise<UserModelConfig | undefined>;
  save(config: UserModelConfig): Promise<void>;
  delete(apiFormat: ApiFormat, modelId: string): Promise<void>;
}

export interface ProfileModelItem {
  readonly modelId: string;
  readonly displayName?: string;
  readonly wireModelId?: string;
  readonly discovered: boolean;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly default: boolean;
  readonly configSource?: 'user' | 'catalog';
}

/** Host-injected storage for secret values. Implementations must not log values. */
export interface SecretStorageAdapter {
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

/** Host-injected durable history store for sanitized terminal job records. */
export interface JobHistoryStore {
  put(record: DurableJobRecord): Promise<void>;
  get(jobId: string): Promise<DurableJobRecord | undefined>;
  list(query?: { readonly limit?: number; readonly status?: JobStatus }): Promise<readonly DurableJobRecord[]>;
  delete(jobId: string): Promise<void>;
}

/** Host-injected durable task store. Upsert is keyed by taskId. */
export interface TaskStore {
  put(record: TaskRecord): Promise<void>;
  get(taskId: string): Promise<TaskRecord | undefined>;
  list(query?: { readonly limit?: number; readonly status?: TaskStatus }): Promise<readonly TaskRecord[]>;
  delete(taskId: string): Promise<void>;
}

/** Host-injected binary asset store. Implementations own host-specific object resolution. */
export interface AssetStore {
  put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef>;
  resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined>;
  delete(ref: StoredAssetRef): Promise<void>;
}

/** Minimal abstraction for resolving a single secret reference. */
export interface SecretResolver {
  resolveSecret(ref: string): Promise<string | undefined>;
}

/** Runtime config resolved for a single dispatch/validation scope. */
export interface ResolvedProviderConfig {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly implementationId: string;
  readonly providerConfig: ProviderConfig;
}

/** Resolves a persisted profile plus secrets into provider-validated runtime config. */
export interface ProviderConfigResolver {
  resolve(profileId: string): Promise<ResolvedProviderConfig>;
}

export interface DeleteProviderProfileOptions {
  readonly retainSecrets?: boolean;
}

/** `testProviderProfile` 的分层开关。 */
export interface TestProviderProfileOptions {
  /** 跑无生成连接验证（不花钱）。 */
  readonly connect?: boolean;
  /** 跑最小 text_to_image 烟雾测试（花钱，需 connect 成功）。 */
  readonly generate?: boolean;
}

export type ConnectionTestStatus = 'verified' | 'partial' | 'failed';

export interface ProviderProfileTestResult {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly valid: true;
  /** Layer 2：connect 测试结果，仅在 options.connect 时存在。 */
  readonly connectivity?: {
    readonly status: ConnectionTestStatus;
    /** 无生成连接验证的安全摘要。 */
    readonly message?: string;
  };
  /** Layer 3：generate 烟雾测试结果，仅在 options.generate 且 connect 成功时存在。 */
  readonly smokeTest?: {
    readonly passed: boolean;
    readonly assetCount?: number;
    readonly modelUsed?: string;
  };
}

export type EndpointMeasurementFailureKind =
  | 'dns'
  | 'connect'
  | 'timeout'
  | 'auth'
  | 'rate-limit'
  | 'invalid-response'
  | 'unsupported'
  | 'unknown';

export interface EndpointMeasurementResult {
  readonly endpointId: string;
  readonly status: 'success' | 'failed';
  readonly latencyMs?: number;
  readonly checkedAt: number;
  readonly failureKind?: EndpointMeasurementFailureKind;
  readonly httpStatus?: number;
  readonly errorMessage?: string;
}

export interface MeasureProfileEndpointsInput {
  readonly profileId?: string;
  readonly apiFormat?: ApiFormat;
  readonly displayName?: string;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
  /** 测试草稿时排除这些已保存 secret。 */
  readonly removedSecretNames?: readonly string[];
  /** Auto 模式下稳定 tie-breaker 的当前 resolved endpoint。 */
  readonly currentResolvedEndpointId?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxConcurrency?: number;
}

export interface ProviderProfileConnectionTestResult {
  readonly status: ConnectionTestStatus;
  readonly message?: string;
}

export interface TestProviderProfileConnectionInput {
  readonly profileId?: string;
  readonly apiFormat?: ApiFormat;
  readonly displayName?: string;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
  readonly removedSecretNames?: readonly string[];
  readonly selectedModelIds?: readonly string[];
  readonly defaultModelId?: string;
}

export interface ProfileBalanceResult {
  readonly apiFormat: ApiFormat;
  readonly profileId: string;
  readonly checkedAt: number;
  readonly snapshot: ProviderBalanceSnapshot;
}

export interface ProfileBillingState {
  readonly balance?: ProfileBalanceResult;
  readonly lastExactTaskCost?: ExactTaskCost;
  readonly lastBalanceChange?: BalanceChange;
  readonly refreshState: 'idle' | 'refreshing' | 'error';
}

export interface RefreshProfileBalanceInput {
  readonly profileId: string;
  readonly signal?: AbortSignal;
}

export interface RefreshProfileBalanceResult extends ProfileBalanceResult {
  readonly state: ProfileBillingState;
}

export interface MeasureProfileEndpointsResult {
  readonly supported: boolean;
  readonly results: readonly EndpointMeasurementResult[];
  readonly resolvedEndpointId?: string;
  readonly message?: string;
}

export interface RefreshDraftProfileModelsInput {
  readonly profileId?: string;
  readonly apiFormat?: ApiFormat;
  readonly displayName?: string;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
  readonly removedSecretNames?: readonly string[];
  readonly selectedModelIds?: readonly string[];
  readonly defaultModelId?: string;
}
