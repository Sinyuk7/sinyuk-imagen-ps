/**
 * Provider dispatch 边界实现。
 *
 * 本文件只负责 adapter 查找、边界校验与错误映射；
 * 不理解 provider 参数语义，也不触碰 transport 细节。
 */

import { createProviderError, createValidationError } from './errors.js';
import { assertImmutable, assertSerializable } from './invariants.js';
import type { ProviderDispatchAdapter, ProviderDispatcher, ProviderRef } from './types/provider.js';
import type { JobError } from './errors.js';

// ------------------------------------------------------------------
// 判断 unknown 是否已是 `JobError`
// ------------------------------------------------------------------

function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<JobError>;
  return typeof candidate.category === 'string' && typeof candidate.message === 'string';
}

// ------------------------------------------------------------------
// 错误映射
// ------------------------------------------------------------------

/**
 * 将任意 thrown value 收敛为 `JobError`。
 */
function toDispatchError(error: unknown, provider: string): JobError {
  if (isJobError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createProviderError(error.message, {
      provider,
      name: error.name,
    });
  }

  return createProviderError('Provider dispatch failed.', {
    provider,
    cause: String(error),
  });
}

// ------------------------------------------------------------------
// Deep freeze helper（dispatch 边界需要比 assertImmutable 更强的保证）
// ------------------------------------------------------------------

/**
 * 递归冻结对象或数组的所有层级。
 *
 * 与 `assertImmutable` 的浅 freeze 不同，本函数确保嵌套结构也完全不可变。
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // typed array / DataView 不能 freeze（V8 抛出 "Cannot freeze array buffer
  // views with elements"）。它们在边界语义上等同于不可分解的二进制载荷，
  // 直接透传即可——dispatch 边界的 immutability 承诺不覆盖 buffer 内容。
  if (ArrayBuffer.isView(value)) {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return value;
}

// ------------------------------------------------------------------
// ProviderRef 校验与隔离
// ------------------------------------------------------------------

/**
 * 创建与调用方隔离的 immutable `ProviderRef`。
 */
function normalizeProviderRef(ref: ProviderRef): ProviderRef {
  const provider = ref.provider;

  if (typeof provider !== 'string' || provider.trim().length === 0) {
    throw createValidationError('ProviderRef.provider must be a non-empty string.', {
      provider,
    });
  }

  assertSerializable(ref.params);

  return assertImmutable({
    provider,
    params: { ...ref.params },
  }) as ProviderRef;
}

/**
 * 创建最小 ProviderDispatcher。
 *
 * @param adapters - provider id 到 adapter 的静态映射
 */
export function createProviderDispatcher(adapters: readonly ProviderDispatchAdapter[] = []): ProviderDispatcher {
  const adapterMap = new Map<string, ProviderDispatchAdapter>();

  for (const adapter of adapters) {
    if (adapter.provider.trim().length === 0) {
      throw createValidationError('ProviderDispatchAdapter.provider must not be empty.');
    }

    if (adapterMap.has(adapter.provider)) {
      throw createValidationError(`ProviderDispatchAdapter "${adapter.provider}" is already registered.`, {
        provider: adapter.provider,
      });
    }

    adapterMap.set(adapter.provider, adapter);
  }

  return {
    async dispatch(ref: ProviderRef): Promise<unknown> {
      const normalizedRef = normalizeProviderRef(ref);
      const adapter = adapterMap.get(normalizedRef.provider);
      if (!adapter) {
        throw createProviderError(`No provider adapter registered for "${normalizedRef.provider}".`, {
          provider: normalizedRef.provider,
        });
      }

      try {
        const result = await adapter.dispatch(normalizedRef.params);
        assertSerializable(result);
        if (typeof result === 'object' && result !== null) {
          // 先做浅拷贝切断与 adapter 内部状态的引用，再递归 freeze
          const snapshot = Array.isArray(result) ? [...result] : { ...(result as Record<string, unknown>) };
          return deepFreeze(snapshot);
        }
        return result;
      } catch (error) {
        throw toDispatchError(error, normalizedRef.provider);
      }
    },
  };
}

/**
 * 通过抽象 dispatcher 执行一次 provider 调用。
 */
export async function dispatchProvider(dispatcher: ProviderDispatcher, ref: ProviderRef): Promise<unknown> {
  return dispatcher.dispatch(ref);
}
