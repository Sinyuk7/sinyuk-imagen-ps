/**
 * Logger 核心实现。
 *
 * 职责：
 * 1. 组装上下文
 * 2. 生成记录
 * 3. 红化
 * 4. 交给 sink
 *
 * 所有 host 差异都留在 sink / adapter 层。
 */

import { SCHEMA_VERSION } from './schema.js';
import type { LogContext, LogLevel, Logger, LogRecord, LogSink, LogSpan } from './types.js';
import { generateSpanId, generateTraceId } from './id.js';
import { redactAttrs, redactErrorDetails, redactValue } from './redaction.js';

/** Logger 创建选项。 */
export interface CreateLoggerOptions {
  /** 日志落盘适配器。 */
  readonly sink: LogSink;

  /** 默认上下文。 */
  readonly context?: LogContext;

  /** 显式指定 trace_id；省略时自动生成。 */
  readonly traceId?: string;

  /** 时间戳生成函数，默认 new Date().toISOString()。 */
  readonly now?: () => string;

  /** sink 写失败时的降级 sink，默认为 null sink。 */
  readonly fallbackSink?: LogSink;
}

/** 从任意错误值构造 LogError。 */
function toLogError(error: unknown): LogRecord['error'] {
  if (error === undefined || error === null) {
    return undefined;
  }

  if (typeof error === 'string') {
    return { message: redactErrorMessage(error) };
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : String(error);
    const errorObj: Record<string, unknown> = {
      message: redactErrorMessage(message),
    };

    if (typeof record.category === 'string') {
      errorObj.category = record.category;
    }
    if (typeof record.kind === 'string') {
      errorObj.kind = record.kind;
    }
    if (typeof record.statusCode === 'number') {
      errorObj.statusCode = record.statusCode;
    }
    if (record.details !== undefined && record.details !== null && typeof record.details === 'object') {
      errorObj.details = redactErrorDetails(record.details as Record<string, unknown>);
    }

    return redactLogError(errorObj) as unknown as LogRecord['error'];
  }

  return { message: redactErrorMessage(String(error)) };
}

/** 红化错误消息，避免 secret 或本机路径从 Error.message 进入日志。 */
function redactErrorMessage(message: string): string {
  const redacted = redactValue(message);
  return typeof redacted === 'string' ? redacted : '[REDACTED]';
}

/** 红化日志错误对象。 */
function redactLogError(error: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...error };
  if (typeof next.message === 'string') {
    next.message = redactErrorMessage(next.message);
  } else if (next.message !== undefined) {
    const redacted = redactValue(next.message);
    next.message = typeof redacted === 'string' ? redacted : '[REDACTED]';
  }
  if (next.details !== undefined && next.details !== null && typeof next.details === 'object') {
    next.details = redactErrorDetails(next.details as Record<string, unknown>);
  }
  return next;
}

/** 合并两个上下文。 */
function mergeContext(parent: LogContext, child: LogContext): LogContext {
  return {
    ...parent,
    ...child,
  };
}

class LoggerImpl implements Logger {
  readonly context: Readonly<LogContext>;
  private readonly sink: LogSink;
  private readonly fallbackSink: LogSink;
  private readonly now: () => string;

  constructor(context: LogContext, sink: LogSink, fallbackSink: LogSink, now: () => string) {
    this.context = { ...context };
    this.sink = sink;
    this.fallbackSink = fallbackSink;
    this.now = now;
  }

  child(context: LogContext): Logger {
    return new LoggerImpl(mergeContext(this.context, context), this.sink, this.fallbackSink, this.now);
  }

