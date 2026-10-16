import type { StoredAssetRef } from '@imagen-ps/core-engine';
import type { TaskRecord, TaskStore } from '../task.js';
import type { SharedAssetStore } from '../traceable-generation.js';

/** 确定性 TaskStore fake，供 application contract harness 使用。 */
export function createTaskStoreFake(initial: readonly TaskRecord[] = []): TaskStore {
  const records = new Map(initial.map((record) => [record.taskId, record] as const));
  return {
    async put(record) { records.set(record.taskId, record); },
    async get(taskId) { return records.get(taskId); },
    async list(query) {
      let values = [...records.values()];
      if (query?.status) values = values.filter((record) => record.status === query.status);
      return query?.limit === undefined ? values : values.slice(0, query.limit);
    },
    async delete(taskId) { records.delete(taskId); },
  };
}

/** 确定性共享 AssetStore fake；按 content hash 去重并记录引用。 */
export function createSharedAssetStoreFake(): SharedAssetStore & { readonly assets: ReadonlyMap<string, ArrayBuffer> } {
  const bytes = new Map<string, ArrayBuffer>();
  const refs = new Map<string, number>();
  return {
    assets: bytes,
    async put(value, meta) {
      const key = meta.contentHash ?? `${meta.mimeType ?? 'application/octet-stream'}:${value.byteLength}:${bytes.size}`;
      if (!bytes.has(key)) bytes.set(key, value.slice(0));
      refs.set(key, (refs.get(key) ?? 0) + 1);
      return { kind: 'inline', ref: key, ...(meta.mimeType ? { mimeType: meta.mimeType } : {}), ...(meta.name ? { name: meta.name } : {}), byteSize: value.byteLength };
    },
    async resolve(ref: StoredAssetRef) { return bytes.get(ref.ref)?.slice(0); },
    async retain(ref) { refs.set(ref.ref, (refs.get(ref.ref) ?? 0) + 1); },
    async release(ref) { const next = (refs.get(ref.ref) ?? 0) - 1; if (next <= 0) { refs.delete(ref.ref); bytes.delete(ref.ref); } else refs.set(ref.ref, next); },
  };
}
