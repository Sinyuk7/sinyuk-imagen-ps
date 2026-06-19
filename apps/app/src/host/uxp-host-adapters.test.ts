import { describe, expect, it, vi } from 'vitest';
import type { DurableJobRecord, ProviderProfile } from '@imagen-ps/application';
import { createUxpAssetStore, createUxpJobHistoryStore } from './uxp-job-history-adapter';
import { createUxpLogSink } from './uxp-log-sink';
import { createUxpProviderProfileRepository } from './uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from './uxp-secret-storage-adapter';
import type { UxpModules } from './uxp-api';

interface FakeFile {
  readonly name?: string;
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly append?: boolean; readonly format?: unknown }): Promise<void>;
}

interface FakeFolder {
  getEntry(name: string): Promise<FakeEntry>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<FakeFile>;
  createFolder(name: string): Promise<FakeFolder>;
}

type FakeEntry = FakeFile | FakeFolder;

function textEncoder(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

class MutableFakeFile implements FakeFile {
  readonly writes: Array<{
    readonly data: string | ArrayBuffer;
    readonly options?: { readonly append?: boolean; readonly format?: unknown };
  }> = [];

  constructor(
    readonly name: string,
    private content: string | ArrayBuffer = '',
  ) {}

  async read(): Promise<string | ArrayBuffer> {
    return this.content;
  }

  async write(data: string | ArrayBuffer, options?: { readonly append?: boolean; readonly format?: unknown }): Promise<void> {
    this.writes.push({ data, options });
    if (options?.append === true && typeof this.content === 'string' && typeof data === 'string') {
      this.content += data;
      return;
    }
    this.content = data;
  }
}

function createFakeDataFolder(initialEntries?: Record<string, FakeEntry>): {
  readonly folder: FakeFolder;
  readonly files: Record<string, FakeEntry>;
} {
  const files: Record<string, FakeEntry> = { ...(initialEntries ?? {}) };
  return {
    files,
    folder: {
      async getEntry(name: string): Promise<FakeEntry> {
        const file = files[name];
        if (!file) {
          throw new Error(`missing entry: ${name}`);
        }
        return file;
      },
      async createFile(name: string): Promise<FakeFile> {
        const entry = new MutableFakeFile(name);
        files[name] = entry;
        return entry;
      },
      async createFolder(name: string): Promise<FakeFolder> {
        const entry = createFakeDataFolder();
        files[name] = entry.folder;
        return entry.folder;
      },
    },
  };
}

describe('fake UXP host adapters', () => {
  it('在 data folder JSON 中持久化 provider profile', async () => {
    const dataFolder = createFakeDataFolder();
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            formats: { utf8: 'utf8' },
            async getDataFolder() {
              return dataFolder.folder;
            },
          },
        },
      },
    };
    const repo = createUxpProviderProfileRepository(modules);
    const profile: ProviderProfile = {
      profileId: 'profile-1',
      providerId: 'mock',
      displayName: 'Mock Profile',
      enabled: true,
      config: { family: 'image-endpoint', baseURL: 'https://mock.local' },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };

    await repo.save(profile);
    expect(await repo.list()).toEqual([profile]);
    expect(await repo.get('profile-1')).toEqual(profile);

    await repo.delete('profile-1');
    expect(await repo.list()).toEqual([]);
  });

  it('UXP storage 不可用时 profile repository 回退到 in-memory 实现', async () => {
    const repo = createUxpProviderProfileRepository({});
    const profile: ProviderProfile = {
      profileId: 'profile-1',
      providerId: 'mock',
      displayName: 'Mock Profile',
      enabled: true,
      config: {},
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };

    await repo.save(profile);
    expect(await repo.get('profile-1')).toEqual(profile);
  });

  it('从 string 和 ArrayBuffer 读取 secureStorage secret', async () => {
    const secureStorage = {
      getItem: vi.fn(async (key: string) => {
        if (key === 'string-key') {
          return 'plain-secret';
        }
        if (key === 'buffer-key') {
          return textEncoder('buffer-secret');
        }
        return undefined;
      }),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };
    const adapter = createUxpSecretStorageAdapter({
      uxp: { storage: { secureStorage } },
    });

    expect(await adapter.getSecret('string-key')).toBe('plain-secret');
    expect(await adapter.getSecret('buffer-key')).toBe('buffer-secret');
    await adapter.setSecret('api-key', 'value');
    await adapter.deleteSecret('api-key');
    expect(secureStorage.setItem).toHaveBeenCalledWith('api-key', 'value');
    expect(secureStorage.removeItem).toHaveBeenCalledWith('api-key');
  });

  it('secureStorage 不可用时 secret adapter 回退到 in-memory 实现', async () => {
    const adapter = createUxpSecretStorageAdapter({});
    await adapter.setSecret('api-key', 'value');
    expect(await adapter.getSecret('api-key')).toBe('value');
    await adapter.deleteSecret('api-key');
    expect(await adapter.getSecret('api-key')).toBeUndefined();
  });

  it('在 job history JSON 中持久化 durable records 并支持 status 和 limit 查询', async () => {
    const stored = createFakeDataFolder({
      'job-history.json': new MutableFakeFile('job-history.json'),
    });
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            formats: { utf8: 'utf8', binary: 'binary' },
            async getDataFolder() {
              return stored.folder;
            },
          },
        },
      },
    };
    const store = createUxpJobHistoryStore(modules);
    const first: DurableJobRecord = {
      schemaVersion: 1,
      jobId: 'job-1',
      status: 'completed',
      workflow: 'provider-generate',
      input: { profileId: 'profile-1' },
      outputs: [],
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };
    const second: DurableJobRecord = {
      ...first,
      jobId: 'job-2',
      status: 'failed',
      updatedAt: '2026-06-15T00:00:02.000Z',
    };

    await store.put(first);
    await store.put(second);

    expect(await store.get('job-1')).toEqual(first);
    expect(await store.list()).toEqual([second, first]);
    expect(await store.list({ status: 'failed' })).toEqual([second]);
    expect(await store.list({ limit: 1 })).toEqual([second]);
    await store.delete('job-1');
    expect(await store.get('job-1')).toBeUndefined();
  });

  it('把二进制 asset 写入 data folder 并返回 opaque hostObject ref', async () => {
    const bytes = textEncoder('asset-bytes');
    const fileWrites: Array<string | ArrayBuffer> = [];
    const storedFiles = new Map<string, { read(): Promise<string | ArrayBuffer>; write(data: string | ArrayBuffer): Promise<void> }>();
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            formats: { binary: 'binary' },
            async getDataFolder() {
              return {
                async getEntry(name: string) {
                  const file = storedFiles.get(name);
                  if (!file) {
                    throw new Error('missing');
                  }
                  return file;
                },
                async createFile(name: string) {
                  const file = {
                    async read(): Promise<string | ArrayBuffer> {
                      return bytes;
                    },
                    async write(data: string | ArrayBuffer): Promise<void> {
                      fileWrites.push(data);
                    },
                  };
                  storedFiles.set(name, file);
                  return file;
                },
              };
            },
          },
        },
      },
    };
    const store = createUxpAssetStore(modules);
    const ref = await store.put(bytes, { mimeType: 'image/png', name: 'image.png' });
    const resolved = await store.resolve(ref);

    expect(ref).toMatchObject({
      kind: 'hostObject',
      name: 'image.png',
      mimeType: 'image/png',
      byteSize: bytes.byteLength,
    });
    expect(ref.ref).toMatch(/^uxp-asset-/);
    expect(resolved).toEqual(bytes);
    expect(fileWrites[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('UXP log sink 复用已有 JSONL 文件而不是覆盖重建', async () => {
    const writes: string[] = [];
    const existingLogFile: FakeFile = {
      name: 'imagen.jsonl',
      async read() {
        return '';
      },
      async write(data: string | ArrayBuffer) {
        writes.push(String(data));
      },
    };
    const createdFiles: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const dateFolder = createFakeDataFolder({ 'imagen.jsonl': existingLogFile });
    const logsFolder = createFakeDataFolder({ [today]: dateFolder.folder });
    const dataFolder = createFakeDataFolder({ logs: logsFolder.folder });
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            async getDataFolder() {
              return {
                async getEntry(name: string) {
                  return dataFolder.folder.getEntry(name);
                },
                async createFolder(name: string) {
                  throw new Error(`unexpected folder creation: ${name}`);
                },
                async createFile(name: string) {
                  createdFiles.push(name);
                  throw new Error(`unexpected file creation: ${name}`);
                },
              };
            },
          },
        },
      },
    };

    const sink = createUxpLogSink(modules);
    sink.write({
      schema_version: 1,
      timestamp: '2026-06-16T00:00:00.000Z',
      level: 'info',
      event: 'test.event',
      surface: 'test',
      package: 'app',
      component: 'sink',
      trace_id: 'tr_1',
      span_id: 'sp_1',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createdFiles).toEqual([]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"event":"test.event"');
  });

  it('UXP log sink 在 data folder 中创建日期 JSONL 并追加写入', async () => {
    const dataFolder = createFakeDataFolder();
    const modules: UxpModules = {
      uxp: {
        storage: {
          formats: { utf8: 'uxp-utf8' },
          localFileSystem: {
            async getDataFolder() {
              return dataFolder.folder;
            },
          },
        },
      },
    };

    const sink = createUxpLogSink(modules);
    sink.write({
      schema_version: 1,
      timestamp: '2026-06-16T00:00:00.000Z',
      level: 'info',
      event: 'test.first',
      surface: 'test',
      package: 'app',
      component: 'sink',
      trace_id: 'tr_1',
      span_id: 'sp_1',
    });
    sink.write({
      schema_version: 1,
      timestamp: '2026-06-16T00:00:01.000Z',
      level: 'info',
      event: 'test.second',
      surface: 'test',
      package: 'app',
      component: 'sink',
      trace_id: 'tr_1',
      span_id: 'sp_2',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const logsFolder = await dataFolder.folder.getEntry('logs') as FakeFolder;
    const dateFolder = await logsFolder.getEntry(new Date().toISOString().slice(0, 10)) as FakeFolder;
    const file = await dateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const raw = await file.read();
    const lines = String(raw).split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"event":"test.first"');
    expect(lines[1]).toContain('"event":"test.second"');
    expect(file.writes.map((write) => write.options)).toEqual([
      { append: true, format: 'uxp-utf8' },
      { append: true, format: 'uxp-utf8' },
    ]);
  });
});
