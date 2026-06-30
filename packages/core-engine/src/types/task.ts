import { createValidationError } from '../errors.js';
import type { JobError } from '../errors.js';
import type { StoredAssetRef } from './durable-job.js';

/** 可持久化 task record 的 schema 版本。 */
export const TASK_RECORD_SCHEMA_VERSION = 1;

/** 用户可见 task lifecycle 状态。 */
export type TaskStatus = 'running' | 'completed' | 'failed' | 'interrupted';

/** 用户可见 task 操作类型。 */
export type TaskOperation = 'text-to-image' | 'image-edit';

/** Task 坐标矩形：document pixel space，right/bottom 为 exclusive。 */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Host-neutral task 资源引用。 */
export interface TaskResourceRef {
  readonly ref: StoredAssetRef;
  readonly width?: number;
  readonly height?: number;
}

/** 解析后的 preview URL。创建方负责释放。 */
export interface ResolvedPreview {
  readonly url: string;
  readonly dispose?: () => void;
}

/** 解析后的 task 资源。availability 是动态状态，不写入 task record。 */
export interface ResolvedTaskResource {
  readonly resource: TaskResourceRef;
  readonly availability: 'available' | 'missing' | 'remote-only' | 'unresolvable';
  readonly bytes?: ArrayBuffer;
  readonly preview?: ResolvedPreview;
}

/** Durable task 的规范化错误。禁止保存 raw response / stack / secret。 */
export interface TaskError {
  readonly category: JobError['category'] | 'storage' | 'interrupted';
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, string | number | boolean | null>;
}

/** 本地文件证据。nativePathHint 仅用于显示，不能作为身份。 */
export interface FileEvidence {
  readonly token?: string;
  readonly name?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly mimeType?: string;
  readonly nativePathHint?: string;
}

/** App-owned serializable task evidence. Core validates shape, not host semantics. */
export type TaskEvidence = Readonly<Record<string, unknown>>;

/** Durable task input attachment evidence。 */
export type TaskAttachment =
  | ({
      readonly kind: string;
      readonly attachmentId: string;
      readonly label?: string;
      readonly asset: TaskResourceRef;
      readonly evidence?: TaskEvidence;
      readonly providerInput?: TaskResourceRef;
      readonly thumbnail?: TaskResourceRef;
    } & Record<string, unknown>)
  | {
      readonly kind: 'local-file';
      readonly attachmentId: string;
      readonly label?: string;
      readonly asset: TaskResourceRef;
      readonly file?: FileEvidence;
      readonly providerInput?: TaskResourceRef;
      readonly thumbnail?: TaskResourceRef;
    };

/** Durable task output evidence。 */
export interface TaskOutput {
  readonly outputId: string;
  readonly index: number;
  readonly kind: 'image';
  readonly asset: TaskResourceRef;
  readonly thumbnail?: TaskResourceRef;
  readonly partial?: boolean;
  readonly source?: {
    readonly providerAssetKind: 'base64' | 'url' | 'fileId' | 'storedRef';
    readonly sanitizedOriginalUrl?: string;
    readonly fileId?: string;
  };
}

/** Task replay placement 只引用 durable evidence。 */
export type TaskPlacement =
  | { readonly kind: 'exact-frame'; readonly sourceSnapshotId: string }
  | { readonly kind: 'document-only'; readonly document: TaskEvidence }
  | { readonly kind: 'unbound'; readonly reason: 'no-photoshop-source' | 'multiple-documents' };

/** 历史执行显示快照。只用于 display/debug。 */
export interface TaskExecutionSnapshot {
  readonly profileId?: string;
  readonly profileName?: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly modelId?: string;
  readonly modelName?: string;
  readonly output?: {
    readonly count?: number;
    readonly size?: string;
    readonly format?: string;
    readonly quality?: string;
  };
}

/** Product history source of truth。禁止保存 raw image bytes / secrets。 */
export interface TaskRecord {
  readonly schemaVersion: typeof TASK_RECORD_SCHEMA_VERSION;
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly operation: TaskOperation;
  readonly prompt: string;
  readonly attachments: readonly TaskAttachment[];
  readonly outputs: readonly TaskOutput[];
  readonly placement: TaskPlacement;
  readonly error?: TaskError;
  readonly execution?: TaskExecutionSnapshot;
  readonly executionJobId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt?: string;
}

export type DecodeTaskRecordResult =
  | { readonly ok: true; readonly value: TaskRecord }
  | { readonly ok: false; readonly reason: 'unknown-schema' | 'malformed'; readonly message: string; readonly taskId?: string };

const SECRET_KEY_PATTERN =
  /(^|\.|_)(apiKey|accessToken|refreshToken|secret|secretValue|secretValues|password|authorization|authToken|providerOptions)(\.|_|$)/i;

const TOKEN_VALUE_PATTERN = /\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/i;

