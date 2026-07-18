import type { JobError } from '../errors.js';
import type { JobInput, JobStatus } from './job.js';

/** 可持久化 job record 的 schema 版本。 */
export const DURABLE_JOB_RECORD_SCHEMA_VERSION = 1;

/** 可持久化 asset 引用的公共字段。 */
export interface StoredAssetRefBase {
  /** Opaque locator，仅由匹配的 host AssetStore adapter 解释。 */
  readonly ref: string;
  /** 可选可读标签或文件名。 */
  readonly name?: string;
  /** 可选 MIME type。 */
  readonly mimeType?: string;
  /** 可选 sha256，用于校验 AssetStore bytes。 */
  readonly sha256?: string;
  /** 可选 byte size。 */
  readonly byteSize?: number;
}

/** 内联 asset 引用。bytes 由 AssetStore 管理，record 只保存引用元数据。 */
export interface InlineStoredAssetRef extends StoredAssetRefBase {
  readonly kind: 'inline';
}

/** URL asset 引用。 */
export interface UrlStoredAssetRef extends StoredAssetRefBase {
  readonly kind: 'url';
}

/** Host 私有 object 引用，例如 CLI 或 UXP adapter 私有 object key。 */
export interface HostObjectStoredAssetRef extends StoredAssetRefBase {
  readonly kind: 'hostObject';
}

/** 外部授权 token 引用，例如 UXP persistent token。 */
export interface ExternalTokenStoredAssetRef extends StoredAssetRefBase {
  readonly kind: 'externalToken';
}

/** Host-neutral、opaque 的持久化 asset 引用。禁止保存 native path。 */
export type StoredAssetRef =
  | InlineStoredAssetRef
  | UrlStoredAssetRef
  | HostObjectStoredAssetRef
  | ExternalTokenStoredAssetRef;

/** 可持久化 job record。record 保存 metadata + StoredAssetRef[]，不保存图片 bytes。 */
export interface DurableJobRecord {
  readonly schemaVersion: typeof DURABLE_JOB_RECORD_SCHEMA_VERSION;
  readonly jobId: string;
  readonly status: JobStatus;
  readonly workflow: string;
  readonly input: JobInput;
  readonly outputs: readonly StoredAssetRef[];
  readonly error?: JobError;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly originJobId?: string;
  readonly retryAttempt?: number;
}
