/**
 * UXP data-folder JSONL 日志 sink。
 *
 * 使用 UXP `localFileSystem.getDataFolder()` 作为持久化根目录，
 * 不写入 plugin 目录，不依赖任何私有 API。
 * 同时建议与 console sink 组合，作为即时观察面。
 */

import {
  SCHEMA_VERSION,
  encodeLogRecord,
  generateSpanId,
  generateTraceId,
  redactAttrs,
} from '@imagen-ps/foundation';
import { createConsoleSink, createLogger, toLogError } from '@imagen-ps/foundation';
import type { LogLevel, LogRecord, LogSink } from '@imagen-ps/foundation';
import { resolveUxpModules } from './uxp-api.js';
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

export interface UxpFlightRecorder {
  checkpoint(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): Promise<void>;
  fail(event: string, error: unknown, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_UI_FLIGHT_RECORDER__: UxpFlightRecorder | undefined;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__: boolean | undefined;
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

/** 创建可等待落盘的 UXP flight recorder checkpoint 写入器。 */
export function createUxpFlightRecorder(uxpModules: UxpModules): UxpFlightRecorder {
  const storage = (uxpModules.uxp?.storage ?? {}) as UxpStorage;
  if (!storage.localFileSystem) {
    return {
      checkpoint: async () => undefined,
      fail: async () => undefined,
    };
  }

  const sink = createUxpLogSink(uxpModules);
  const traceId = generateTraceId();

  async function write(
    level: LogLevel,
    event: string,
    attrs?: Record<string, unknown>,
    extra?: Partial<LogRecord>,
  ): Promise<void> {
    const record: LogRecord = {
      schema_version: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      level,
      event,
      surface: 'uxp',
      package: 'app',
      component: 'host',
      trace_id: traceId,
      span_id: generateSpanId(),
      ...(attrs !== undefined ? { attrs: redactAttrs(attrs) } : {}),
      ...extra,
    };

    try {
      await sink.write(record);
    } catch {
      // Flight recorder 不能改变真实 host 路径行为；sink 自身已通过 console-only logger 记录失败。
    }
  }

  return {
    checkpoint(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): Promise<void> {
      return write('info', event, attrs, extra);
    },
    fail(event: string, error: unknown, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): Promise<void> {
      return write('error', event, attrs, { status: 'fail', error: toLogError(error), ...extra });
    },
  };
}

let uiFlightRecorder: UxpFlightRecorder | undefined;

function getUiFlightRecorder(): UxpFlightRecorder {
  if (globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__) {
    return globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
  }
  if (!uiFlightRecorder) {
    uiFlightRecorder = createUxpFlightRecorder(resolveUxpModules());
  }
  return uiFlightRecorder;
}

/** 写入 UI/React 路径的可等待 checkpoint。 */
export async function writeUxpUiCheckpoint(
  event: string,
  attrs?: Record<string, unknown>,
  extra?: Partial<LogRecord>,
): Promise<void> {
  if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__ === true) {
    return;
  }
  await getUiFlightRecorder().checkpoint(event, attrs, extra);
}

/** 写入 UI/React 路径失败 checkpoint。 */
export async function writeUxpUiFailure(
  event: string,
  error: unknown,
  attrs?: Record<string, unknown>,
  extra?: Partial<LogRecord>,
): Promise<void> {
  if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__ === true) {
    return;
  }
  await getUiFlightRecorder().fail(event, error, attrs, extra);
}
