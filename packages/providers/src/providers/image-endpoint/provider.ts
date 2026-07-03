import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderBalanceSnapshot } from '../../contract/billing.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import type { Logger } from '@imagen-ps/foundation';
import { imageEndpointDescriptor } from './descriptor.js';
import { imageEndpointConfigSchema, type ImageEndpointProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import {
  buildEditRequestBody,
  buildEditMultipartBody,
  buildRequestBody,
} from '../../transport/image-endpoint/build-request.js';
import { parseResponse } from '../../transport/image-endpoint/parse-response.js';
import { inspectModelsResponse } from '../../transport/image-endpoint/models.js';
import { listLocalCatalogModels } from '../../contract/image-model-capability.js';
import { fetchProviderBalanceJson, parseNewApiBalanceResponse } from '../../transport/billing/query-balance.js';

/** Provider 层可映射的结构化验证错误。 */
interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function hasInlineAssetData(asset: { readonly data?: unknown } | undefined): boolean {
  return (
    (typeof asset?.data === 'string' && asset.data.length > 0) ||
    (asset?.data instanceof Uint8Array && asset.data.byteLength > 0)
  );
}

function shouldUseMultipartEditBody(request: MockProviderRequest): boolean {
  if (request.operation !== 'image_edit') {
    return false;
  }
  return (request.images ?? []).some(hasInlineAssetData) || hasInlineAssetData(request.maskImage);
}

/**
 * 创建 image endpoint provider 实例。
 */
export function createImageEndpointProvider(): Provider<ImageEndpointProviderConfig, MockProviderRequest> {
  return {
    id: imageEndpointDescriptor.id,
    family: imageEndpointDescriptor.family,

    describe(): ProviderDescriptor {
      return imageEndpointDescriptor;
    },

    validateConfig(input: unknown): ImageEndpointProviderConfig {
      const result = imageEndpointConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Image endpoint provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    validateRequest(input: unknown): MockProviderRequest {
      // 复用 mock 的 request schema，因为 canonical request 形状相同
      const result = mockRequestSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Image endpoint provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(
      args: ProviderInvokeArgs<ImageEndpointProviderConfig, MockProviderRequest>,
    ): Promise<ProviderInvokeResult> {
      const { config, request, signal } = args;

      const endpoint =
        request.operation === 'text_to_image'
          ? '/v1/images/generations'
          : request.operation === 'image_edit'
            ? '/v1/images/edits'
            : undefined;

      if (endpoint === undefined) {
        throw createValidationError(`Unsupported image endpoint provider operation: "${request.operation}".`);
      }

      const body =
        request.operation === 'text_to_image'
          ? buildRequestBody(request, config.defaultModel)
          : shouldUseMultipartEditBody(request)
            ? buildEditMultipartBody(request, config.defaultModel)
            : buildEditRequestBody(request, config.defaultModel);

      // 付费生成请求：按 provider 能力解析保守重试策略与可选 idempotency key。
      const paidRetry = resolvePaidRetryConfig(imageEndpointDescriptor);
      const idempotencyHeader = resolveIdempotencyHeader(paidRetry, request as unknown as Record<string, unknown>);

      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        logger: args.logger,
        signal,
        retryPolicy: paidRetry.policy,
        retryOptions: { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        execute: async (candidate, candidateSignal) => httpRequest(
          {
            url: new URL(endpoint, candidate.url).toString(),
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.extraHeaders ?? {}),
              ...(idempotencyHeader ?? {}),
            },
            body,
            timeoutMs: config.timeoutMs,
          },
          { ...paidRetry.policy, maxRetries: 0 },
          candidateSignal,
          args.logger,
          { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        ),
      });

      const parsed = parseResponse(execution.value.response.data);

      // 契约：无值的可选字段 **省略**（不写 `undefined`），
      // 与 `ProviderInvokeResult` 的缺省字段约定对齐（见 contract/result.ts）。
      const result: {
        assets: readonly ProviderInvokeResult['assets'][number][];
        raw: unknown;
        diagnostics?: ProviderInvokeResult['diagnostics'];
        created?: number;
        usage?: ProviderInvokeResult['usage'];
        metadata?: ProviderInvokeResult['metadata'];
        execution?: ProviderInvokeResult['execution'];
      } = {
        assets: parsed.assets,
        raw: execution.value.response.data,
        execution: {
          selectedEndpointId: execution.selectedEndpointId,
          attempts: execution.attempts,
        },
      };
      const diagnostics = [...execution.diagnostics, ...execution.value.diagnostics];
      if (diagnostics.length > 0) {
        result.diagnostics = diagnostics;
      }
      if (parsed.created !== undefined) {
        result.created = parsed.created;
      }
      if (parsed.usage !== undefined) {
        result.usage = parsed.usage;
      }
      if (parsed.metadata !== undefined) {
        result.metadata = parsed.metadata;
      }
      return result;
    },

    async discoverModels(
      config: ImageEndpointProviderConfig,
      logger?: Logger,
    ): Promise<readonly ProviderModelInfo[]> {
      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        logger,
        retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
        retryOptions: { retryability: 'broad' },
        execute: async (candidate) => httpRequest(
          {
            url: new URL('/v1/models', candidate.url).toString(),
            method: 'GET',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.extraHeaders ?? {}),
            },
            timeoutMs: config.timeoutMs,
          },
          { maxRetries: 0, baseDelayMs: 0, factor: 1 },
          undefined,
          logger,
        ),
      });

      const inspected = inspectModelsResponse(execution.value.response.data);
      logger?.info('provider.image_endpoint.discover_models.analysis', {
        selectedEndpointId: execution.selectedEndpointId,
        rawCount: inspected.rawIds.length,
        rawIds: inspected.rawIds,
        catalogMatchedCount: inspected.catalogMatchedIds.length,
        catalogMatchedIds: inspected.catalogMatchedIds,
        reconciledCount: inspected.reconciledModels.length,
        reconciledIds: inspected.reconciledModels.map((model) => model.id),
      });

      if (inspected.reconciledModels.length > 0) {
        return inspected.reconciledModels;
      }

      const fallbackModels = listLocalCatalogModels('image-endpoint').map((model) => ({
        ...model,
        remotelyAvailable: false,
      }));
      logger?.info('provider.image_endpoint.discover_models.fallback_local_catalog', {
        selectedEndpointId: execution.selectedEndpointId,
        fallbackCount: fallbackModels.length,
        fallbackIds: fallbackModels.map((model) => model.id),
      });
      return fallbackModels;
    },

    async queryBalance(config: ImageEndpointProviderConfig, input): Promise<ProviderBalanceSnapshot> {
      const mode = config.billing?.mode ?? imageEndpointDescriptor.billing?.defaultMode;
      if (mode === undefined || mode === 'none') {
        throw createValidationError(`Provider implementation "${imageEndpointDescriptor.id}" does not support balance query for mode "none".`);
      }
      const endpoint = config.connection.endpoints.find((candidate) => candidate.enabled) ?? config.connection.endpoints[0];
      if (!endpoint) {
        throw createValidationError('Balance query requires at least one endpoint.');
      }
      if (mode === 'new-api') {
        const billing = config.billing;
        if (!billing || billing.mode !== 'new-api') {
          throw createValidationError('New API balance mode requires profile billing config.');
        }
        const json = await fetchProviderBalanceJson({
          url: new URL('/api/user/self', endpoint.url).toString(),
          headers: {
            Authorization: `Bearer ${billing.accessTokenSecretRef}`,
            'New-Api-User': billing.userId,
          },
          ...(input.signal ? { signal: input.signal } : {}),
        });
        return parseNewApiBalanceResponse(json);
      }
      throw createValidationError('Official balance query is not implemented for generic image-endpoint providers yet.');
    },
  };
}
