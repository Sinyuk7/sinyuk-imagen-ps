import { describe, expect, it } from 'vitest';
import type { LogRecord } from '@imagen-ps/foundation';
import { exportRecentLogRecords, readRecentLogRecords } from './uxp-diagnostics';
import type { UxpModules } from './uxp-api';

interface FakeFileEntry {
  readonly nativePath?: string;
  content: string | ArrayBuffer;
  writes: Array<{ readonly data: string | ArrayBuffer; readonly options?: { readonly format?: unknown } }>;
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: ArrayBuffer | Uint8Array | string, options?: { readonly format?: unknown }): Promise<void>;
}

interface FakeFolderEntry {
  readonly nativePath?: string;
  readonly entries: Map<string, FakeFolderEntry | FakeFileEntry>;
  createFolder(name: string): Promise<FakeFolderEntry>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<FakeFileEntry>;
  getEntry(name: string): Promise<FakeFolderEntry | FakeFileEntry | null>;
}

function textEncoder(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

class MutableFakeFileEntry implements FakeFileEntry {
  readonly nativePath?: string;
  writes: Array<{ readonly data: string | ArrayBuffer; readonly options?: { readonly format?: unknown } }> = [];

  constructor(
    readonly name: string,
    public content: string | ArrayBuffer = '',
    nativePath?: string,
  ) {
    if (nativePath !== undefined) {
      this.nativePath = nativePath;
    }
  }

  async read(): Promise<string | ArrayBuffer> {
    return this.content;
  }

  async write(data: ArrayBuffer | Uint8Array | string, options?: { readonly format?: unknown }): Promise<void> {
    this.writes.push({ data, options });
    this.content = data instanceof Uint8Array ? data.buffer : data;
  }
}

class MutableFakeFolderEntry implements FakeFolderEntry {
  readonly entries = new Map<string, FakeFolderEntry | FakeFileEntry>();

  constructor(readonly name: string, readonly nativePath?: string) {}

  async createFolder(name: string): Promise<FakeFolderEntry> {
    const folder = new MutableFakeFolderEntry(name);
    this.entries.set(name, folder);
    return folder;
  }

  async createFile(name: string): Promise<FakeFileEntry> {
    const file = new MutableFakeFileEntry(name);
    this.entries.set(name, file);
    return file;
  }

  async getEntry(name: string): Promise<FakeFolderEntry | FakeFileEntry | null> {
    const entry = this.entries.get(name);
    if (!entry) {
      // 真实 UXP 在 entry 缺失时 throw。
      throw new Error(`missing entry: ${name}`);
    }
    return entry;
  }
}

type FakeLocalFileSystem = NonNullable<NonNullable<UxpModules['uxp']>['storage']>['localFileSystem'];

function createFakeLocalFileSystem(
  dataFolder: FakeFolderEntry,
  options?: {
    readonly getFileForSaving?: (opts?: { readonly types?: readonly string[]; readonly suggestedName?: string }) => Promise<FakeFileEntry | undefined>;
  },
): FakeLocalFileSystem {
  const lfs = {
    formats: { utf8: 'utf8' },
    async getDataFolder(): Promise<FakeFolderEntry> {
      return dataFolder;
    },
  };
  if (options?.getFileForSaving) {
    return {
      ...lfs,
      getFileForSaving: options.getFileForSaving,
    };
  }
  return lfs;
}

function makeRecord(overrides?: Partial<LogRecord>): LogRecord {
  return {
    schema_version: 1,
    timestamp: '2026-06-15T00:00:00.000Z',
    level: 'info',
    event: 'test.event',
    surface: 'test',
    package: 'app',
    component: 'sink',
    trace_id: 'tr_1',
    span_id: 'sp_1',
    ...overrides,
  };
}

function modulesWithLfs(lfs: FakeLocalFileSystem): UxpModules {
  return {
    uxp: {
      storage: {
        localFileSystem: lfs,
      } as unknown,
    },
  };
}

describe('UXP diagnostics fake harness', () => {
  it('localFileSystem 不可用时返回错误', async () => {
    const result = await readRecentLogRecords({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('localFileSystem is unavailable');
    }
  });

  it('读取现有日期的 JSONL 记录并限制返回数量', async () => {
    const date = '2026-06-15';
    const records: LogRecord[] = [
      makeRecord({ event: 'test.first', timestamp: '2026-06-15T00:00:00.000Z' }),
      makeRecord({ event: 'test.second', timestamp: '2026-06-15T00:00:01.000Z' }),
      makeRecord({ event: 'test.third', timestamp: '2026-06-15T00:00:02.000Z' }),
    ];
    const logFile = new MutableFakeFileEntry(
      'imagen.jsonl',
      records.map((r) => JSON.stringify(r)).join('\n'),
      '/fake/data/logs/2026-06-15/imagen.jsonl',
    );
    const dateFolder = new MutableFakeFolderEntry(date);
    dateFolder.entries.set('imagen.jsonl', logFile);
    const logsFolder = new MutableFakeFolderEntry('logs');
    logsFolder.entries.set(date, dateFolder);
    const dataFolder = new MutableFakeFolderEntry('data');
    dataFolder.entries.set('logs', logsFolder);

    const result = await readRecentLogRecords(modulesWithLfs(createFakeLocalFileSystem(dataFolder)), { date, limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date).toBe(date);
      expect(result.lineCount).toBe(3);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].event).toBe('test.second');
      expect(result.records[1].event).toBe('test.third');
      expect(JSON.stringify(result)).not.toContain('/fake/data/logs');
      expect(JSON.stringify(result)).not.toContain('nativePath');
    }
  });

  it('读取日志时返回红化后的记录', async () => {
    const date = '2026-06-15';
    const records: LogRecord[] = [
      makeRecord({
        event: 'test.read-redaction',
        attrs: { apiKey: 'sk_live_read_secret', path: '/Users/sinyuk/read-secret.txt' },
      }),
    ];
    const logFile = new MutableFakeFileEntry('imagen.jsonl', records.map((r) => JSON.stringify(r)).join('\n'));
    const dateFolder = new MutableFakeFolderEntry(date);
    dateFolder.entries.set('imagen.jsonl', logFile);
    const logsFolder = new MutableFakeFolderEntry('logs');
    logsFolder.entries.set(date, dateFolder);
    const dataFolder = new MutableFakeFolderEntry('data');
    dataFolder.entries.set('logs', logsFolder);

    const result = await readRecentLogRecords(modulesWithLfs(createFakeLocalFileSystem(dataFolder)), { date });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const resultText = JSON.stringify(result);
      expect(result.records).toHaveLength(1);
      expect(resultText).toContain('[REDACTED]');
      expect(resultText).not.toContain('sk_live_read_secret');
      expect(resultText).not.toContain('/Users/sinyuk/');
    }
  });

  it('日志文件不存在时返回空数组和 lineCount=0', async () => {
    const date = '2026-06-15';
    const dataFolder = new MutableFakeFolderEntry('data');

    const result = await readRecentLogRecords(modulesWithLfs(createFakeLocalFileSystem(dataFolder)), { date });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records).toEqual([]);
      expect(result.lineCount).toBe(0);
    }
  });

  it('getFileForSaving 不可用时导出返回错误', async () => {
    const dataFolder = new MutableFakeFolderEntry('data');
    const lfs = createFakeLocalFileSystem(dataFolder);
    delete (lfs as { getFileForSaving?: unknown }).getFileForSaving;

    const result = await exportRecentLogRecords(modulesWithLfs(lfs));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('getFileForSaving is unavailable');
    }
  });

  it('导出日志时用户取消返回错误', async () => {
    const dataFolder = new MutableFakeFolderEntry('data');
    const lfs = createFakeLocalFileSystem(dataFolder, {
      async getFileForSaving() {
        return undefined;
      },
    });

    const result = await exportRecentLogRecords(modulesWithLfs(lfs));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Export cancelled by user');
    }
  });

  it('导出日志时写入经过红化的记录', async () => {
    const date = '2026-06-15';
    const records: LogRecord[] = [
      makeRecord({
        event: 'test.secret',
        attrs: { apiKey: 'sk_liv...cdef', path: '/Users/sinyuk/secret.txt' },
      }),
    ];
    const logFile = new MutableFakeFileEntry('imagen.jsonl', records.map((r) => JSON.stringify(r)).join('\n'));
    const dateFolder = new MutableFakeFolderEntry(date);
    dateFolder.entries.set('imagen.jsonl', logFile);
    const logsFolder = new MutableFakeFolderEntry('logs');
    logsFolder.entries.set(date, dateFolder);
    const dataFolder = new MutableFakeFolderEntry('data');
    dataFolder.entries.set('logs', logsFolder);

    const targetFile = new MutableFakeFileEntry('exported.jsonl', '', '/fake/exported.jsonl');
    const lfs = createFakeLocalFileSystem(dataFolder, {
      async getFileForSaving(options) {
        expect(options?.suggestedName).toBe(`imagen-ps-logs-${date}.jsonl`);
        return targetFile;
      },
    });

    const result = await exportRecentLogRecords(modulesWithLfs(lfs), { date });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exportedCount).toBe(1);
      expect(result.targetNativePath).toBe('/fake/exported.jsonl');
    }

    expect(targetFile.writes).toHaveLength(1);
    const exportedText = String(targetFile.writes[0].data);
    expect(exportedText).toContain('"event":"test.secret"');
    expect(exportedText).not.toContain('sk_live_');
    expect(exportedText).not.toContain('/Users/sinyuk/');
    expect(exportedText).toContain('[REDACTED]');
  });

  it('ArrayBuffer 输入时能正确解码', async () => {
    const date = '2026-06-15';
    const records: LogRecord[] = [makeRecord({ event: 'test.buffer' })];
    const logFile = new MutableFakeFileEntry(
      'imagen.jsonl',
      textEncoder(records.map((r) => JSON.stringify(r)).join('\n')),
    );
    const dateFolder = new MutableFakeFolderEntry(date);
    dateFolder.entries.set('imagen.jsonl', logFile);
    const logsFolder = new MutableFakeFolderEntry('logs');
    logsFolder.entries.set(date, dateFolder);
    const dataFolder = new MutableFakeFolderEntry('data');
    dataFolder.entries.set('logs', logsFolder);

    const result = await readRecentLogRecords(modulesWithLfs(createFakeLocalFileSystem(dataFolder)), { date });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records).toHaveLength(1);
      expect(result.records[0].event).toBe('test.buffer');
    }
  });
});
