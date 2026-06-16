/**
 * Commands 层公开类型定义。
 *
 * 本模块定义 commands 层的公共类型契约。
 */

import type { DurableJobRecord, JobError, JobEvent, JobInput, JobStatus, StoredAssetRef } from '@imagen-ps/core-engine';
import type {
  ProviderDescriptor as _ProviderDescriptor,
  ProviderConfig as _ProviderConfig,
  ProviderFamily,
  ProviderModelInfo,
} from '@imagen-ps/providers';

// Re-export provider types for commands layer consumers
export type { ProviderDescriptor, ProviderConfig, ProviderFamily, ProviderModelInfo } from '@imagen-ps/providers';
export type { Asset, DurableJobRecord, Job, JobError, JobEvent, JobStatus, StoredAssetRef, Unsubscribe } from '@imagen-ps/core-engine';

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
 * Non-secret family-specific provider profile config.
 *
 * This object MAY include values such as baseURL, defaultModel, timeoutMs, and
 * extraHeaders. It MUST NOT include secret values such as
 * apiKey, accessToken, refreshToken, or vendor credentials. Legacy
 * ProviderConfig.apiKey should be migrated to secretRefs.apiKey with the secret
 * value stored via SecretStorageAdapter.
 */
export type ProviderProfileConfig = Readonly<Record<string, ProviderProfileConfigValue>>;

/**
 * Sanitized persisted provider profile. Returned commands MUST NOT include secret values.
 *
 * `models` 字段唯一来源是 `refreshProfileModels` 写入的 discovery 缓存：
 * `saveProviderProfile` 不会接受用户传入的 `models`、不会擦除现有缓存；
 * dispatch 路径与 `model-selection` 三级优先级 MUST NOT 读取该字段；
 * 它仅供 `listProfileModels` 与 surface-side model picker 渲染使用。
 */
export interface ProviderProfile {
  readonly profileId: string;
  readonly providerId: string;
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
  readonly providerId?: string;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly config?: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly secretValues?: Readonly<Record<string, string>>;
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
  readonly family: ProviderFamily;
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
  readonly providerId: string;
  readonly family: ProviderFamily;
  readonly valid: true;
  /** Layer 2：connect 测试结果，仅在 options.connect 时存在。 */
  readonly connectivity?: {
    readonly reachable: boolean;
    readonly modelCount?: number;
    readonly models?: readonly ProviderModelInfo[];
  };
  /** Layer 3：generate 烟雾测试结果，仅在 options.generate 且 connect 成功时存在。 */
  readonly smokeTest?: {
    readonly passed: boolean;
    readonly assetCount?: number;
    readonly modelUsed?: string;
  };
}
