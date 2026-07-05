import type {
  ImageEditCodec,
  Provider,
  ProviderConnectionTestResult,
  ProviderDescriptor,
  ProviderEndpointMeasurement,
  ProviderEndpointMeasurementOptions,
  ProviderEndpointMeasurementResult,
  ProviderInvokeArgs,
} from '../../contract/provider.js';
import type { ProviderBalanceSnapshot } from '../../contract/billing.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { DiscoveredModel } from '../../contract/model.js';
import type { Logger } from '@imagen-ps/foundation';
import { imageEndpointDescriptor } from './descriptor.js';
import { imageEndpointConfigSchema, type ImageEndpointProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { probeEndpointReachability } from '../../transport/endpoint-probe.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import {
  createAttemptLedger,
  deriveDispatchBudget,
  executeAttemptPlan,
  executeWithEndpointFailover,
  resolveAttemptPlan,
} from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import {
  buildImageEditHttpRequest,
  buildRequestBody,
} from '../../transport/image-endpoint/build-request.js';
import { parseResponse } from '../../transport/image-endpoint/parse-response.js';
import { inspectModelsResponse } from '../../transport/image-endpoint/models.js';
import {
  fetchProviderBalanceJson,
  parseNewApiBalanceResponse,
  resolveRootBillingUrl,
} from '../../transport/billing/query-balance.js';
import {
  evictIfMatches,
  isImageEditCodecCompatible,
  rememberSuccessfulImageEditCodec,
  resolveImageEditCodec,
} from '../../transport/image-endpoint/wire-compatibility.js';
import { providerConnectionAllowsFailover } from '../../contract/config.js';
import { assembleApiUrl } from '../../contract/api-format.js';

/** Provider 层可映射的结构化验证错误。 */
interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

type MockImageAsset = NonNullable<MockProviderRequest['images']>[number];

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function summarizeAssetReferenceKind(asset: MockImageAsset | MockProviderRequest['maskImage']): string {
  if (asset === undefined) {
    return 'missing';
  }
  if (typeof asset.data === 'string' || asset.data instanceof Uint8Array) {
    return 'inline-data';
  }
  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    return 'fileId';
  }
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return 'url';
  }
  if (asset.storedRef !== undefined) {
    return `storedRef:${asset.storedRef.kind}`;
  }
  return 'unknown';
}

function logEditRequestSummary(
  logger: Logger | undefined,
  request: MockProviderRequest,
  resolvedCodec: {
    readonly codec: { readonly id: string };
    readonly source: string;
    readonly cacheKey: string;
  },
  defaultModel: string | undefined,
): void {
  if (request.operation !== 'image_edit') {
    return;
  }

  logger?.info('provider.image_endpoint.edit_request_summary', {
    codec: resolvedCodec.codec.id,
    source: resolvedCodec.source,
    compatibilityKey: resolvedCodec.cacheKey,
    model:
      typeof request.providerOptions?.model === 'string'
        ? (request.providerOptions.model as string)
        : (defaultModel ?? 'gpt-image-2'),
    imageCount: request.images?.length ?? 0,
    imageReferenceKinds: (request.images ?? []).map((asset) => summarizeAssetReferenceKind(asset)),
    maskReferenceKind: summarizeAssetReferenceKind(request.maskImage),
    hasProviderOptions: request.providerOptions !== undefined,
  });
}

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function classifyMeasurementFailure(message: string): ProviderEndpointMeasurement['failureKind'] {
  const lower = message.toLowerCase();
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('dns')) {
    return 'dns';
  }
  return 'connect';
}

function normalizeMeasurementFailure(
  endpointId: string,
  latencyMs: number,
  error: unknown,
): ProviderEndpointMeasurement {
  const details = error as { readonly kind?: string; readonly statusCode?: number; readonly message?: string };
  const message = error instanceof Error ? error.message : 'Endpoint measurement failed.';
  const checkedAt = Date.now();
  const httpStatus = typeof details.statusCode === 'number' ? details.statusCode : undefined;
  switch (details.kind) {
    case 'auth_failed':
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: 'auth', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'rate_limited':
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: 'rate-limit', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'invalid_response':
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: 'invalid-response', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'timeout':
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: 'timeout', errorMessage: message };
    case 'network_error':
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: classifyMeasurementFailure(message), errorMessage: message };
    default:
      return { endpointId, checkedAt, reachable: false, latencyMs, failureKind: 'unknown', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
  }
}

