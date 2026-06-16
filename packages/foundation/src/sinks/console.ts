/**
 * Console mirror sink：通过传入的 console-like 对象打印 JSONL 记录。
 *
 * 本 sink 不依赖任何 host API：由调用方传入具体的 console 实现。
 */

import { encodeLogRecord } from '../jsonl.js';
import type { LogRecord, LogSink } from '../types.js';

/** console-like 最小契约。 */
export interface ConsoleLike {
  log(message: string): void;
}

/** 创建 console mirror sink。 */
export function createConsoleSink(consoleLike: ConsoleLike): LogSink {
  return {
    write(record: LogRecord): void {
      consoleLike.log(encodeLogRecord(record));
    },
  };
}
