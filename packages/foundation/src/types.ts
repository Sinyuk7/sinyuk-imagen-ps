/**
 * 日志系统的纯类型定义。
 *
 * 所有类型均为可 JSON 序列化、host-agnostic。
 */

/** 日志级别。 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 日志来源表面。 */
export type LogSurface = 'uxp' | 'test' | 'unknown';

/** 产生日志的 workspace 包。 */
export type LogPackage = 'foundation' | 'application' | 'core-engine' | 'providers' | 'app';

/** 细分组件。 */
export type LogComponent =
  | 'runtime'
  | 'runner'
  | 'dispatch'
  | 'transport'
  | 'host'
  | 'sink'
  | 'session'
  | 'command'
  | 'provider';

/** span 结束状态。 */
export type LogStatus = 'start' | 'ok' | 'fail' | 'retry';

/** 结构化错误对象，专为日志记录收敛。 */
export interface LogError {
  /** 错误分类，如 validation / provider / runtime。 */
  readonly category?: string;

  /** 更具体的错误种类，如 auth_failed / rate_limited。 */
  readonly kind?: string;

  /** 人类可读消息。 */
  readonly message: string;

  /** 可选 HTTP 状态码。 */
  readonly statusCode?: number;

  /** 附加结构化上下文（会被红化）。 */
  readonly details?: Record<string, unknown>;
}

/** 统一日志记录主结构。 */
export interface LogRecord {
  /** 记录格式版本，当前固定为 1。 */
  readonly schema_version: 1;

  /** ISO 8601 时间戳。 */
  readonly timestamp: string;

  /** 日志级别。 */
  readonly level: LogLevel;

  /** 稳定事件名，机器优先。 */
  readonly event: string;

  /** 来源表面。 */
  readonly surface: LogSurface;

  /** 产生日志的 workspace 包。 */
  readonly package: LogPackage;

  /** 细分组件。 */
  readonly component: LogComponent;

  /** 顶层链路 ID。 */
  readonly trace_id: string;

  /** 当前操作 ID。 */
  readonly span_id: string;

  /** 上游操作 ID。 */
  readonly parent_span_id?: string;

  /** 关联 job ID。 */
  readonly job_id?: string;

  /** workflow 名称。 */
  readonly workflow?: string;

  /** provider 标识。 */
  readonly provider_id?: string;

  /** profile 标识。 */
  readonly profile_id?: string;

  /** 重试次数，从 1 开始。 */
  readonly attempt?: number;

  /** 当前 span 耗时（毫秒）。 */
  readonly duration_ms?: number;

  /** 结果状态。 */
  readonly status?: LogStatus;

  /** 结构化错误对象。 */
  readonly error?: LogError;

  /** 额外结构化上下文（已红化）。 */
  readonly attrs?: Record<string, unknown>;

  /** 可选源码位置（相对路径）。 */
  readonly source?: string;
}

/** 日志上下文，用于 child 合并与 span 传播。 */
export interface LogContext {
  readonly surface?: LogSurface;
  readonly package?: LogPackage;
  readonly component?: LogComponent;
  readonly trace_id?: string;
  readonly span_id?: string;
  readonly parent_span_id?: string;
  readonly job_id?: string;
  readonly workflow?: string;
  readonly provider_id?: string;
  readonly profile_id?: string;
}

/** 日志落盘适配器契约。 */
export interface LogSink {
  /** 写入一条记录。允许同步或异步。 */
  write(record: LogRecord): void | Promise<void>;
}

/** 日志 span 契约。 */
export interface LogSpan {
  /** 当前 span 的 span_id。 */
  readonly span_id: string;

  /** 所属 trace_id。 */
  readonly trace_id: string;

  /** 结束事件，状态为 ok。 */
  finish(attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 结束事件，状态为 fail。 */
  fail(error: unknown, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;
}

/** Logger 契约。 */
export interface Logger {
  /** 当前 logger 的只读上下文。 */
  readonly context: Readonly<LogContext>;

  /** 合并上下文并创建子 logger。 */
  child(context: LogContext): Logger;

  /** 发送一条日志记录。 */
  log(level: LogLevel, event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 发送 debug 级日志。 */
  debug(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 发送 info 级日志。 */
  info(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 发送 warn 级日志。 */
  warn(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 发送 error 级日志。 */
  error(event: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): void;

  /** 创建一个 span，自动发送 start 事件。 */
  startSpan(operation: string, attrs?: Record<string, unknown>, extra?: Partial<LogRecord>): LogSpan;
}