function normalizeDiscoveredModelsResponse(
  payload: unknown,
  endpointId: string,
  logger?: Logger,
): readonly DiscoveredModel[] {
  const inspected = inspectModelsResponse(payload);
  logger?.info('provider.image_endpoint.discover_models.analysis', {
    endpointId,
    rawCount: inspected.rawIds.length,
    rawIds: inspected.rawIds,
    discoveredCount: inspected.models.length,
    discoveredIds: inspected.models.map((model) => model.id),
  });

  return inspected.models;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>,
): Promise<readonly TOutput[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!);
    }
  }));
  return results;
}

function compatibleImageEditCodecs(request: MockProviderRequest): readonly ImageEditCodec[] {
  const declaredOrder = imageEndpointDescriptor.transport?.wire?.defaultEditCodecOrder ?? [];
  return declaredOrder.filter((codec) => isImageEditCodecCompatible(request, codec));
}

function logEditCodecFallbackDecision(
  logger: Logger | undefined,
  args: {
    readonly initialCodec: ImageEditCodec;
    readonly fallbackCodec: ImageEditCodec;
    readonly fallbackReason: string;
    readonly fallbackAttemptCount: number;
    readonly fallbackDisabledBecauseMultipleEndpoints: boolean;
    readonly statusCode?: number;
  },
): void {
  logger?.warn('provider.image_endpoint.edit_codec_fallback', args);
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
          ? config.paths.generation
          : request.operation === 'image_edit'
            ? config.paths.edit
            : undefined;

      if (endpoint === undefined) {
        throw createValidationError(`Unsupported image endpoint provider operation: "${request.operation}".`);
      }

      const resolvedEditCodec =
        request.operation === 'image_edit'
          ? resolveImageEditCodec({
              descriptor: imageEndpointDescriptor,
              config,
              request,
              targetPath: endpoint,
            })
          : undefined;

      if (resolvedEditCodec !== undefined) {
        logEditRequestSummary(args.logger, request, resolvedEditCodec, config.defaultModel);
      }

      const body =
        request.operation === 'text_to_image'
          ? buildRequestBody(request, config.defaultModel)
          : undefined;

      // 付费生成请求：按 provider 能力解析保守重试策略与可选 idempotency key。
      const paidRetry = resolvePaidRetryConfig(imageEndpointDescriptor);
      const idempotencyHeader = resolveIdempotencyHeader(paidRetry, request as unknown as Record<string, unknown>);

      const executeRequest = async (requestBody: unknown) => executeWithEndpointFailover({
        connection: config.connection,
        logger: args.logger,
        signal,
        retryPolicy: paidRetry.policy,
        retryOptions: { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        execute: async (candidate, candidateSignal) => httpRequest(
          {
            url: assembleApiUrl(candidate.url, endpoint),
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.extraHeaders ?? {}),
              ...(idempotencyHeader ?? {}),
            },
            body: requestBody,
            timeoutMs: config.timeoutMs,
          },
          { ...paidRetry.policy, maxRetries: 0 },
          candidateSignal,
          args.logger,
          { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        ),
      });

      let execution;
      let parsed;
      let successfulEditCodec = resolvedEditCodec?.codec;
      let requestDiagnostics: ProviderInvokeResult['diagnostics'] = [];

      if (request.operation === 'text_to_image') {
        execution = await executeRequest(body);
        parsed = parseResponse(execution.value.response.data);
      } else {
        const endpoints = config.connection.endpoints.filter((endpointConfig) => endpointConfig.enabled);
        const codecs = compatibleImageEditCodecs(request);
        const plan = resolveAttemptPlan({
          endpoints,
          failoverEnabled: providerConnectionAllowsFailover(config.connection),
          compatibleCodecs: codecs,
        });
        const budget = deriveDispatchBudget(plan, paidRetry.policy);
        const ledger = createAttemptLedger(budget);
        execution = await executeAttemptPlan({
          plan,
          budget,
          ledger,
          capability: {
            idempotencySupported: paidRetry.idempotencySupported,
            idempotencyScope: paidRetry.idempotencySupported ? 'shared-domain' : 'unknown',
          },
          retryPolicy: paidRetry.policy,
          logger: args.logger,
          execute: async (candidate) => {
            successfulEditCodec = resolvedEditCodec?.codec.id === candidate.codecId
              ? resolvedEditCodec.codec
              : successfulEditCodec;
            const endpointConfig = endpoints.find((entry) => entry.id === candidate.endpointId);
            if (!endpointConfig) {
              throw createValidationError(`Unknown endpoint candidate: "${candidate.endpointId}".`);
            }
            const builtRequest = buildImageEditHttpRequest(request, candidate.codecId, config.defaultModel);
            successfulEditCodec = builtRequest.codec;
            requestDiagnostics = builtRequest.diagnostics;
            const response = await httpRequest(
              {
                url: assembleApiUrl(endpointConfig.url, endpoint),
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  ...(config.extraHeaders ?? {}),
                  ...(idempotencyHeader ?? {}),
                  ...(builtRequest.headers ?? {}),
                },
                body: builtRequest.body,
                timeoutMs: config.timeoutMs,
              },
              paidRetry.policy,
              signal,
              args.logger,
              {
                retryability: 'paid',
                idempotencySupported: paidRetry.idempotencySupported,
                initialAttemptKind: candidate.reason,
                attemptLedger: ledger,
              },
            );
            return response;
          },
        });
        if (plan.mode === 'codec-fallback' && successfulEditCodec?.id !== resolvedEditCodec?.codec.id) {
          if (resolvedEditCodec?.source === 'cache') {
            evictIfMatches(resolvedEditCodec.cacheKey, resolvedEditCodec.codec.id);
          }
          logEditCodecFallbackDecision(args.logger, {
            initialCodec: resolvedEditCodec!.codec.id,
            fallbackCodec: successfulEditCodec!.id,
            fallbackReason: 'http_415',
            fallbackAttemptCount: 1,
            fallbackDisabledBecauseMultipleEndpoints: false,
          });
        }
        parsed = parseResponse(execution.value.response.data);
      }

      if (resolvedEditCodec !== undefined && successfulEditCodec !== undefined) {
        rememberSuccessfulImageEditCodec(resolvedEditCodec.cacheKey, successfulEditCodec.id);
      }

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
      const diagnostics = [...requestDiagnostics, ...execution.diagnostics, ...execution.value.diagnostics];
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
    ): Promise<readonly DiscoveredModel[]> {
      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        logger,
        retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
        retryOptions: { retryability: 'broad' },
        execute: async (candidate) => httpRequest(
          {
            url: assembleApiUrl(candidate.url, '/models'),
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
      return normalizeDiscoveredModelsResponse(execution.value.response.data, execution.selectedEndpointId, logger);
    },

    async measureEndpoints(
      config: ImageEndpointProviderConfig,
      options: ProviderEndpointMeasurementOptions = {},
    ): Promise<ProviderEndpointMeasurementResult> {
      const endpoints = config.connection.endpoints.filter((endpoint) => endpoint.enabled);
      const results = await mapWithConcurrency(
        endpoints,
        options.maxConcurrency ?? 3,
        async (endpoint): Promise<ProviderEndpointMeasurement> => {
          const startedAt = perfNow();
          try {
            const response = await probeEndpointReachability(endpoint, {
              signal: options.signal,
              timeoutMs: options.timeoutMs ?? config.timeoutMs,
            });
            return {
              endpointId: endpoint.id,
              checkedAt: Date.now(),
              reachable: true,
              latencyMs: Math.max(0, Math.round(perfNow() - startedAt)),
              httpStatus: response.status,
            };
          } catch (error) {
            return normalizeMeasurementFailure(endpoint.id, Math.max(0, Math.round(perfNow() - startedAt)), error);
          }
        },
      );
      return { supported: true, results };
    },

    async testConnection(
      config: ImageEndpointProviderConfig,
      logger?: Logger,
    ): Promise<ProviderConnectionTestResult> {
      try {
        const models = await this.discoverModels!(config, logger);
        return {
          supported: true,
          reachable: true,
          modelCount: models.length,
          models,
        };
      } catch (error) {
        return {
          supported: true,
          reachable: false,
          message: error instanceof Error ? error.message : 'Connection test failed.',
        };
      }
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
          url: resolveRootBillingUrl(endpoint.url, '/api/user/self'),
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
