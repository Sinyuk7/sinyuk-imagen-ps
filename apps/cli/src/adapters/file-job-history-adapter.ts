import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetStore, DurableJobRecord, JobHistoryStore, StoredAssetRef } from '@imagen-ps/application';

interface JobHistoryFile {
  readonly schemaVersion: 1;
  readonly records: readonly DurableJobRecord[];
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.imagen-ps');
}

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.unlinkSync(tmpPath);
  } catch (err: unknown) {
    if (!isNodeError(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function toBuffer(bytes: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(bytes));
}

/** CLI durable job history store，使用 schema-versioned JSON 保存 terminal record。 */
export class FileJobHistoryStore implements JobHistoryStore {
  private readonly historyPath: string;

  constructor(configDir = defaultConfigDir()) {
    this.historyPath = path.join(configDir, 'job-history.json');
  }

  async put(record: DurableJobRecord): Promise<void> {
    const file = this.readFile();
    const records = file.records.filter((item) => item.jobId !== record.jobId);
    writeJsonFileAtomic(this.historyPath, {
      schemaVersion: 1,
      records: [...records, record],
    } satisfies JobHistoryFile);
  }

  async get(jobId: string): Promise<DurableJobRecord | undefined> {
    return this.readFile().records.find((record) => record.jobId === jobId);
  }

  async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly DurableJobRecord[]> {
    const records = this.readFile()
      .records.filter((record) => query?.status === undefined || record.status === query.status)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
  }

  async delete(jobId: string): Promise<void> {
    const file = this.readFile();
    writeJsonFileAtomic(this.historyPath, {
      schemaVersion: 1,
      records: file.records.filter((record) => record.jobId !== jobId),
    } satisfies JobHistoryFile);
  }

  private readFile(): JobHistoryFile {
    return readJsonFile<JobHistoryFile>(this.historyPath) ?? { schemaVersion: 1, records: [] };
  }
}

/** CLI asset store。record 只保存 opaque `hostObject` ref，真实文件路径留在 adapter 内部。 */
export class FileAssetStore implements AssetStore {
  private readonly assetDir: string;

  constructor(configDir = defaultConfigDir()) {
    this.assetDir = path.join(configDir, 'job-assets');
  }

  async put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef> {
    fs.mkdirSync(this.assetDir, { recursive: true });
    const buffer = toBuffer(bytes);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const extension = extensionForMimeType(meta.mimeType);
    const ref = `${sha256}${extension}`;
    fs.writeFileSync(path.join(this.assetDir, ref), buffer);
    return {
      kind: 'hostObject',
      ref,
      ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
      ...(meta.name !== undefined ? { name: meta.name } : {}),
      sha256,
      byteSize: buffer.byteLength,
    };
  }

  async resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined> {
    if (ref.kind !== 'hostObject') {
      return undefined;
    }
    try {
      const bytes = fs.readFileSync(path.join(this.assetDir, ref.ref));
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
  }

  async delete(ref: StoredAssetRef): Promise<void> {
    if (ref.kind !== 'hostObject') {
      return;
    }
    try {
      fs.unlinkSync(path.join(this.assetDir, ref.ref));
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
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
