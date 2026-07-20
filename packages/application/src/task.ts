import {
  createValidationError,
  type JobError,
  type StoredAssetRef,
} from '@imagen-ps/core-engine';

/** 可持久化 Task record 的唯一 current-state schema 版本。 */
export const TASK_RECORD_SCHEMA_VERSION = 3;

/** 用户可见 Task lifecycle 状态。 */
export type TaskStatus = 'running' | 'completed' | 'failed' | 'interrupted';

/** 用户可见 Task 操作类型。 */
export type TaskOperation = 'text-to-image' | 'image-edit';

/** Task 坐标矩形：document pixel space，right/bottom 为 exclusive。 */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Host-neutral Task 资源引用。 */
export interface TaskResourceRef {
  readonly ref: StoredAssetRef;
  readonly width?: number;
  readonly height?: number;
}

/** 解析后的 preview URL；创建方负责释放。 */
export interface ResolvedPreview {
  readonly url: string;
  readonly dispose?: () => void;
}

/** 解析后的 Task 资源；availability 是动态状态，不写入 Task record。 */
export interface ResolvedTaskResource {
  readonly resource: TaskResourceRef;
  readonly availability: 'available' | 'missing' | 'remote-only' | 'unresolvable';
  readonly bytes?: ArrayBuffer;
  readonly preview?: ResolvedPreview;
}

/** Durable Task 的规范化错误；禁止保存 raw response、stack 或 secret。 */
export interface TaskError {
  readonly category: JobError['category'] | 'storage' | 'interrupted';
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, string | number | boolean | null>;
}

/** 本地文件的 bounded durable evidence。 */
export interface FileEvidence {
  readonly token?: string;
  readonly name?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly mimeType?: string;
}

/** Application-owned、可序列化且 secret-free 的 Task evidence。 */
export type TaskEvidence = Readonly<Record<string, unknown>>;

/** Primary-bound canonical Edit Region 的 durable snapshot。 */
export interface TaskEditRegion {
  readonly targetAttachmentId: string;
  readonly source: TaskEvidence;
  readonly geometry: {
    readonly sourceBounds: Rect;
    readonly targetWidth: number;
    readonly targetHeight: number;
  };
  readonly mask: TaskResourceRef;
  readonly encoding: 'grayscale-png';
  readonly bitDepth: 8;
  readonly polarity: 'white-edit';
}

/** Durable Task input attachment evidence。 */
export interface TaskAttachment {
  readonly kind: string;
  readonly attachmentId: string;
  readonly label?: string;
  readonly asset: TaskResourceRef;
  readonly evidence?: TaskEvidence;
  readonly file?: FileEvidence;
  readonly executionInput?: TaskResourceRef;
  readonly thumbnail?: TaskResourceRef;
}

/** Durable Task output evidence；资源身份只由 asset.ref 决定。 */
export interface TaskOutput {
  readonly outputId: string;
  readonly index: number;
  readonly kind: 'image';
  readonly asset: TaskResourceRef;
  readonly thumbnail?: TaskResourceRef;
  readonly partial?: boolean;
  readonly evidence?: TaskEvidence;
}

/** Task replay placement 只引用 durable evidence。 */
export type TaskPlacement =
  | { readonly kind: 'exact-frame'; readonly sourceSnapshotId: string }
  | { readonly kind: 'document-only'; readonly document: TaskEvidence }
  | { readonly kind: 'unbound'; readonly reason: 'no-photoshop-source' | 'multiple-documents' };

/** Backend-neutral execution identity；id 用于关联，label 只用于显示。 */
export interface TaskExecutionIdentity {
  readonly id: string;
  readonly label: string;
}

/** 历史执行的 bounded backend-neutral 显示摘要。 */
export interface TaskExecutionSummary {
  readonly backend: TaskExecutionIdentity;
  readonly connection?: TaskExecutionIdentity;
  readonly target?: TaskExecutionIdentity;
}

/** Product history source of truth；禁止保存 raw image bytes、native path 或 secrets。 */
export interface TaskRecord {
  readonly schemaVersion: typeof TASK_RECORD_SCHEMA_VERSION;
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly operation: TaskOperation;
  readonly prompt: string;
  readonly attachments: readonly TaskAttachment[];
  readonly outputs: readonly TaskOutput[];
  readonly editRegion?: TaskEditRegion;
  readonly placement: TaskPlacement;
  readonly error?: TaskError;
  readonly execution?: TaskExecutionSummary;
  readonly latestJobId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt?: string;
}

