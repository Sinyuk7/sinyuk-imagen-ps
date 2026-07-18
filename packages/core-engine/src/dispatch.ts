/**
 * Backend-neutral execution dispatch 边界实现。
 *
 * 本文件只负责 adapter 查找、边界校验与错误映射；不解释 params 语义。
 */

import { createExecutionError, createValidationError } from './errors.js';
import { assertNoSecrets, createImmutableSnapshot } from './invariants.js';
import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionDispatcher,
  ExecutionRef,
} from './types/execution.js';
import type { ErrorCategory, JobError } from './errors.js';
import type { Logger } from '@imagen-ps/foundation';
import { createNullLogger } from '@imagen-ps/foundation';

const ERROR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'validation',
  'execution',
  'provider',
  'runtime',
  'workflow',
  'unknown',
]);

function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<JobError>;
  return (
    typeof candidate.category === 'string' &&
    ERROR_CATEGORIES.has(candidate.category as ErrorCategory) &&
    typeof candidate.message === 'string'
  );
}

function normalizeStructuredError(error: JobError, adapter: string): JobError {
  try {
    assertNoSecrets(error);
    return createImmutableSnapshot(error) as JobError;
  } catch {
    return createExecutionError('Execution adapter threw an invalid structured error.', { adapter });
  }
}

function toExecutionError(error: unknown, adapter: string): JobError {
  if (isJobError(error)) {
    return normalizeStructuredError(error, adapter);
  }

  if (error instanceof Error) {
    return createExecutionError('Execution adapter failed.', { adapter, name: error.name });
  }

  return createExecutionError('Execution adapter failed.', { adapter });
}

function normalizeExecutionRef(ref: ExecutionRef): ExecutionRef {
  if (typeof ref !== 'object' || ref === null) {
    throw createValidationError('ExecutionRef must be an object.');
  }

  const adapter = ref.adapter;
  if (typeof adapter !== 'string' || adapter.trim().length === 0) {
    throw createValidationError('ExecutionRef.adapter must be a non-empty string.');
  }

  const params = ref.params;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw createValidationError('ExecutionRef.params must be a record.', { adapter });
  }

  assertNoSecrets(params);
  const paramsSnapshot = createImmutableSnapshot(params) as Record<string, unknown>;
  return Object.freeze({ adapter, params: paramsSnapshot });
}

/**
 * 创建最小 `ExecutionDispatcher`。
 *
 * @param adapters - stable adapter id 到 adapter 的静态映射
 * @param logger - 可选 Logger
 */
export function createExecutionDispatcher(
  adapters: readonly ExecutionAdapter[] = [],
  logger?: Logger,
): ExecutionDispatcher {
  const adapterMap = new Map<string, ExecutionAdapter>();
  const dispatcherLogger = logger ?? createNullLogger();

  for (const adapter of adapters) {
    if (typeof adapter !== 'object' || adapter === null) {
      throw createValidationError('ExecutionAdapter must be an object.');
    }
    if (typeof adapter.adapter !== 'string' || adapter.adapter.trim().length === 0) {
      throw createValidationError('ExecutionAdapter.adapter must be a non-empty string.');
    }
    if (typeof adapter.dispatch !== 'function') {
      throw createValidationError(`ExecutionAdapter "${adapter.adapter}" must define dispatch().`, {
        adapter: adapter.adapter,
      });
    }

    if (adapterMap.has(adapter.adapter)) {
      throw createValidationError(`ExecutionAdapter "${adapter.adapter}" is already registered.`, {
        adapter: adapter.adapter,
      });
    }

    adapterMap.set(adapter.adapter, adapter);
  }

  return {
    async dispatch(ref: ExecutionRef, context?: ExecutionContext): Promise<unknown> {
      const normalizedRef = normalizeExecutionRef(ref);
      const adapter = adapterMap.get(normalizedRef.adapter);
      if (!adapter) {
        throw createValidationError(`No execution adapter registered for "${normalizedRef.adapter}".`, {
          adapter: normalizedRef.adapter,
        });
      }

      const dispatchLogger = (context?.logger ?? dispatcherLogger).child({
        package: 'core-engine',
        component: 'dispatch',
      });
      const span = dispatchLogger.startSpan('dispatch.execution', { adapter: normalizedRef.adapter });

      let result: unknown;
      try {
        result = await adapter.dispatch(normalizedRef.params, context);
      } catch (error) {
        const mapped = toExecutionError(error, normalizedRef.adapter);
        span.fail(mapped);
        throw mapped;
      }

      try {
        assertNoSecrets(result);
        const snapshot = createImmutableSnapshot(result);
        span.finish();
        return snapshot;
      } catch {
        const mapped = createExecutionError('Execution adapter returned an invalid output.', {
          adapter: normalizedRef.adapter,
        });
        span.fail(mapped);
        throw mapped;
      }
    },
  };
}

/** 通过抽象 dispatcher 执行一次 backend-neutral dispatch。 */
export async function dispatchExecution(
  dispatcher: ExecutionDispatcher,
  ref: ExecutionRef,
  context?: ExecutionContext,
): Promise<unknown> {
  return dispatcher.dispatch(ref, context);
}
