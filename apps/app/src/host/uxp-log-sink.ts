/**
 * UXP data-folder JSONL 日志 sink。
 *
 * 使用 UXP `localFileSystem.getDataFolder()` 作为持久化根目录，
 * 不写入 plugin 目录，不依赖任何私有 API。
 * 同时建议与 console sink 组合，作为即时观察面。
 */

import { encodeLogRecord } from '@imagen-ps/foundation';
import type { LogRecord, LogSink } from '@imagen-ps/foundation';
import type { UxpModules } from './uxp-api.js';

interface UxpFileEntry {
  write(data: string, options?: { append?: boolean; format?: 'utf8' }): Promise<void>;
}

interface UxpFolderEntry {
  createFolder(name: string): Promise<UxpFolderEntry>;
  createFile(name: string, options?: { overwrite?: boolean }): Promise<UxpFileEntry>;
  getEntry(name: string): Promise<UxpFolderEntry | UxpFileEntry | null>;
}

interface UxpLocalFileSystem {
  getDataFolder(): Promise<UxpFolderEntry>;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ensureFolder(parent: UxpFolderEntry, name: string): Promise<UxpFolderEntry> {
  const existing = await parent.getEntry(name);
  if (existing && typeof (existing as UxpFolderEntry).createFile === 'function') {
    return existing as UxpFolderEntry;
  }
  return parent.createFolder(name);
}

/** 创建 UXP data-folder 日志 sink。 */
export function createUxpLogSink(uxpModules: UxpModules): LogSink {
  const storage = (uxpModules.uxp?.storage ?? {}) as { localFileSystem?: UxpLocalFileSystem };
  const localFileSystem = storage.localFileSystem;

  if (!localFileSystem) {
    // 非 UXP 环境时 fail-open，不写入
    return { write: () => {} };
  }

  const lfs = localFileSystem;
  let filePromise: Promise<UxpFileEntry> | undefined;

  async function getLogFile(): Promise<UxpFileEntry> {
    if (filePromise !== undefined) {
      return filePromise;
    }

    filePromise = (async () => {
      const dataFolder = await lfs.getDataFolder();
      const logsFolder = await ensureFolder(dataFolder, 'logs');
      const dateFolder = await ensureFolder(logsFolder, toISODate(new Date()));
      return await dateFolder.createFile('imagen.jsonl', { overwrite: true });
    })();

    return filePromise;
  }

  return {
    write(record: LogRecord): void {
      getLogFile()
        .then((file) => file.write(encodeLogRecord(record) + '\n', { append: true, format: 'utf8' }))
        .catch(() => {
          // fail-open：日志写失败不应影响 UXP 主流程
        });
    },
  };
}