/** 单条持久化 Task decode 的隔离结果。 */
export type DecodeTaskRecordResult =
  | { readonly ok: true; readonly value: TaskRecord }
  | {
      readonly ok: false;
      readonly reason: 'unknown-schema' | 'malformed';
      readonly message: string;
      readonly taskId?: string;
    };

/** Host 注入的 durable Task store；upsert key 固定为 taskId。 */
export interface TaskStore {
  put(record: TaskRecord): Promise<void>;
  get(taskId: string): Promise<TaskRecord | undefined>;
  list(query?: { readonly limit?: number; readonly status?: TaskStatus }): Promise<readonly TaskRecord[]>;
  delete(taskId: string): Promise<void>;
}

const SECRET_KEY_PATTERN =
  /(^|\.|_)(apiKey|accessToken|refreshToken|secret|secretValue|secretValues|password|authorization|authToken|providerOptions)(\.|_|$)/i;

const TOKEN_VALUE_PATTERN = /\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/i;

const NATIVE_PATH_KEY_PATTERN = /^(?:nativePath|nativePathHint|filePath|absolutePath)$/i;

const URL_CREDENTIAL_PARAM_PATTERN = /^(?:api[_-]?key|access[_-]?token|auth|authorization|credential|password|secret|sig|signature|token)$/i;

const TASK_RECORD_KEYS = [
  'schemaVersion',
  'taskId',
  'status',
  'operation',
  'prompt',
  'attachments',
  'outputs',
  'editRegion',
  'placement',
  'error',
  'execution',
  'latestJobId',
  'createdAt',
  'updatedAt',
  'finishedAt',
] as const;

const TASK_ATTACHMENT_KEYS = [
  'kind',
  'attachmentId',
  'label',
  'asset',
  'evidence',
  'file',
  'executionInput',
  'thumbnail',
] as const;

const TASK_OUTPUT_KEYS = [
  'outputId',
  'index',
  'kind',
  'asset',
  'thumbnail',
  'partial',
  'evidence',
] as const;

const TASK_EDIT_REGION_KEYS = [
  'targetAttachmentId',
  'source',
  'geometry',
  'mask',
  'encoding',
  'bitDepth',
  'polarity',
] as const;

/** Decode 单条 persisted Task；坏记录通过返回值隔离。 */
export function decodeTaskRecord(value: unknown): DecodeTaskRecordResult {
  if (!isRecord(value)) {
    return { ok: false, reason: 'malformed', message: 'Task record must be an object.' };
  }
  const taskId = typeof value.taskId === 'string' ? value.taskId : undefined;
  if (value.schemaVersion !== TASK_RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unknown-schema',
      message: 'Unsupported task record schemaVersion.',
      ...(taskId ? { taskId } : {}),
    };
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

/** 写入前校验 Task lifecycle、bounded schema 与 secret-free/resource-ref invariants。 */
export function assertTaskRecord(record: unknown): asserts record is TaskRecord {
  if (!isRecord(record)) {
    throw createValidationError('Task record must be an object.');
  }
  assertAllowedKeys(record, TASK_RECORD_KEYS, 'root');
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
  if (record.latestJobId !== undefined) {
    expectNonEmptyString(record.latestJobId, 'latestJobId');
  }
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

  (record.attachments as readonly unknown[]).forEach((attachment, index) =>
    assertAttachment(attachment, `attachments[${index}]`));
  (record.outputs as readonly unknown[]).forEach((output, index) =>
    assertOutput(output, `outputs[${index}]`));
  if (record.editRegion !== undefined) {
    const editRegion = record.editRegion;
    assertEditRegion(editRegion, 'editRegion');
    const primary = (record.attachments as readonly unknown[])[0];
    if (!isRecord(primary) || primary.attachmentId !== editRegion.targetAttachmentId) {
      throw createValidationError('Task editRegion must target the primary attachment.', { path: 'editRegion.targetAttachmentId' });
    }
  }
  if (record.error !== undefined) {
    assertTaskError(record.error, 'error');
  }
  if (record.execution !== undefined) {
    assertExecutionSummary(record.execution, 'execution');
  }
  assertNoTaskSecrets(record);
}

/** 确保持久化 Task JSON 不含 secret-shaped keys、token-like values 或 raw binary。 */
export function assertNoTaskSecrets(value: unknown): void {
  visitTaskValue(value, new WeakSet<object>(), 'root');
}

/** 清理 durable evidence URL 的 query 与 hash。 */
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
  assertAllowedKeys(value, TASK_ATTACHMENT_KEYS, path);
  expectNonEmptyString(value.kind, `${path}.kind`);
  expectNonEmptyString(value.attachmentId, `${path}.attachmentId`);
  if (value.label !== undefined) {
    expectString(value.label, `${path}.label`);
  }
  assertResourceRef(value.asset, `${path}.asset`);
  if (value.executionInput !== undefined) {
    assertResourceRef(value.executionInput, `${path}.executionInput`);
  }
  if (value.thumbnail !== undefined) {
    assertResourceRef(value.thumbnail, `${path}.thumbnail`);
  }
  if (value.evidence !== undefined) {
    assertEvidence(value.evidence, `${path}.evidence`);
  }
  if (value.file !== undefined) {
    assertFileEvidence(value.file, `${path}.file`);
  }
}

