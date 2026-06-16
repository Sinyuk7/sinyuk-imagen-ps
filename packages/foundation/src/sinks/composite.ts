/**
 * 复合 sink：将同一条记录写入多个 sink。
 */

import type { LogRecord, LogSink } from '../types.js';

/** 创建复合 sink，用于同时落盘 + console mirror 等场景。 */
export function createCompositeSink(sinks: readonly LogSink[]): LogSink {
  return {
    write(record: LogRecord): void {
      for (const sink of sinks) {
        try {
          const result = sink.write(record);
          if (result instanceof Promise) {
            result.catch(() => {
              // 复合 sink 对子 sink 失败保持 fail-open，不影响其他 sink。
            });
          }
        } catch {
          // 同步写失败时继续下一个 sink。
        }
      }
    },
  };
}
