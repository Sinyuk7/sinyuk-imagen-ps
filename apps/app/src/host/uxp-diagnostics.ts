/**
 * UXP 诊断辅助函数：读取/导出近期 JSONL 日志。
 *
 * 通过 UXP Entry API 访问 data-folder/logs/YYYY-MM-DD/imagen.jsonl，
 * 不依赖任何私有 API 或本地绝对路径。
 * 导出内容已经过红化，不包含 secret、原始 provider payload、
 * 环境变量、auth 数据或本地路径。
 */

import {
  decodeLogRecords,
  encodeLogRecords,
  redactValue,
  type LogRecord,
} from '@imagen-ps/foundation';
import type { UxpModules } from './uxp-api';

interface UxpFileEntry {
  readonly nativePath?: string;
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: ArrayBuffer | Uint8Array | string, options?: { readonly format?: unknown }): Promise<void>;
}

interface UxpFolderEntry {
  createFolder(name: string): Promise<UxpFolderEntry>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFileEntry>;
  getEntry(name: string): Promise<UxpFolderEntry | UxpFileEntry | null>;
}

interface UxpLocalFileSystem {
  readonly formats?: {
    readonly utf8?: unknown;
  };
  getDataFolder(): Promise<UxpFolderEntry>;
  getFileForSaving?(options?: { readonly types?: readonly string[]; readonly suggestedName?: string }): Promise<UxpFileEntry | undefined>;
}

interface UxpStorage {
  readonly localFileSystem?: UxpLocalFileSystem;
  readonly formats?: {
    readonly utf8?: unknown;
  };
}

export interface ReadRecentLogsOptions {
  /** 日期，格式 YYYY-MM-DD；省略时使用今天 UTC。 */
  readonly date?: string;
  /** 最多返回多少条最新记录（从文件末尾截取）。 */
  readonly limit?: number;
}

export interface ReadRecentLogsSuccess {
  readonly ok: true;
  readonly date: string;
  readonly records: readonly LogRecord[];
  readonly lineCount: number;
}

export interface DiagnosticsError {
  readonly ok: false;
  readonly error: {
    readonly message: string;
  };
}

export type ReadRecentLogsResult = ReadRecentLogsSuccess | DiagnosticsError;

export interface ExportRecentLogsOptions {
  /** 日期，格式 YYYY-MM-DD；省略时使用今天 UTC。 */
  readonly date?: string;
  /** 导出对话框默认文件名。 */
  readonly suggestedName?: string;
}

export interface ExportRecentLogsSuccess {
  readonly ok: true;
  readonly exportedCount: number;
  /** 目标文件的 UXP native path（如果有）。 */
  readonly targetNativePath?: string;
}

export type ExportRecentLogsResult = ExportRecentLogsSuccess | DiagnosticsError;