/** Decode one persisted task record. Bad records are isolated by return value. */
export function decodeTaskRecord(value: unknown): DecodeTaskRecordResult {
  if (!isRecord(value)) {
    return { ok: false, reason: 'malformed', message: 'Task record must be an object.' };
  }
  const taskId = typeof value.taskId === 'string' ? value.taskId : undefined;
  if (value.schemaVersion !== TASK_RECORD_SCHEMA_VERSION) {
    return { ok: false, reason: 'unknown-schema', message: 'Unsupported task record schemaVersion.', ...(taskId ? { taskId } : {}) };
  }
  try {
    assertTaskRecord(value);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      reason: 'malformed',
      message: error instanceof Error ? error.message : String(error),
      ...(taskId ? { taskId } : {}),
    };
  }
}

/** Validate task lifecycle and secret-free/resource-ref invariants before write. */
export function assertTaskRecord(record: unknown): asserts record is TaskRecord {
  if (!isRecord(record)) {
    throw createValidationError('Task record must be an object.');
  }
  expectLiteral(record.schemaVersion, TASK_RECORD_SCHEMA_VERSION, 'schemaVersion');
  expectNonEmptyString(record.taskId, 'taskId');
  expectOneOf(record.status, ['running', 'completed', 'failed', 'interrupted'], 'status');
  expectOneOf(record.operation, ['text-to-image', 'image-edit'], 'operation');
  expectString(record.prompt, 'prompt');
  expectArray(record.attachments, 'attachments');
  expectArray(record.outputs, 'outputs');
  assertPlacement(record.placement);
  expectIsoString(record.createdAt, 'createdAt');
  expectIsoString(record.updatedAt, 'updatedAt');
  if (record.finishedAt !== undefined) {
    expectIsoString(record.finishedAt, 'finishedAt');
  }

  const status = record.status as TaskStatus;
  if (status === 'running') {
    forbid(record.error, 'error', 'running');
    expectEmptyArray(record.outputs, 'outputs');
    forbid(record.finishedAt, 'finishedAt', 'running');
  }
  if (status === 'completed') {
    forbid(record.error, 'error', 'completed');
    expectRequired(record.finishedAt, 'finishedAt', 'completed');
  }
  if (status === 'failed' || status === 'interrupted') {
    expectRequired(record.error, 'error', status);
    expectRequired(record.finishedAt, 'finishedAt', status);
  }
  if (status === 'interrupted') {
    expectEmptyArray(record.outputs, 'outputs');
  }
  if (status === 'failed') {
    for (const output of record.outputs as readonly unknown[]) {
      if (isRecord(output) && output.partial !== true) {
        throw createValidationError('Failed task outputs must be marked partial.', { path: 'outputs' });
      }
    }
  }

  (record.attachments as readonly unknown[]).forEach((attachment, index) => assertAttachment(attachment, `attachments[${index}]`));
  (record.outputs as readonly unknown[]).forEach((output, index) => assertOutput(output, `outputs[${index}]`));
  if (record.error !== undefined) {
    assertTaskError(record.error, 'error');
  }
  assertNoTaskSecrets(record);
}

/** Ensure persisted task JSON has no secret-shaped keys or token-like values. */
export function assertNoTaskSecrets(value: unknown): void {
  const seen = new WeakSet<object>();
  visitNoTaskSecrets(value, seen, 'root');
}

/** Sanitizes a provider/source URL for durable evidence by dropping query and hash. */
export function sanitizeTaskEvidenceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function assertAttachment(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  expectNonEmptyString(value.kind, `${path}.kind`);
  expectNonEmptyString(value.attachmentId, `${path}.attachmentId`);
  if (value.label !== undefined) {
    expectString(value.label, `${path}.label`);
  }
  assertResourceRef(value.asset, `${path}.asset`);
  if (value.providerInput !== undefined) {
    assertResourceRef(value.providerInput, `${path}.providerInput`);
  }
  if (value.thumbnail !== undefined) {
    assertResourceRef(value.thumbnail, `${path}.thumbnail`);
  }
  if (value.evidence !== undefined && !isRecord(value.evidence)) {
    throw createValidationError(`Task ${path}.evidence must be an object.`, { path: `${path}.evidence` });
  }
}

