import type { ProviderDispatchAdapter, JobError } from '@imagen-ps/core-engine';
import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import type { ProviderDispatchBridgeArgs } from '../contract/provider.js';
import type { ProviderConfig } from '../contract/config.js';
import type { CanonicalImageJobRequest } from '../contract/request.js';

/**
 * 判断 unknown 是否已携带可被 engine 消费的 `JobError` 结构。
 */
function isJobErrorLike(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Partial<JobError>;
  return typeof candidate.category === 'string' && typeof candidate.message === 'string';
}

/**
 * 将 provider 层抛出的错误收敛为 `JobError`。
 *
 * 分类策略（保留上游显式 category，不做强制覆写）：
 * - 若 error 已是结构化 `JobError`（携带显式 `category`），则**无条件**保留其原始
 *   category，仅在缺失 `provider` 字段时补齐。例如 provider 在 `invoke` 阶段对
 *   request 抛出 validation 错误，应当以 `category: 'validation'` 透传，而不是
 *   被 catch 块所在阶段的 `defaultCategory: 'provider'` 覆盖（修复 OI-4）。
 * - 若 error 是普通 `Error` 或其他 thrown value，沿用 `defaultCategory` 做推断。
 *
 * `defaultCategory` 因此仅作为"无显式分类信息时的回退"，不再是"强制分类"。
 */
function toJobError(error: unknown, providerId: string, defaultCategory: 'validation' | 'provider'): JobError {
  if (isJobErrorLike(error)) {
    const candidate = error as JobError;
    // 上游已显式给出 category，原样保留；仅在 details.provider 缺失时补齐
    if (candidate.details && typeof candidate.details === 'object' && 'provider' in candidate.details) {
      return candidate;
    }

    const ctor =
      candidate.category === 'validation'
        ? createValidationError
        : candidate.category === 'provider'
          ? createProviderError
          : // 其它 category（如 workflow / runtime）不应在 bridge 层被改写，原样返回
            null;

    if (ctor === null) {
      return candidate;
    }

    return ctor(candidate.message, {
      provider: providerId,
      ...(candidate.details ? { details: candidate.details } : {}),
    });
  }

  if (error instanceof Error) {
    const ctor = defaultCategory === 'validation' ? createValidationError : createProviderError;
    return ctor(error.message, {
      provider: providerId,
      name: error.name,
      ...(typeof (error as { details?: Record<string, unknown> }).details === 'object' &&
      (error as { details?: Record<string, unknown> }).details !== null
        ? { details: (error as { details?: Record<string, unknown> }).details }
        : {}),
    });
  }

  return createProviderError('Provider dispatch failed.', {
    provider: providerId,
    cause: String(error),
  });
}

/**
 * 从 engine 传入的 opaque params 中提取 request payload 与可选 signal。
 */
function extractRequestAndSignal(params: Record<string, unknown>): {
  request: unknown;
  signal?: AbortSignal;
} {
  const { signal, ...rest } = params;

  if ('request' in params) {
    return {
      request: params.request,
      signal: signal instanceof AbortSignal ? signal : undefined,
    };
  }

  // 若 params 没有显式 `request` 键，将整个 params（排除 signal）视为 request
  return {
    request: rest,
    signal: signal instanceof AbortSignal ? signal : undefined,
  };
}

/**
 * 创建 `ProviderDispatchAdapter`，将 `Provider` 实例收敛为 engine 可消费的 dispatch 面。
 */
export function createDispatchAdapter<
  TConfig extends ProviderConfig = ProviderConfig,
  TRequest extends CanonicalImageJobRequest = CanonicalImageJobRequest,
>(args: ProviderDispatchBridgeArgs<TConfig, TRequest>): ProviderDispatchAdapter {
  const { provider, config } = args;

  return {
    provider: provider.id,

    async dispatch(params: Record<string, unknown>): Promise<unknown> {
      const { request: rawRequest, signal } = extractRequestAndSignal(params);

      // 1. 校验 request
      let validatedRequest: TRequest;
      try {
        validatedRequest = provider.validateRequest(rawRequest);
      } catch (error) {
        throw toJobError(error, provider.id, 'validation');
      }

      // 2. 调用 provider
      try {
        const result = await provider.invoke({
          config,
          request: validatedRequest,
          signal,
        });
        return result;
      } catch (error) {
        throw toJobError(error, provider.id, 'provider');
      }
    },
  };
}
