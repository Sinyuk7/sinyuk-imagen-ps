/**
 * JSONL / NDJSON 编码与解码辅助函数。
 *
 * 每行一条记录，禁止 pretty print 作为默认落盘格式。
 */

import type { LogRecord } from './types.js';

/** 将单条记录编码为 JSON 字符串（不含换行）。 */
export function encodeLogRecord(record: LogRecord): string {
  return JSON.stringify(record);
}

/** 将多条记录编码为 JSONL 字符串。 */
export function encodeLogRecords(records: readonly LogRecord[]): string {
  return records.map(encodeLogRecord).join('\n');
}

/** 将 JSONL 文本解码为记录数组，忽略空行。 */
export function decodeLogRecords(text: string): LogRecord[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LogRecord);
}
