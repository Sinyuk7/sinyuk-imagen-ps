import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DurableJobRecord, ProviderProfile, TaskRecord } from '@imagen-ps/application';
import { decodeLogRecords, type LogRecord } from '@imagen-ps/foundation';
import { createUxpAssetStore, createUxpJobHistoryStore, createUxpTaskStore } from './uxp-job-history-adapter';
import { createUxpLogSink } from './uxp-log-sink';
import { createUxpActiveImageProfileStore } from './uxp-active-image-profile-store';
import { createUxpGenerationSettingsStore } from './uxp-generation-settings-store';
import { createUxpProviderProfileRepository } from './uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from './uxp-secret-storage-adapter';
import type { UxpModules } from './uxp-api';

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_DIAGNOSTIC_SKIP_SECURE_STORAGE_GET__: boolean | undefined;
}

interface FakeFile {
  readonly name?: string;
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly append?: boolean; readonly format?: unknown }): Promise<void>;
  delete?(): Promise<void>;
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

function arrayBufferFromBytes(bytes: readonly number[]): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}

const LEGACY_TRUNCATED_MOCK_PNG = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
  0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
] as const;

const VALID_TRANSPARENT_PNG = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x60,
  0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa5, 0xf6,
  0x45, 0x40, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
] as const;

class MutableFakeFile implements FakeFile {
  readonly writes: Array<{
    readonly data: string | ArrayBuffer;
    readonly options?: { readonly append?: boolean; readonly format?: unknown };
  }> = [];
  deleted = false;

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

  async delete(): Promise<void> {
    this.deleted = true;
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
      async createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<FakeFile> {
        if (files[name] && options?.overwrite !== true) {
          throw new Error(`entry exists: ${name}`);
        }
        const entry = new MutableFakeFile(name);
        files[name] = entry;
        return entry;
      },
      async createFolder(name: string): Promise<FakeFolder> {
        if (files[name]) {
          throw new Error(`entry exists: ${name}`);
        }
        const entry = createFakeDataFolder();
        files[name] = entry.folder;
        return entry.folder;
      },
    },
  };
}

function makeLogRecord(event: string, spanId = 'sp_1'): LogRecord {
  return {
    schema_version: 1,
    timestamp: '2026-06-16T00:00:00.000Z',
    level: 'info' as const,
    event,
    surface: 'test',
    package: 'app',
    component: 'sink',
    trace_id: 'tr_1',
    span_id: spanId,
  };
}

function sampleTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    status: 'completed',
    operation: 'text-to-image',
    prompt: 'history prompt',
    attachments: [],
    outputs: [{
      outputId: 'out-1',
      index: 0,
      kind: 'image',
      asset: { ref: { kind: 'hostObject', ref: 'history-asset-1', mimeType: 'image/png' } },
    }],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:01.000Z',
    finishedAt: '2026-06-25T00:00:01.000Z',
    ...overrides,
  };
}