function assertOutput(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  expectNonEmptyString(value.outputId, `${path}.outputId`);
  expectNonNegativeInteger(value.index, `${path}.index`);
  expectLiteral(value.kind, 'image', `${path}.kind`);
  assertResourceRef(value.asset, `${path}.asset`);
  if (value.thumbnail !== undefined) {
    assertResourceRef(value.thumbnail, `${path}.thumbnail`);
  }
  if (value.partial !== undefined && typeof value.partial !== 'boolean') {
    throw createValidationError(`Task ${path}.partial must be a boolean.`, { path: `${path}.partial` });
  }
  if (value.source !== undefined) {
    if (!isRecord(value.source)) {
      throw createValidationError(`Task ${path}.source must be an object.`, { path: `${path}.source` });
    }
    expectOneOf(value.source.providerAssetKind, ['base64', 'url', 'fileId', 'storedRef'], `${path}.source.providerAssetKind`);
    if (value.source.sanitizedOriginalUrl !== undefined) {
      expectString(value.source.sanitizedOriginalUrl, `${path}.source.sanitizedOriginalUrl`);
      if (/[?#]/.test(String(value.source.sanitizedOriginalUrl))) {
        throw createValidationError('Task source URL evidence must be sanitized.', { path: `${path}.source.sanitizedOriginalUrl` });
      }
    }
    if (value.source.fileId !== undefined) {
      expectString(value.source.fileId, `${path}.source.fileId`);
    }
  }
}

function assertPlacement(value: unknown): void {
  if (!isRecord(value)) {
    throw createValidationError('Task placement must be an object.', { path: 'placement' });
  }
  expectOneOf(value.kind, ['exact-frame', 'document-only', 'unbound'], 'placement.kind');
  if (value.kind === 'exact-frame') {
    expectNonEmptyString(value.sourceSnapshotId, 'placement.sourceSnapshotId');
  } else if (value.kind === 'document-only') {
    if (!isRecord(value.document)) {
      throw createValidationError('Task placement.document must be an object.', { path: 'placement.document' });
    }
  } else {
    expectOneOf(value.reason, ['no-photoshop-source', 'multiple-documents'], 'placement.reason');
  }
}

function assertTaskError(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  expectNonEmptyString(value.category, `${path}.category`);
  expectNonEmptyString(value.message, `${path}.message`);
  if (value.code !== undefined) {
    expectString(value.code, `${path}.code`);
  }
  if (value.details !== undefined && !isRecord(value.details)) {
    throw createValidationError(`Task ${path}.details must be an object.`, { path: `${path}.details` });
  }
}

function assertResourceRef(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  if (!isRecord(value.ref)) {
    throw createValidationError(`Task ${path}.ref must be a StoredAssetRef.`, { path: `${path}.ref` });
  }
  expectOneOf(value.ref.kind, ['inline', 'url', 'hostObject', 'externalToken'], `${path}.ref.kind`);
  expectNonEmptyString(value.ref.ref, `${path}.ref.ref`);
  if (value.width !== undefined) {
    expectPositiveFinite(value.width, `${path}.width`);
  }
  if (value.height !== undefined) {
    expectPositiveFinite(value.height, `${path}.height`);
  }
}

function visitNoTaskSecrets(value: unknown, seen: WeakSet<object>, path: string): void {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && TOKEN_VALUE_PATTERN.test(value)) {
      throw createValidationError(`Task record contains a token-like value at "${path}".`, { path });
    }
    return;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw createValidationError(`Task record contains raw binary data at "${path}".`, { path });
  }
  if (seen.has(value as object)) {
    return;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitNoTaskSecrets(item, seen, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (key === 'secretRefs') {
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      throw createValidationError(`Task record contains a secret or raw provider field at "${childPath}".`, { path: childPath });
    }
    visitNoTaskSecrets(child, seen, childPath);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectLiteral(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) {
    throw createValidationError(`Task ${path} must be ${String(expected)}.`, { path });
  }
}

function expectOneOf(value: unknown, expected: readonly string[], path: string): void {
  if (typeof value !== 'string' || !expected.includes(value)) {
    throw createValidationError(`Task ${path} must be one of: ${expected.join(', ')}.`, { path });
  }
}

function expectString(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    throw createValidationError(`Task ${path} must be a string.`, { path });
  }
}

function expectNonEmptyString(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw createValidationError(`Task ${path} must be a non-empty string.`, { path });
  }
}

function expectArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    throw createValidationError(`Task ${path} must be an array.`, { path });
  }
}

function expectEmptyArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 0) {
    throw createValidationError(`Task ${path} must be empty.`, { path });
  }
}

function expectRequired(value: unknown, path: string, status: TaskStatus): void {
  if (value === undefined) {
    throw createValidationError(`Task ${path} is required when status is "${status}".`, { path, status });
  }
}

function forbid(value: unknown, path: string, status: TaskStatus): void {
  if (value !== undefined) {
    throw createValidationError(`Task ${path} is forbidden when status is "${status}".`, { path, status });
  }
}

function expectIsoString(value: unknown, path: string): void {
  expectNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(value as string))) {
    throw createValidationError(`Task ${path} must be an ISO date string.`, { path });
  }
}

function expectFinite(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createValidationError(`Task ${path} must be a finite number.`, { path });
  }
}

function expectPositiveFinite(value: unknown, path: string): void {
  expectFinite(value, path);
  if ((value as number) <= 0) {
    throw createValidationError(`Task ${path} must be positive.`, { path });
  }
}

function expectNonNegativeInteger(value: unknown, path: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw createValidationError(`Task ${path} must be a non-negative integer.`, { path });
  }
}
