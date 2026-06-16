/**
 * 统一错误模型与分类。
 *
 * 本文件所有类型均为 serializable 且 host-agnostic。
 * `JobError` 使用纯对象而非继承 `Error` class，以确保跨序列化边界时结构稳定。
 */

/** 错误分类 —— string literal union，序列化后自描述。 */
export type ErrorCategory =
  | 'validation'
  | 'provider'
  | 'runtime'
  | 'workflow'
  | 'unknown';

/** 具有明确分类的可序列化错误对象。 */
export interface JobError {
  /** 错误所属分类域。 */
  readonly category: ErrorCategory;

  /** 人类可读的错误描述。 */
  readonly message: string;

  /** 可选的附加上下文数据（如 stepName、providerName 等）。 */
  readonly details?: Record<string, unknown>;
}

/**
 * 构造一个 `category` 为 `'validation'` 的 `JobError`。
 */
export function createValidationError(
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return Object.freeze({ category: 'validation', message, details });
}

/**
 * 构造一个 `category` 为 `'provider'` 的 `JobError`。
 */
export function createProviderError(
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return Object.freeze({ category: 'provider', message, details });
}

/**
 * 构造一个 `category` 为 `'runtime'` 的 `JobError`。
 */
export function createRuntimeError(
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return Object.freeze({ category: 'runtime', message, details });
}

/**
 * 构造一个 `category` 为 `'workflow'` 的 `JobError`。
 */
export function createWorkflowError(
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return Object.freeze({ category: 'workflow', message, details });
}

/**
 * 构造一个 `category` 为 `'unknown'` 的 `JobError`。
 */
export function createUnknownError(
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return Object.freeze({ category: 'unknown', message, details });
}
