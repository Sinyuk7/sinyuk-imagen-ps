import { createValidationError, type StoredAssetRef } from '@imagen-ps/core-engine';
import type { TaskRecord, TaskStatus } from './task.js';

/** 可追踪生成任务的最小公共状态。 */
export type TraceableTaskStatus = Extract<TaskStatus, 'running' | 'completed' | 'failed' | 'discarded'>;

/** Provider 远程执行事实；只允许保存脱敏摘要。 */
export interface RemoteExecutionFacts {
  readonly providerId: string;
  readonly modelId: string;
  readonly remoteTaskId?: string;
  readonly remoteStatus?: string;
  readonly observedAt: string;
  readonly diagnostics?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Provider 返回的单个远程结果。 */
export interface RemoteOutputRecord {
  readonly outputId: string;
  readonly index: number;
  readonly url: string;
  readonly observedAt: string;
  readonly providerMetadata?: Readonly<Record<string, string | number | boolean | null>>;
  readonly assetRef?: StoredAssetRef;
  readonly lastMaterialization?: {
    readonly status: 'succeeded' | 'failed';
    readonly observedAt: string;
    readonly error?: string;
  };
}

/** Batch 与 child task 的 host-neutral 关联。 */
export interface GenerationBatch {
  readonly batchId: string;
  readonly taskIds: readonly string[];
  readonly createdAt: string;
}

/** 可持久化 child task 的追踪字段。 */
export interface TraceableTaskFacts {
  readonly batchId?: string;
  readonly requestSummary?: Readonly<Record<string, string | number | boolean | null>>;
  readonly remote?: RemoteExecutionFacts;
  readonly remoteOutputs: readonly RemoteOutputRecord[];
  readonly submissionUnknown?: boolean;
  readonly discarded?: boolean;
}

/** 共享资源引用；相同 hash 必须复用同一 StoredAssetRef。 */
export interface SharedAssetReference {
  readonly contentHash: string;
  readonly asset: StoredAssetRef;
  readonly role: 'source-image' | 'mask' | 'provider-input';
}

/** AssetStore 的共享引用端口。 */
export interface SharedAssetStore {
  put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string; readonly contentHash?: string }): Promise<StoredAssetRef>;
  resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined>;
  retain(ref: StoredAssetRef): Promise<void>;
  release(ref: StoredAssetRef): Promise<void>;
}

/** 默认并发槽位配置。 */
export const DEFAULT_ACTIVE_SLOTS = 10;
export const MIN_ACTIVE_SLOTS = 2;
export const MAX_ACTIVE_SLOTS = 100;

/** 原子预留本地 active slots 的 admission。 */
export class ActiveSlotAdmission {
  readonly maxConcurrency: number;
  private active = 0;

  constructor(maxConcurrency = DEFAULT_ACTIVE_SLOTS) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < MIN_ACTIVE_SLOTS || maxConcurrency > MAX_ACTIVE_SLOTS) {
      throw createValidationError(`maxConcurrency must be between ${MIN_ACTIVE_SLOTS} and ${MAX_ACTIVE_SLOTS}.`);
    }
    this.maxConcurrency = maxConcurrency;
  }

  get activeCount(): number { return this.active; }

  reserve(count: number): { release(): void } {
    if (!Number.isInteger(count) || count < 1) throw createValidationError('Batch size must be a positive integer.');
    if (count > this.maxConcurrency - this.active) {
      throw createValidationError('Please wait for active generation capacity.', { code: 'capacity-unavailable', requested: count, available: this.maxConcurrency - this.active });
    }
    this.active += count;
    let released = false;
    return { release: () => { if (!released) { released = true; this.active -= count; } } };
  }
}

/** 基于内容 hash 的共享资源引用表，保护 active/running 引用不被清理。 */
export class SharedAssetIndex {
  private readonly entries = new Map<string, { readonly asset: StoredAssetRef; refs: number; protected: number }>();

  register(contentHash: string, asset: StoredAssetRef, protect = false): SharedAssetReference {
    const current = this.entries.get(contentHash);
    if (current) { current.refs += 1; if (protect) current.protected += 1; return { contentHash, asset: current.asset, role: 'provider-input' }; }
    this.entries.set(contentHash, { asset, refs: 1, protected: protect ? 1 : 0 });
    return { contentHash, asset, role: 'provider-input' };
  }

  release(contentHash: string, protect = false): boolean {
    const entry = this.entries.get(contentHash);
    if (!entry) return false;
    entry.refs = Math.max(0, entry.refs - 1);
    if (protect) entry.protected = Math.max(0, entry.protected - 1);
    if (entry.refs === 0 && entry.protected === 0) { this.entries.delete(contentHash); return true; }
    return false;
  }

  get(contentHash: string): StoredAssetRef | undefined { return this.entries.get(contentHash)?.asset; }
}

/** Provider 协议与结果物化之间的独立边界。 */
export interface OutputMaterializer {
  materialize(output: RemoteOutputRecord, signal?: AbortSignal): Promise<RemoteOutputRecord>;
}

/** 用户主动置入时的单次资源解析顺序。 */
export interface OnDemandOutputResolver {
  resolve(task: TaskRecord, output: RemoteOutputRecord, signal?: AbortSignal): Promise<StoredAssetRef>;
}

/** Recovery 只恢复已有 remote id 的 running task。 */
export interface RecoveryCandidate {
  readonly task: TaskRecord;
  readonly remoteTaskId?: string;
}

/** 过滤可恢复任务，submission-unknown 不会重新 submit。 */
export function selectRecoveryCandidates(tasks: readonly RecoveryCandidate[]): readonly RecoveryCandidate[] {
  return tasks.filter((candidate) => candidate.task.status === 'running' && typeof candidate.remoteTaskId === 'string' && candidate.remoteTaskId.length > 0);
}

/** 脱敏 provider URL，仅保留 origin/path。 */
export function redactSignedUrl(value: string): string {
  try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); } catch { return value.split(/[?#]/, 1)[0] ?? value; }
}

/** 校验远程结果记录不含签名凭据。 */
export function assertSafeRemoteOutput(output: RemoteOutputRecord): void {
  if (!/^https?:\/\//u.test(output.url)) throw createValidationError('Remote output URL must use HTTP(S).');
  const url = new URL(output.url);
  let unsafe = false;
  url.searchParams.forEach((_value, key) => { if (/token|sig|sign|auth|key|secret/i.test(key)) unsafe = true; });
  if (url.username || url.password || unsafe) {
    throw createValidationError('Remote output URL must not contain credentials.');
  }
}
