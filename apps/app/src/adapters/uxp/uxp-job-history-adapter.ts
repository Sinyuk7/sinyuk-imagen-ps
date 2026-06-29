import type { AssetStore, DurableJobRecord, JobHistoryStore, StoredAssetRef } from '@imagen-ps/application';
import { ensurePlaceableImagePayload } from '../../shared/image-payload-preflight';
import { createInMemoryAssetStore, createInMemoryJobHistoryStore } from './in-memory-host-storage';
import type { UxpModules } from './uxp-api';

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void>;
}

interface UxpFolder {
  getEntry(name: string): Promise<UxpFile>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  readonly formats?: {
    readonly utf8?: unknown;
  };
  getDataFolder(): Promise<UxpFolder>;
}

interface UxpStorage {
  readonly formats?: {
    readonly utf8?: unknown;
    readonly binary?: unknown;
  };
  readonly localFileSystem?: UxpLocalFileSystem;
}

interface JobHistoryFile {
  readonly schemaVersion: 1;
  readonly records: readonly DurableJobRecord[];
}

function localFileSystemFrom(modules: UxpModules): UxpLocalFileSystem | undefined {
  const storage = modules.uxp?.storage as UxpStorage | undefined;
  return storage?.localFileSystem;
}

function storageFormatsFrom(modules: UxpModules): UxpStorage['formats'] | undefined {
  const storage = modules.uxp?.storage as UxpStorage | undefined;
  return storage?.formats;
}

function uxpBinaryFormat(formats: UxpStorage['formats'] | undefined): unknown {
  if (!formats?.binary) {
    throw new Error('UXP binary file format is unavailable.');
  }
  return formats.binary;
}

async function getOrCreateFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const folder = await fs.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return folder.createFile(name, { overwrite: true });
  }
}

async function getFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile | undefined> {
  const folder = await fs.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return undefined;
  }
}

function parseHistory(raw: string): JobHistoryFile {
  if (raw.trim().length === 0) {
    return { schemaVersion: 1, records: [] };
  }
  const parsed = JSON.parse(raw) as Partial<JobHistoryFile>;
  return {
    schemaVersion: 1,
    records: Array.isArray(parsed.records) ? parsed.records : [],
  };
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function arrayBufferFrom(value: string | ArrayBuffer): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  return undefined;
}

function extensionForMimeType(mimeType: string | undefined): string {
  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  if (mimeType === 'image/png') {
    return '.png';
  }
  return '.bin';
}

function createAssetRef(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): StoredAssetRef {
  const ref = `uxp-asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extensionForMimeType(meta.mimeType)}`;
  return {
    kind: 'hostObject',
    ref,
    ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    byteSize: bytes.byteLength,
  };
}

function shouldPreflightAsset(meta: { readonly mimeType?: string; readonly name?: string }): boolean {
  const mimeType = meta.mimeType?.toLowerCase();
  if (mimeType?.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|webp)$/i.test(meta.name ?? '');
}

function preflightStoredAsset(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): void {
  if (!shouldPreflightAsset(meta)) {
    return;
  }
  ensurePlaceableImagePayload(bytes, meta.mimeType ?? meta.name ?? 'image/png');
}

/** UXP data-folder backed durable job history store。 */
export function createUxpJobHistoryStore(modules: UxpModules): JobHistoryStore {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryJobHistoryStore();
  }
  const localFileSystem = fs;
  const fileName = 'job-history.json';

  async function readAll(): Promise<JobHistoryFile> {
    const file = await getOrCreateFile(localFileSystem, fileName);
    try {
      const raw = await file.read({ format: localFileSystem.formats?.utf8 });
      return parseHistory(String(raw));
    } catch {
      return { schemaVersion: 1, records: [] };
    }
  }

  async function writeAll(records: readonly DurableJobRecord[]): Promise<void> {
    const file = await getOrCreateFile(localFileSystem, fileName);
    await file.write(JSON.stringify({ schemaVersion: 1, records }, null, 2), {
      format: localFileSystem.formats?.utf8,
    });
  }

  return {
    async put(record: DurableJobRecord): Promise<void> {
      const file = await readAll();
      await writeAll([...file.records.filter((item) => item.jobId !== record.jobId), record]);
    },
    async get(jobId: string): Promise<DurableJobRecord | undefined> {
      return (await readAll()).records.find((record) => record.jobId === jobId);
    },
    async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly DurableJobRecord[]> {
      const records = (await readAll()).records
        .filter((record) => query?.status === undefined || record.status === query.status)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
    },
    async delete(jobId: string): Promise<void> {
      const file = await readAll();
      await writeAll(file.records.filter((record) => record.jobId !== jobId));
    },
  };
}

/** UXP data-folder backed asset store。shared record 只保存 opaque `hostObject` ref。 */
export function createUxpAssetStore(modules: UxpModules): AssetStore {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryAssetStore();
  }
  const localFileSystem = fs;
  const binaryFormat = uxpBinaryFormat(storageFormatsFrom(modules));

  return {
    async put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef> {
      preflightStoredAsset(bytes, meta);
      const ref = createAssetRef(bytes, meta);
      const file = await getOrCreateFile(localFileSystem, ref.ref);
      await file.write(bytesToArrayBuffer(new Uint8Array(bytes)), { format: binaryFormat });
      return ref;
    },
    async resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined> {
      if (ref.kind !== 'hostObject') {
        return undefined;
      }
      try {
        const file = await getFile(localFileSystem, ref.ref);
        if (!file) {
          return undefined;
        }
        const raw = await file.read({ format: binaryFormat });
        const bytes = arrayBufferFrom(raw);
        if (bytes !== undefined) {
          preflightStoredAsset(bytes, ref);
        }
        return bytes;
      } catch {
        return undefined;
      }
    },
    async delete(): Promise<void> {
      // 当前最小 UXP 文件抽象未暴露 delete；artifact eviction 后续单独设计。
    },
  };
}