describe('fake UXP host adapters', () => {
  afterEach(() => {
    delete globalThis.__IMAGEN_PS_DIAGNOSTIC_SKIP_SECURE_STORAGE_GET__;
  });

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
      config: {
        family: 'image-endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
        },
      },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };

    await repo.save(profile);
    expect(await repo.list()).toEqual([profile]);
    expect(await repo.get('profile-1')).toEqual(profile);

    await repo.delete('profile-1');
    expect(await repo.list()).toEqual([]);
  });

  it('在 data folder JSON 中持久化 active image profile', async () => {
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

    const store = createUxpActiveImageProfileStore(modules);
    expect(await store.load()).toBeNull();

    await store.save('profile-1');
    expect(await store.load()).toBe('profile-1');

    const file = dataFolder.files['active-image-profile.json'] as MutableFakeFile | undefined;
    expect(file).toBeDefined();
    expect(JSON.parse(String(await file?.read()))).toEqual({ activeImageProfileId: 'profile-1' });
  });

  it('在 data folder JSON 中持久化 generation settings', async () => {
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

    const store = createUxpGenerationSettingsStore(modules);
    expect(await store.load()).toEqual({
      outputSizePreset: '2k',
      outputFormat: 'png',
      aspectRatio: 'auto',
      providerInputSizePreset: '1k',
    });

    await store.save({
      outputSizePreset: '4k',
      outputFormat: 'webp',
      aspectRatio: '16:9',
      providerInputSizePreset: '2k',
    });

    expect(await store.load()).toEqual({
      outputSizePreset: '4k',
      outputFormat: 'webp',
      aspectRatio: '16:9',
      providerInputSizePreset: '2k',
    });

    const file = dataFolder.files['generation-settings.json'] as MutableFakeFile | undefined;
    expect(file).toBeDefined();
    expect(JSON.parse(String(await file?.read()))).toEqual({
      outputSizePreset: '4k',
      outputFormat: 'webp',
      aspectRatio: '16:9',
      providerInputSizePreset: '2k',
    });
  });

  it('profile repository 写入细粒度 flight recorder checkpoint 且不包含 secret/path', async () => {
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
      config: {
        family: 'image-endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
        },
        notes: '/Users/sinyuk/should-not-enter-flight-recorder',
      },
      secretRefs: { apiKey: 'secret:provider-profile:profile-1:apiKey' },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };

    await repo.save(profile);

    const logsFolder = await dataFolder.folder.getEntry('logs') as FakeFolder;
    const dateFolder = await logsFolder.getEntry(new Date().toISOString().slice(0, 10)) as FakeFolder;
    const logFile = await dateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const logText = String(await logFile.read());
    const events = decodeLogRecords(logText).map((record) => record.event);

    expect(events).toEqual([
      'uxp.profile_repository.save.start',
      'uxp.profile_repository.read.prepare',
      'uxp.profile_repository.read.before_file_read',
      'uxp.profile_repository.read.after_file_read',
      'uxp.profile_repository.read.parsed',
      'uxp.profile_repository.write.prepare',
      'uxp.profile_repository.write.before_file_write',
      'uxp.profile_repository.write.after_file_write',
      'uxp.profile_repository.save.ok',
    ]);
    expect(logText).toContain('"credentialRefCount":1');
    expect(logText).not.toContain('secret:provider-profile');
    expect(logText).not.toContain('/Users/sinyuk/');
    expect(logText).not.toContain('should-not-enter-flight-recorder');
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

  it('secureStorage 写入细粒度 flight recorder checkpoint 且不包含 secret value 或完整 key', async () => {
    const dataFolder = createFakeDataFolder();
    const secureStorage = {
      getItem: vi.fn(async () => 'sk_live_should_not_log'),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };
    const adapter = createUxpSecretStorageAdapter({
      uxp: {
        storage: {
          secureStorage,
          localFileSystem: {
            formats: { utf8: 'utf8' },
            async getDataFolder() {
              return dataFolder.folder;
            },
          },
        },
      },
    });

    expect(await adapter.getSecret('secret:provider-profile:profile-1:apiKey')).toBe('sk_live_should_not_log');
    await adapter.setSecret('secret:provider-profile:profile-1:apiKey', 'sk_live_write_should_not_log');
    await adapter.deleteSecret('secret:provider-profile:profile-1:apiKey');

    const logsFolder = await dataFolder.folder.getEntry('logs') as FakeFolder;
    const dateFolder = await logsFolder.getEntry(new Date().toISOString().slice(0, 10)) as FakeFolder;
    const logFile = await dateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const logText = String(await logFile.read());
    const records = decodeLogRecords(logText);

    expect(records.map((record) => record.event)).toEqual([
      'uxp.secret_storage.get.before_get_item',
      'uxp.secret_storage.get.after_get_item',
      'uxp.secret_storage.set.before_set_item',
      'uxp.secret_storage.set.after_set_item',
      'uxp.secret_storage.delete.before_remove_item',
      'uxp.secret_storage.delete.after_remove_item',
    ]);
    expect(records.every((record) => record.attrs?.keyHash === records[0].attrs?.keyHash)).toBe(true);
    expect(logText).toContain('"keyHash":"fnv1a32:');
    expect(logText).toContain('"valueLength":28');
    expect(logText).not.toContain('secret:provider-profile');
    expect(logText).not.toContain('sk_live_should_not_log');
    expect(logText).not.toContain('sk_live_write_should_not_log');
  });

  it('diagnostic flag 可以跳过 secureStorage.getItem 且写入 sanitized checkpoint', async () => {
    const dataFolder = createFakeDataFolder();
    const secureStorage = {
      getItem: vi.fn(async () => 'sk_live_should_not_be_read'),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };
    const adapter = createUxpSecretStorageAdapter({
      uxp: {
        storage: {
          secureStorage,
          localFileSystem: {
            formats: { utf8: 'utf8' },
            async getDataFolder() {
              return dataFolder.folder;
            },
          },
        },
      },
    });

    globalThis.__IMAGEN_PS_DIAGNOSTIC_SKIP_SECURE_STORAGE_GET__ = true;

    await expect(adapter.getSecret('secret:provider-profile:profile-1:apiKey')).resolves.toBeUndefined();
    expect(secureStorage.getItem).not.toHaveBeenCalled();

    const logsFolder = await dataFolder.folder.getEntry('logs') as FakeFolder;
    const dateFolder = await logsFolder.getEntry(new Date().toISOString().slice(0, 10)) as FakeFolder;
    const logFile = await dateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const logText = String(await logFile.read());
    const records = decodeLogRecords(logText);

    expect(records.map((record) => record.event)).toEqual([
      'uxp.secret_storage.get.before_get_item',
      'uxp.secret_storage.get.skipped_by_diagnostic',
    ]);
    expect(logText).toContain('"keyHash":"fnv1a32:');
    expect(logText).not.toContain('secret:provider-profile');
    expect(logText).not.toContain('sk_live_should_not_be_read');
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

  it('在 task history JSON 中隔离坏记录并按 taskId upsert', async () => {
    const stored = createFakeDataFolder({
      'task-history.json': new MutableFakeFile('task-history.json', JSON.stringify({
        schemaVersion: 1,
        records: [
          { schemaVersion: 999, taskId: 'old-task' },
          { schemaVersion: 1, taskId: '', status: 'completed' },
        ],
      })),
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
    const store = createUxpTaskStore(modules);
    const first = sampleTask();
    const second = sampleTask({
      taskId: 'task-2',
      status: 'running',
      outputs: [],
      finishedAt: undefined,
      updatedAt: '2026-06-25T00:00:02.000Z',
    });

    await store.put(first);
    await store.put(second);
    await store.put({ ...first, prompt: 'updated prompt', updatedAt: '2026-06-25T00:00:03.000Z' });

    expect(await store.get('task-1')).toMatchObject({ prompt: 'updated prompt' });
    expect((await store.list()).map((record) => record.taskId)).toEqual(['task-1', 'task-2']);
    expect(await store.list({ status: 'completed' })).toMatchObject([{ taskId: 'task-1' }]);
    await store.delete('task-1');
    expect(await store.get('task-1')).toBeUndefined();
  });

  it('把二进制 asset 写入 data folder 并返回 opaque hostObject ref', async () => {
    const bytes = arrayBufferFromBytes(VALID_TRANSPARENT_PNG);
    const fileWrites: Array<string | ArrayBuffer> = [];
    const fileFormats: unknown[] = [];
    const storedFiles = new Map<string, {
      read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
      write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void>;
      delete?(): Promise<void>;
      deleted?: boolean;
    }>();
    const modules: UxpModules = {
      uxp: {
        storage: {
          formats: { binary: 'storage-binary' },
          localFileSystem: {
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
                    async read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer> {
                      fileFormats.push(options?.format);
                      return bytes;
                    },
                    async write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void> {
                      fileFormats.push(options?.format);
                      fileWrites.push(data);
                    },
                    async delete(): Promise<void> {
                      file.deleted = true;
                    },
                    deleted: false,
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
    expect(fileFormats).toEqual(['storage-binary', 'storage-binary']);
    await store.delete(ref);
    expect(storedFiles.get(ref.ref)?.deleted).toBe(true);
  });

  it('拒绝把旧 mock 坏 PNG 写入 UXP asset store', async () => {
    const fileWrites: Array<string | ArrayBuffer> = [];
    const dataFolder = createFakeDataFolder();
    const modules: UxpModules = {
      uxp: {
        storage: {
          formats: { binary: 'storage-binary' },
          localFileSystem: {
            async getDataFolder() {
              return {
                async getEntry(name: string) {
                  return dataFolder.folder.getEntry(name);
                },
                async createFile(name: string) {
                  const file = new MutableFakeFile(name);
                  const originalWrite = file.write.bind(file);
                  file.write = async (data, options) => {
                    fileWrites.push(data);
                    await originalWrite(data, options);
                  };
                  return file;
                },
              };
            },
          },
        },
      },
    };
    const store = createUxpAssetStore(modules);

    await expect(
      store.put(arrayBufferFromBytes(LEGACY_TRUNCATED_MOCK_PNG), {
        mimeType: 'image/png',
        name: 'mock-image-1.png',
      }),
    ).rejects.toThrow('PNG asset chunk CRC is invalid.');

    expect(fileWrites).toEqual([]);
  });

  it('UXP asset store 缺少 storage-level binary format 时给出清晰错误', async () => {
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            async getDataFolder() {
              return createFakeDataFolder().folder;
            },
          },
        },
      },
    };

    expect(() => createUxpAssetStore(modules)).toThrow('UXP binary file format is unavailable.');
  });

  it('读取到旧 mock 坏 PNG hostObject 时返回 undefined', async () => {
    const dataFolder = createFakeDataFolder({
      'legacy-bad.png': new MutableFakeFile('legacy-bad.png', arrayBufferFromBytes(LEGACY_TRUNCATED_MOCK_PNG)),
    });
    const modules: UxpModules = {
      uxp: {
        storage: {
          formats: { binary: 'storage-binary' },
          localFileSystem: {
            async getDataFolder() {
              return dataFolder.folder;
            },
          },
        },
      },
    };
    const store = createUxpAssetStore(modules);

    await expect(
      store.resolve({
        kind: 'hostObject',
        ref: 'legacy-bad.png',
        mimeType: 'image/png',
        name: 'mock-image-1.png',
        byteSize: LEGACY_TRUNCATED_MOCK_PNG.length,
      }),
    ).resolves.toBeUndefined();
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

  it('UXP log sink 容忍并发 writer 抢先创建 logs folder', async () => {
    let staleLogsMisses = 2;
    const dataFolder = createFakeDataFolder();
    const modules: UxpModules = {
      uxp: {
        storage: {
          localFileSystem: {
            async getDataFolder() {
              return {
                async getEntry(name: string) {
                  if (name === 'logs' && staleLogsMisses > 0) {
                    staleLogsMisses -= 1;
                    throw new Error(`stale missing entry: ${name}`);
                  }
                  return dataFolder.folder.getEntry(name);
                },
                createFile: dataFolder.folder.createFile,
                createFolder: dataFolder.folder.createFolder,
              };
            },
          },
        },
      },
    };

    const firstSink = createUxpLogSink(modules);
    const secondSink = createUxpLogSink(modules);
    await Promise.all([
      firstSink.write(makeLogRecord('test.concurrent-folder.first', 'sp_1')),
      secondSink.write(makeLogRecord('test.concurrent-folder.second', 'sp_2')),
    ]);

    const logsFolder = await dataFolder.folder.getEntry('logs') as FakeFolder;
    const dateFolder = await logsFolder.getEntry(new Date().toISOString().slice(0, 10)) as FakeFolder;
    const file = await dateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const lines = String(await file.read()).split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain('"event":"test.concurrent-folder.first"');
    expect(lines.join('\n')).toContain('"event":"test.concurrent-folder.second"');
  });

  it('UXP log sink 容忍并发 writer 抢先创建 JSONL 文件', async () => {
    let staleFileMisses = 2;
    const today = new Date().toISOString().slice(0, 10);
    const dateFolder = createFakeDataFolder();
    const racyDateFolder: FakeFolder = {
      async getEntry(name: string) {
        if (name === 'imagen.jsonl' && staleFileMisses > 0) {
          staleFileMisses -= 1;
          throw new Error(`stale missing entry: ${name}`);
        }
        return dateFolder.folder.getEntry(name);
      },
      createFile: dateFolder.folder.createFile,
      createFolder: dateFolder.folder.createFolder,
    };
    const logsFolder = createFakeDataFolder({ [today]: racyDateFolder });
    const dataFolder = createFakeDataFolder({ logs: logsFolder.folder });
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

    const firstSink = createUxpLogSink(modules);
    const secondSink = createUxpLogSink(modules);
    await Promise.all([
      firstSink.write(makeLogRecord('test.concurrent-file.first', 'sp_1')),
      secondSink.write(makeLogRecord('test.concurrent-file.second', 'sp_2')),
    ]);

    const file = await racyDateFolder.getEntry('imagen.jsonl') as MutableFakeFile;
    const lines = String(await file.read()).split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain('"event":"test.concurrent-file.first"');
    expect(lines.join('\n')).toContain('"event":"test.concurrent-file.second"');
    expect(file.writes.map((write) => write.options)).toEqual([
      { append: true, format: 'uxp-utf8' },
      { append: true, format: 'uxp-utf8' },
    ]);
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
