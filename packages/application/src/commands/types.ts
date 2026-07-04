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
  ProviderBalanceSnapshot,
  ProviderDescriptor as _ProviderDescriptor,
  ProviderConfig as _ProviderConfig,
  ProviderModelInfo,
} from '@imagen-ps/providers';

// Re-export provider types for commands layer consumers
export type { ApiFormat, EndpointClassification, ProviderDescriptor, ProviderConfig, ProviderModelInfo, ModelBrand } from '@imagen-ps/providers';
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
 * `models` 字段唯一来源是 `refreshProfileModels` 写入的「当前运行时可选模型交集」缓存：
 * `saveProviderProfile` 不会接受用户传入的 `models`、不会擦除现有缓存；
 * dispatch 路径与 `model-selection` 三级优先级 MUST NOT 读取该字段；
 * 它仅供 `listProfileModels`、connectivity 状态、与 surface-side picker 渲染使用。
 */
export interface ProviderProfile {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly models?: readonly ProviderModelInfo[];
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
 * NOTE: 本类型 MUST NOT 声明 `models` 字段。`profile.models` 的唯一来源是
 * `refreshProfileModels` 的 discovery 缓存，输入路径不接受用户提供 model 列表。
 */
export interface ProviderProfileInput {
  readonly profileId: string;
  readonly apiFormat?: ApiFormat;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly config?: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
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
  /** 调 discoverModels 测连通性（不花钱）。 */
  readonly connect?: boolean;
  /** 跑最小 text_to_image 烟雾测试（花钱，需 connect 成功）。 */
  readonly generate?: boolean;
}

export interface ProviderProfileTestResult {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly valid: true;
  /** Layer 2：connect 测试结果，仅在 options.connect 时存在。 */
  readonly connectivity?: {
    readonly reachable: boolean;
    /** 当前本地 catalog 与 runtime discovery 的可选交集数量。 */
    readonly modelCount?: number;
    readonly models?: readonly ProviderModelInfo[];
    /** 连通性失败时的安全错误摘要，不包含 resolved secret-bearing config。 */
    readonly errorMessage?: string;
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
  readonly supported: boolean;
  readonly reachable?: boolean;
  readonly modelCount?: number;
  readonly models?: readonly ProviderModelInfo[];
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
}
