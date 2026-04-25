import type {
  ProviderDispatchAdapter,
  JobError,
} from '@imagen-ps/core-engine';
import {
  createProviderError,
  createValidationError,
} from '@imagen-ps/core-engine';
import type {
  ProviderDispatchBridgeArgs,
} from '../contract/provider.js';
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
  return (
    typeof candidate.category === 'string' &&
    typeof candidate.message === 'string'
  );
}

/**
 * 将 provider 层抛出的错误收敛为 `JobError`。
 */
function toJobError(
  error: unknown,
  providerId: string,
  defaultCategory: 'validation' | 'provider',
): JobError {
  if (isJobErrorLike(error)) {
    const candidate = error as JobError;
    if (candidate.category === defaultCategory) {
      return candidate;
    }

    const ctor =
      defaultCategory === 'validation' ? createValidationError : createProviderError;
    return ctor(candidate.message, {
      provider: providerId,
      originalCategory: candidate.category,
      ...(candidate.details ? { details: candidate.details } : {}),
    });
  }

  if (error instanceof Error) {
    const ctor =
      defaultCategory === 'validation' ? createValidationError : createProviderError;
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
function extractRequestAndSignal(
  params: Record<string, unknown>,
): {
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