function assertOutput(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, TASK_OUTPUT_KEYS, path);
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
  if (value.evidence !== undefined) {
    assertEvidence(value.evidence, `${path}.evidence`);
  }
}

function assertEditRegion(value: unknown, path: string): asserts value is TaskEditRegion {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, TASK_EDIT_REGION_KEYS, path);
  expectNonEmptyString(value.targetAttachmentId, `${path}.targetAttachmentId`);
  assertEvidence(value.source, `${path}.source`);
  if (!isRecord(value.geometry)) {
    throw createValidationError(`Task ${path}.geometry must be an object.`, { path: `${path}.geometry` });
  }
  assertAllowedKeys(value.geometry, ['sourceBounds', 'targetWidth', 'targetHeight'], `${path}.geometry`);
  assertRect(value.geometry.sourceBounds, `${path}.geometry.sourceBounds`);
  expectPositiveFinite(value.geometry.targetWidth, `${path}.geometry.targetWidth`);
  expectPositiveFinite(value.geometry.targetHeight, `${path}.geometry.targetHeight`);
  assertResourceRef(value.mask, `${path}.mask`);
  expectLiteral(value.encoding, 'grayscale-png', `${path}.encoding`);
  expectLiteral(value.bitDepth, 8, `${path}.bitDepth`);
  expectLiteral(value.polarity, 'white-edit', `${path}.polarity`);
}

function assertRect(value: unknown, path: string): asserts value is Rect {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['left', 'top', 'right', 'bottom'], path);
  const left = value.left;
  const top = value.top;
  const right = value.right;
  const bottom = value.bottom;
  expectFinite(left, `${path}.left`);
  expectFinite(top, `${path}.top`);
  expectFinite(right, `${path}.right`);
  expectFinite(bottom, `${path}.bottom`);
  if ((right as number) <= (left as number) || (bottom as number) <= (top as number)) {
    throw createValidationError(`Task ${path} must have positive area.`, { path });
  }
}

function assertPlacement(value: unknown): void {
  if (!isRecord(value)) {
    throw createValidationError('Task placement must be an object.', { path: 'placement' });
  }
  expectOneOf(value.kind, ['exact-frame', 'document-only', 'unbound'], 'placement.kind');
  if (value.kind === 'exact-frame') {
    assertAllowedKeys(value, ['kind', 'sourceSnapshotId'], 'placement');
    expectNonEmptyString(value.sourceSnapshotId, 'placement.sourceSnapshotId');
  } else if (value.kind === 'document-only') {
    assertAllowedKeys(value, ['kind', 'document'], 'placement');
    assertEvidence(value.document, 'placement.document');
  } else {
    assertAllowedKeys(value, ['kind', 'reason'], 'placement');
    expectOneOf(value.reason, ['no-photoshop-source', 'multiple-documents'], 'placement.reason');
  }
}

function assertExecutionSummary(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['backend', 'connection', 'target'], path);
  assertExecutionIdentity(value.backend, `${path}.backend`);
  if (value.connection !== undefined) {
    assertExecutionIdentity(value.connection, `${path}.connection`);
  }
  if (value.target !== undefined) {
    assertExecutionIdentity(value.target, `${path}.target`);
  }
}

function assertExecutionIdentity(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['id', 'label'], path);
  expectNonEmptyString(value.id, `${path}.id`);
  expectNonEmptyString(value.label, `${path}.label`);
}

