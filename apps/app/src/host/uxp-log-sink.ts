/**
 * UXP data-folder JSONL 日志 sink。
 *
 * 使用 UXP `localFileSystem.getDataFolder()` 作为持久化根目录，
 * 不写入 plugin 目录，不依赖任何私有 API。
 * 同时建议与 console sink 组合，作为即时观察面。
 */

import { encodeLogRecord } from '@imagen-ps/foundation';
import { createConsoleSink, createLogger, toLogError } from '@imagen-ps/foundation';
import type { LogRecord, LogSink } from '@imagen-ps/foundation';
import type { UxpModules } from './uxp-api.js';

interface UxpFileEntry {
  write(data: string, options?: { append?: boolean; format?: unknown }): Promise<void>;
}

interface UxpFolderEntry {
  createFolder(name: string): Promise<UxpFolderEntry>;
  createFile(name: string, options?: { overwrite?: boolean }): Promise<UxpFileEntry>;
  getEntry(name: string): Promise<UxpFolderEntry | UxpFileEntry | null>;
}

interface UxpLocalFileSystem {
  readonly formats?: {
    readonly utf8?: unknown;
  };
  getDataFolder(): Promise<UxpFolderEntry>;
}

interface UxpStorage {
  readonly localFileSystem?: UxpLocalFileSystem;
  readonly formats?: {
    readonly utf8?: unknown;
  };
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ensureFolder(parent: UxpFolderEntry, name: string): Promise<UxpFolderEntry> {
  try {
    const existing = await parent.getEntry(name);
    if (existing && typeof (existing as UxpFolderEntry).createFile === 'function') {
      return existing as UxpFolderEntry;
    }
  } catch {
    // 真实 UXP 在 entry 缺失时 throw；fake 测试也按该语义覆盖。
  }
  return parent.createFolder(name);
}

async function getOrCreateFile(parent: UxpFolderEntry, name: string): Promise<UxpFileEntry> {
  try {
    const existing = await parent.getEntry(name);
    if (existing && typeof (existing as UxpFileEntry).write === 'function') {
      return existing as UxpFileEntry;
    }
  } catch {
    // 真实 UXP 在文件缺失时 throw。
  }
  return parent.createFile(name, { overwrite: true });
}

/** 创建 UXP data-folder 日志 sink。 */
export function createUxpLogSink(uxpModules: UxpModules): LogSink {
  const storage = (uxpModules.uxp?.storage ?? {}) as UxpStorage;
  const localFileSystem = storage.localFileSystem;

  if (!localFileSystem) {
    // 非 UXP 环境时 fail-open，不写入
    return { write: () => {} };
  }

  // 专门用于记录 sink 本身写失败的 console-only logger，避免循环写入日志文件。
  const failureLogger = createLogger({
    sink: createConsoleSink({ log: console.log }),
    context: {
      surface: 'uxp',
      package: 'app',
      component: 'sink',
    },
  });

  const lfs = localFileSystem;
  const textFormat = storage.formats?.utf8 ?? lfs.formats?.utf8;
  let filePromise: Promise<UxpFileEntry> | undefined;

  async function getLogFile(): Promise<UxpFileEntry> {
    if (filePromise !== undefined) {
      return filePromise;
    }

    filePromise = (async () => {
      const dataFolder = await lfs.getDataFolder();
      const logsFolder = await ensureFolder(dataFolder, 'logs');
      const dateFolder = await ensureFolder(logsFolder, toISODate(new Date()));
      return await getOrCreateFile(dateFolder, 'imagen.jsonl');
    })();

    return filePromise;
  }

  return {
    write(record: LogRecord): Promise<void> {
      return getLogFile()
        .then((file) => file.write(encodeLogRecord(record) + '\n', { append: true, format: textFormat }))
        .catch((error: unknown) => {
          // sink 写失败时通过独立通道记录，不影响主流程也不触发无穷循环。
          failureLogger.error('log.sink.write_failed', { event: record.event }, { error: toLogError(error) });
          throw error;
        });
    },
  };
}
