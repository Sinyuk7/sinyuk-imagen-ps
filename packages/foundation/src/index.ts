/**
 * @imagen-ps/foundation
 *
 * 低层共享基础能力。
 *
 * 当前包含统一日志模型、红化、JSONL 编码与可插拔的 Logger 实现。
 */

// 类型
export type {
  LogContext,
  LogRecord,
  LogSink,
  LogSpan,
  Logger,
  LogLevel,
  LogSurface,
  LogPackage,
  LogComponent,
  LogStatus,
  LogError,
} from './types.js';

// Schema 常量与辅助函数
export {
  SCHEMA_VERSION,
  LOG_LEVELS,
  LOG_STATUSES,
  LOG_SURFACES,
  LOG_PACKAGES,
  LOG_COMPONENTS,
  isLogLevel,
  isLogStatus,
  isLogSurface,
  isLogPackage,
  isLogComponent,
} from './schema.js';

// ID 生成
export { generateTraceId, generateSpanId } from './id.js';

// 红化
export { redactAttrs, redactValue, redactErrorDetails } from './redaction.js';

// JSONL
export { encodeLogRecord, encodeLogRecords, decodeLogRecords } from './jsonl.js';

// Logger
export { createLogger, createNullLogger, toLogError } from './logger.js';
export type { CreateLoggerOptions } from './logger.js';

// Sinks
export {
  createCompositeSink,
  createConsoleSink,
  createMemorySink,
  createNullSink,
  type ConsoleLike,
} from './sinks/index.js';