function assertTaskError(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['category', 'message', 'code', 'details'], path);
  expectOneOf(
    value.category,
    ['validation', 'execution', 'provider', 'runtime', 'workflow', 'unknown', 'storage', 'interrupted'],
    `${path}.category`,
  );
  expectNonEmptyString(value.message, `${path}.message`);
  if (value.code !== undefined) {
    expectString(value.code, `${path}.code`);
  }
  if (value.details !== undefined) {
    if (!isRecord(value.details)) {
      throw createValidationError(`Task ${path}.details must be an object.`, { path: `${path}.details` });
    }
    for (const [key, detail] of Object.entries(value.details)) {
      if (detail !== null && typeof detail !== 'string' && typeof detail !== 'number' && typeof detail !== 'boolean') {
        throw createValidationError(`Task ${path}.details.${key} must be a bounded primitive.`, {
          path: `${path}.details.${key}`,
        });
      }
    }
  }
}

function assertFileEvidence(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['token', 'name', 'byteSize', 'sha256', 'mimeType'], path);
  for (const key of ['token', 'name', 'sha256', 'mimeType'] as const) {
    if (value[key] !== undefined) {
      expectString(value[key], `${path}.${key}`);
    }
  }
  if (value.byteSize !== undefined) {
    expectNonNegativeInteger(value.byteSize, `${path}.byteSize`);
  }
}

function assertResourceRef(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  assertAllowedKeys(value, ['ref', 'width', 'height'], path);
  if (!isRecord(value.ref)) {
    throw createValidationError(`Task ${path}.ref must be a StoredAssetRef.`, { path: `${path}.ref` });
  }
  assertAllowedKeys(value.ref, ['kind', 'ref', 'mimeType', 'name', 'byteSize', 'sha256'], `${path}.ref`);
  expectOneOf(value.ref.kind, ['inline', 'url', 'hostObject', 'externalToken'], `${path}.ref.kind`);
  expectNonEmptyString(value.ref.ref, `${path}.ref.ref`);
  for (const key of ['mimeType', 'name', 'sha256'] as const) {
    if (value.ref[key] !== undefined) {
      expectString(value.ref[key], `${path}.ref.${key}`);
    }
  }
  if (value.ref.byteSize !== undefined) {
    expectNonNegativeInteger(value.ref.byteSize, `${path}.ref.byteSize`);
  }
  if (value.width !== undefined) {
    expectPositiveFinite(value.width, `${path}.width`);
  }
  if (value.height !== undefined) {
    expectPositiveFinite(value.height, `${path}.height`);
  }
}

function assertEvidence(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw createValidationError(`Task ${path} must be an object.`, { path });
  }
  visitTaskValue(value, new WeakSet<object>(), path);
}

function visitTaskValue(value: unknown, seen: WeakSet<object>, path: string): void {
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createValidationError(`Task record contains a non-finite number at "${path}".`, { path });
    }
    return;
  }
  if (typeof value === 'string') {
    if (TOKEN_VALUE_PATTERN.test(value)) {
      throw createValidationError(`Task record contains a token-like value at "${path}".`, { path });
    }
    assertUrlHasNoCredentials(value, path);
    return;
  }
  if (typeof value !== 'object') {
    throw createValidationError(`Task record contains a non-serializable value at "${path}".`, { path });
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw createValidationError(`Task record contains raw binary data at "${path}".`, { path });
  }
  if (seen.has(value)) {
    throw createValidationError(`Task record contains a circular value at "${path}".`, { path });
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitTaskValue(item, seen, `${path}[${index}]`));
    seen.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw createValidationError(`Task record contains a non-plain object at "${path}".`, { path });
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw createValidationError(`Task record contains a secret-shaped field at "${childPath}".`, { path: childPath });
    }
    if (NATIVE_PATH_KEY_PATTERN.test(key)) {
      throw createValidationError(`Task record contains a native path field at "${childPath}".`, { path: childPath });
    }
    visitTaskValue(child, seen, childPath);
  }
  seen.delete(value);
}

function assertUrlHasNoCredentials(value: string, path: string): void {
  if (!/^https?:\/\//i.test(value)) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.username.length > 0 || url.password.length > 0) {
      throw createValidationError(`Task record contains URL credentials at "${path}".`, { path });
    }
    for (const key of url.searchParams.keys()) {
      if (URL_CREDENTIAL_PARAM_PATTERN.test(key)) {
        throw createValidationError(`Task record contains URL credentials at "${path}".`, { path });
      }
    }
  } catch (error) {
    if (isJobErrorLike(error)) {
      throw error;
    }
  }
}

function isJobErrorLike(value: unknown): value is JobError {
  return isRecord(value)
    && typeof value.category === 'string'
    && typeof value.message === 'string';
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw createValidationError(`Task ${path} contains unsupported field "${key}".`, { path: `${path}.${key}` });
    }
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
  if (typeof value !== 'string' || value.trim().length === 0) {
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
