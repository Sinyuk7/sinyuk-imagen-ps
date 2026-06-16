/**
 * 内存 sink：专供测试 harness 使用。
 */

import type { LogRecord, LogSink } from '../types.js';

/** 创建一个同步内存 sink，可通过 records 读取写入的记录。 */
export function createMemorySink(): LogSink & { readonly records: readonly LogRecord[]; clear(): void } {
  const records: LogRecord[] = [];

  return {
    write(record: LogRecord): void {
      records.push(record);
    },

    get records(): readonly LogRecord[] {
      return records;
    },

    clear(): void {
      records.length = 0;
    },
  };
}