  log(level: LogLevel, event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
    const ctx = this.context;
    const timestamp = this.now();

    const record: LogRecord = {
      schema_version: SCHEMA_VERSION,
      timestamp,
      level,
      event,
      surface: ctx.surface ?? 'unknown',
      package: ctx.package ?? 'foundation',
      component: ctx.component ?? 'sink',
      trace_id: ctx.trace_id ?? 'unknown',
      span_id: ctx.span_id ?? generateSpanId(),
      ...(ctx.parent_span_id !== undefined ? { parent_span_id: ctx.parent_span_id } : {}),
      ...(ctx.job_id !== undefined ? { job_id: ctx.job_id } : {}),
      ...(ctx.workflow !== undefined ? { workflow: ctx.workflow } : {}),
      ...(ctx.provider_id !== undefined ? { provider_id: ctx.provider_id } : {}),
      ...(ctx.profile_id !== undefined ? { profile_id: ctx.profile_id } : {}),
      ...(attrs !== undefined ? { attrs: redactAttrs(attrs) } : {}),
      ...extra,
    };

    // 对 error 和 attrs 做最后红化处理：error.details 可能被 extra 覆盖。
    const finalRecord = this.redactRecord(record);

    try {
      const result = this.sink.write(finalRecord);
      if (result instanceof Promise) {
        result.catch(() => {
          this.writeFallback(finalRecord);
        });
      }
    } catch {
      this.writeFallback(finalRecord);
    }
  }

  private redactRecord(record: LogRecord): LogRecord {
    const next: Record<string, unknown> = { ...record };

    if (next.attrs !== undefined) {
      next.attrs = redactAttrs(next.attrs as Record<string, unknown>);
    }
    if (next.error !== undefined && next.error !== null && typeof next.error === 'object') {
      next.error = redactLogError(next.error as Record<string, unknown>);
    }

    return next as unknown as LogRecord;
  }

  private writeFallback(record: LogRecord): void {
    try {
      const result = this.fallbackSink.write(record);
      if (result instanceof Promise) {
        result.catch(() => {
          // 降级也失败时静默丢弃，保持 fail-open。
        });
      }
    } catch {
      // 静默丢弃
    }
  }

  debug(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
    this.log('debug', event, attrs, extra);
  }

  info(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
    this.log('info', event, attrs, extra);
  }

  warn(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
    this.log('warn', event, attrs, extra);
  }

  error(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
    this.log('error', event, attrs, extra);
  }

  startSpan(operation: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): LogSpan {
    const spanId = generateSpanId();
    const startTime = Date.now();
    const childLogger = this.child({
      span_id: spanId,
      parent_span_id: this.context.span_id,
    });

    childLogger.info(`${operation}.start`, attrs, { status: 'start', ...extra });

    return {
      span_id: spanId,
      trace_id: childLogger.context.trace_id ?? 'unknown',

      finish(attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
        childLogger.info(`${operation}.ok`, attrs, {
          status: 'ok',
          duration_ms: Date.now() - startTime,
          ...extra,
        });
      },

      fail(error: unknown, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void {
        childLogger.error(`${operation}.fail`, attrs, {
          status: 'fail',
          duration_ms: Date.now() - startTime,
          error: toLogError(error),
          ...extra,
        });
      },
    };
  }
}

/** 创建一个 Logger 实例。 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const traceId = options.traceId ?? options.context?.trace_id ?? generateTraceId();
  const context: LogContext = {
    surface: options.context?.surface ?? 'unknown',
    package: options.context?.package ?? 'foundation',
    component: options.context?.component ?? 'sink',
    trace_id: traceId,
    ...(options.context?.span_id !== undefined ? { span_id: options.context.span_id } : {}),
    ...(options.context?.parent_span_id !== undefined ? { parent_span_id: options.context.parent_span_id } : {}),
    ...(options.context?.job_id !== undefined ? { job_id: options.context.job_id } : {}),
    ...(options.context?.workflow !== undefined ? { workflow: options.context.workflow } : {}),
    ...(options.context?.provider_id !== undefined ? { provider_id: options.context.provider_id } : {}),
    ...(options.context?.profile_id !== undefined ? { profile_id: options.context.profile_id } : {}),
  };

  return new LoggerImpl(context, options.sink, options.fallbackSink ?? { write: () => {} }, options.now ?? (() => new Date().toISOString()));
}

/** 创建一个什么都不写的 null logger。 */
export function createNullLogger(): Logger {
  return createLogger({ sink: { write: () => {} } });
}

/** 将 unknown 错误转换为 LogError（供其他包使用）。 */
export { toLogError };
