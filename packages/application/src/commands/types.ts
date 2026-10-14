/**
 * Commands 层公开类型定义。
 *
 * 本模块定义 commands 层的公共类型契约。
 */

import type { DurableJobRecord, JobError, JobEvent, JobStatus, StoredAssetRef } from '@imagen-ps/core-engine';
import type { FixedProviderId } from '@imagen-ps/providers';

// Re-export provider types for commands layer consumers
export type { FixedProviderId, ProviderDescriptor, ProviderConfig, ProviderModelInfo, ModelBrand, ProviderModelExecution, EndpointClassification } from '@imagen-ps/providers';
export type {
  Asset,
  DurableJobRecord,
  Job,
  JobError,
  JobEvent,
  JobStatus,
  StoredAssetRef,
  Unsubscribe,
} from '@imagen-ps/core-engine';
export type {
  DecodeTaskRecordResult,
  FileEvidence,
  Rect,
  ResolvedPreview,
  ResolvedTaskResource,
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
} from '../task.js';

// 为本模块内部使用引入类型别名

/**
 * 命令执行结果的统一 Result 包装。
 *
 * 成功时返回 `{ ok: true, value: T }`，
 * 失败时返回 `{ ok: false, error: JobError }`。
 */
export type CommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: JobError };

/** Job lifecycle 事件处理器，接收所有事件类型 */
export type JobEventHandler = (event: JobEvent) => void;

/** 固定 provider 的单账号凭据引用。 */
export interface ProviderAccount {
  readonly providerId: FixedProviderId;
  readonly displayName: string;
  readonly secretRef?: string;
  /** 可选账号地址；未设置时使用 catalog 地址。 */
  readonly baseUrl?: string;
  readonly updatedAt: string;
}

/** Host-injected fixed provider account repository. */
export interface ProviderAccountRepository {
  list(): Promise<readonly ProviderAccount[]>;
  get(providerId: FixedProviderId): Promise<ProviderAccount | undefined>;
  save(account: ProviderAccount): Promise<void>;
  delete(providerId: FixedProviderId): Promise<void>;
}

/** 固定 provider/model 的 catalog 参数偏好。 */
export interface CatalogParameterPreference {
  readonly providerId: FixedProviderId;
  readonly modelId: string;
  readonly values: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

/** Host 注入的 catalog 参数偏好仓库。 */
export interface CatalogParameterPreferenceRepository {
  get(providerId: FixedProviderId, modelId: string): Promise<CatalogParameterPreference | undefined>;
  save(preference: CatalogParameterPreference): Promise<void>;
  delete(providerId: FixedProviderId, modelId: string): Promise<void>;
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
