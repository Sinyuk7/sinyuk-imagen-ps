/**
 * CLI 文件系统日志 sink。
 *
 * 符合 foundation LogSink 契约：
 * - 默认落盘到用户主目录下的 `~/.imagen-ps/logs`
 * - 可通过 `IMAGEN_LOG_DIR` 或选项覆盖
 * - 日志以 JSONL 形式按天分文件，不污染 stdout/stderr
 * - 写失败时 fail-open，不影响命令主流程
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeLogRecord } from '@imagen-ps/foundation';
import type { LogRecord, LogSink } from '@imagen-ps/foundation';

export interface FileLogSinkOptions {
  /** 明确日志目录。优先级高于环境变量。 */
  readonly logDir?: string;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 创建一个基于本地文件系统的 JSONL sink。 */
export function createFileLogSink(options?: FileLogSinkOptions): LogSink {
  const baseDir = options?.logDir ?? process.env.IMAGEN_LOG_DIR ?? path.join(os.homedir(), '.imagen-ps', 'logs');

  return {
    write(record: LogRecord): void {
      try {
        const dateDir = path.join(baseDir, toISODate(new Date(record.timestamp)));
        ensureDir(dateDir);
        const filePath = path.join(dateDir, 'imagen.jsonl');
        fs.appendFileSync(filePath, encodeLogRecord(record) + '\n', 'utf8');
      } catch {
        // fail-open：日志写失败不应影响主业务
      }
    },
  };
}