function localFileSystemFrom(modules: UxpModules): UxpLocalFileSystem | undefined {
  const storage = (modules.uxp?.storage ?? {}) as UxpStorage;
  return storage.localFileSystem;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function decodeArrayBufferUtf8(buffer: ArrayBuffer): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(buffer);
  }

  const bytes = new Uint8Array(buffer);
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i];
    if (byte1 < 0x80) {
      out.push(byte1);
      i += 1;
    } else if ((byte1 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const code = ((byte1 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      out.push(code);
      i += 2;
    } else if ((byte1 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const code = ((byte1 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      out.push(code);
      i += 3;
    } else if ((byte1 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      let code =
        ((byte1 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      // 辅助平面：4 字节 UTF-8 分解为 surrogate pair。
      code -= 0x10000;
      out.push(0xd800 + (code >> 10));
      out.push(0xdc00 + (code & 0x3ff));
      i += 4;
    } else {
      i += 1;
    }
  }
  return String.fromCharCode(...out);
}

async function ensureFolder(parent: UxpFolderEntry, name: string): Promise<UxpFolderEntry> {
  try {
    const existing = await parent.getEntry(name);
    if (existing && typeof (existing as UxpFolderEntry).createFile === 'function') {
      return existing as UxpFolderEntry;
    }
  } catch {
    // 真实 UXP 在 entry 缺失时 throw。
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

async function getLogFile(lfs: UxpLocalFileSystem, date: string): Promise<UxpFileEntry> {
  const dataFolder = await lfs.getDataFolder();
  const logsFolder = await ensureFolder(dataFolder, 'logs');
  const dateFolder = await ensureFolder(logsFolder, date);
  return getOrCreateFile(dateFolder, 'imagen.jsonl');
}

async function readFileText(file: UxpFileEntry, format?: unknown): Promise<string> {
  const raw = await file.read({ format });
  if (typeof raw === 'string') {
    return raw;
  }
  return decodeArrayBufferUtf8(raw);
}

function sanitizeRecord(record: LogRecord): LogRecord {
  // 再次红化，确保导出内容不含 secret / path / raw payload / env / auth。
  return redactValue(record) as LogRecord;
}

/**
 * 读取最近日期的 JSONL 日志记录。
 *
 * 如果日志文件不存在，返回空数组和 lineCount=0。
 */
export async function readRecentLogRecords(
  modules: UxpModules,
  options?: ReadRecentLogsOptions,
): Promise<ReadRecentLogsResult> {
  const lfs = localFileSystemFrom(modules);
  if (!lfs) {
    return { ok: false, error: { message: 'UXP localFileSystem is unavailable.' } };
  }

  const date = options?.date ?? toISODate(new Date());
  try {
    const file = await getLogFile(lfs, date);
    const text = await readFileText(file, lfs.formats?.utf8);
    const records = decodeLogRecords(text);
    const safeRecords = records.map(sanitizeRecord);
    const limited = typeof options?.limit === 'number' ? safeRecords.slice(-options.limit) : safeRecords;
    const result: ReadRecentLogsSuccess = {
      ok: true,
      date,
      records: limited,
      lineCount: records.length,
    };
    return result;
  } catch (error) {
    return {
      ok: false,
      error: { message: errorMessage(error, `Failed to read logs for ${date}.`) },
    };
  }
}

/**
 * 将最近日期的日志导出到用户选择的文件。
 *
 * 调用 UXP `getFileForSaving` 弹出对话框，用户取消时返回错误。
 * 导出内容经过 release-safe 红化处理。
 */
export async function exportRecentLogRecords(
  modules: UxpModules,
  options?: ExportRecentLogsOptions,
): Promise<ExportRecentLogsResult> {
  const lfs = localFileSystemFrom(modules);
  if (!lfs) {
    return { ok: false, error: { message: 'UXP localFileSystem is unavailable.' } };
  }
  if (typeof lfs.getFileForSaving !== 'function') {
    return { ok: false, error: { message: 'UXP getFileForSaving is unavailable.' } };
  }

  const date = options?.date ?? toISODate(new Date());
  let records: LogRecord[];
  try {
    const sourceFile = await getLogFile(lfs, date);
    const text = await readFileText(sourceFile, lfs.formats?.utf8);
    records = decodeLogRecords(text);
  } catch (error) {
    return {
      ok: false,
      error: { message: errorMessage(error, `Failed to read logs for ${date} before export.`) },
    };
  }

  const safeRecords = records.map(sanitizeRecord);
  const suggestedName = options?.suggestedName ?? `imagen-ps-logs-${date}.jsonl`;

  try {
    const target = await lfs.getFileForSaving({ types: ['jsonl'], suggestedName });
    if (!target) {
      return { ok: false, error: { message: 'Export cancelled by user.' } };
    }
    await target.write(encodeLogRecords(safeRecords), { format: lfs.formats?.utf8 });
    const result: ExportRecentLogsSuccess = {
      ok: true,
      exportedCount: safeRecords.length,
      ...(target.nativePath !== undefined && target.nativePath.length > 0 ? { targetNativePath: target.nativePath } : {}),
    };
    return result;
  } catch (error) {
    return {
      ok: false,
      error: { message: errorMessage(error, 'Failed to write exported log file.') },
    };
  }
}
