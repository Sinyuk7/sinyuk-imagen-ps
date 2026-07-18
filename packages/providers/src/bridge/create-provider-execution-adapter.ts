import {
  assertNoSecrets,
  createImmutableSnapshot,
  createProviderError,
  createValidationError,
  type ErrorCategory,
  type ExecutionAdapter,
  type ExecutionContext,
  type JobError,
} from '@imagen-ps/core-engine';
import type { Logger } from '@imagen-ps/foundation';
import type { ProviderConfig } from '../contract/config.js';
import type { ProviderRequest } from '../contract/request.js';
import type { ProviderRegistry } from '../registry/provider-registry.js';

/** Provider execution bridge 的 stable adapter id。 */
export const PROVIDER_EXECUTION_ADAPTER_ID = 'provider';

/** Dispatch-time config resolution 使用的 non-secret lookup ref。 */
export interface ProviderExecutionConfigRef {
  /** Admission 已选择的 exact implementation id。 */
  readonly implementationId: string;

  /** 当前 credential/config owner 的 non-secret profile ref。 */
  readonly profileId: string;
}

/** 每次 dispatch 解析当前 Provider config/credential 的 narrow port。 */
export interface ProviderExecutionConfigResolver {
  /** 只在当前调用栈返回 resolved config；实现不得缓存或记录 secret values。 */
  resolve(ref: ProviderExecutionConfigRef): Promise<unknown>;
}

/** Dispatch-time request materialization 使用的 bounded input。 */
export interface ProviderExecutionRequestMaterializationInput extends ProviderExecutionConfigRef {
  /** Admission 已冻结、仅含 durable refs 的 canonical request。 */
  readonly request: ProviderRequest;
}

/** 每次 dispatch 把 durable request refs 解析为本次 invoke value 的 narrow port。 */
export interface ProviderExecutionRequestMaterializer {
  /**
   * 解析当前 request；返回值只存在于当前调用栈，不得缓存 bytes 或读取 Task/Session。
   */
  materialize(
    input: ProviderExecutionRequestMaterializationInput,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

/** Stable Provider ExecutionAdapter 的 composition dependencies。 */
export interface CreateProviderExecutionAdapterOptions {
  /** Exact implementation lookup registry。 */
  readonly providerRegistry: Pick<ProviderRegistry, 'get'>;

  /** Dispatch-time config/secret resolver。 */
  readonly configResolver: ProviderExecutionConfigResolver;

  /** Dispatch-time StoredAssetRef materializer。 */
  readonly requestMaterializer: ProviderExecutionRequestMaterializer;

  /** 可选默认 Logger；per-dispatch context 优先。 */
  readonly logger?: Logger;
}

interface ProviderExecutionParams {
  readonly implementationId: string;
  readonly profileId: string;
  readonly request: ProviderRequest;
}

const ERROR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'validation',
  'execution',
  'provider',
  'runtime',
  'workflow',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJobError(value: unknown): value is JobError {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.category === 'string'
    && ERROR_CATEGORIES.has(value.category as ErrorCategory)
    && typeof value.message === 'string'
  );
}

function safeErrorMessage(error: Error, fallback: string): string {
  try {
    assertNoSecrets(error.message);
    return error.message;
  } catch {
    return fallback;
  }
}

function mappedError(
  error: unknown,
  params: Pick<ProviderExecutionParams, 'implementationId' | 'profileId'>,
  defaultCategory: 'validation' | 'provider',
): JobError {
  if (isJobError(error)) {
    try {
      assertNoSecrets(error);
      return createImmutableSnapshot(error) as JobError;
    } catch {
      const message = defaultCategory === 'validation'
        ? 'Provider validation failed.'
        : 'Provider invocation failed.';
      return defaultCategory === 'validation'
        ? createValidationError(message, params)
        : createProviderError(message, params);
    }
  }

  const fallback = defaultCategory === 'validation'
    ? 'Provider validation failed.'
    : 'Provider invocation failed.';
  const message = error instanceof Error ? safeErrorMessage(error, fallback) : fallback;
  const details = {
    ...params,
    ...(error instanceof Error ? { name: error.name } : {}),
  };
  return defaultCategory === 'validation'
    ? createValidationError(message, details)
    : createProviderError(message, details);
}

function executionParams(params: Record<string, unknown>): ProviderExecutionParams {
  const allowed = new Set(['implementationId', 'profileId', 'request']);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) {
      throw createValidationError(`Provider execution params contain unsupported field "${key}".`, {
        path: `params.${key}`,
      });
    }
  }
  if (typeof params.implementationId !== 'string' || params.implementationId.trim().length === 0) {
    throw createValidationError('Provider execution requires implementationId.');
  }
  if (typeof params.profileId !== 'string' || params.profileId.trim().length === 0) {
    throw createValidationError('Provider execution requires profileId.', {
      implementationId: params.implementationId,
    });
  }
  if (!isRecord(params.request)) {
    throw createValidationError('Provider execution requires a request record.', {
      implementationId: params.implementationId,
      profileId: params.profileId,
    });
  }
  return params as unknown as ProviderExecutionParams;
}

/**
 * 创建 stable Provider `ExecutionAdapter`。
 *
 * Adapter 只按 admitted implementation id 做 exact lookup；config 每次 dispatch
 * 重新解析并只存在于当前调用栈，不捕获 resolved values。
 */
export function createProviderExecutionAdapter(
  options: CreateProviderExecutionAdapterOptions,
): ExecutionAdapter {
  const { providerRegistry, configResolver, requestMaterializer, logger } = options;

  return {
    adapter: PROVIDER_EXECUTION_ADAPTER_ID,

    async dispatch(rawParams: Record<string, unknown>, context?: ExecutionContext): Promise<unknown> {
      const params = executionParams(rawParams);
      const identity = {
        implementationId: params.implementationId,
        profileId: params.profileId,
      };
      const provider = providerRegistry.get(params.implementationId);
      if (!provider || provider.id !== params.implementationId) {
        throw createValidationError(`Provider implementation "${params.implementationId}" is not registered.`, identity);
      }

      let materializedRequest: unknown;
      try {
        materializedRequest = await requestMaterializer.materialize({
          ...identity,
          request: params.request,
        }, context?.signal);
      } catch (error) {
        throw mappedError(error, identity, 'validation');
      }

      let request: ProviderRequest;
      try {
        request = provider.validateRequest(materializedRequest);
      } catch (error) {
        throw mappedError(error, identity, 'validation');
      }

      let config: ProviderConfig;
      try {
        const resolvedConfig = await configResolver.resolve(identity);
        config = provider.validateConfig(resolvedConfig) as ProviderConfig;
      } catch (error) {
        throw mappedError(error, identity, 'validation');
      }

      let result: unknown;
      try {
        const effectiveLogger = context?.logger ?? logger;
        result = await provider.invoke({
          config,
          request,
          ...(context?.signal !== undefined ? { signal: context.signal } : {}),
          ...(effectiveLogger !== undefined ? { logger: effectiveLogger } : {}),
        });
      } catch (error) {
        throw mappedError(error, identity, 'provider');
      }

      try {
        assertNoSecrets(result);
        return createImmutableSnapshot(result);
      } catch {
        throw createProviderError('Provider returned an invalid result.', identity);
      }
    },
  };
}
