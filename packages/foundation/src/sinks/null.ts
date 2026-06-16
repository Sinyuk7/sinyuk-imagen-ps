/**
 * 空 sink：什么都不写，什么都不报错。
 */

import type { LogRecord, LogSink } from '../types.js';

/** 什么都不做的 sink。 */
export function createNullSink(): LogSink {
  return {
    write(_record: LogRecord): void {
      // no-op
    },
  };
}
