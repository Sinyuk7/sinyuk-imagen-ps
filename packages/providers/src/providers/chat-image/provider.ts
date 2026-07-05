import type {
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
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { chatImageConfigSchema, type ChatImageProviderConfig } from './config-schema.js';
import { chatImageDescriptor } from './descriptor.js';
import { probeEndpointReachability } from '../../transport/endpoint-probe.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import { resolveChatImageWireCodec } from '../../transport/chat-image/request-codec.js';
import type { ParsedChatImageResponse } from '../../transport/chat-image/parse-response.js';
import { parseChatImageModelsResponse } from '../../transport/chat-image/models.js';
import {
  fetchProviderBalanceJson,
  parseNewApiBalanceResponse,
  resolveRootBillingUrl,
} from '../../transport/billing/query-balance.js';
import { assembleApiUrl } from '../../contract/api-format.js';

interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function expectedMimeTypeForOutputFormat(outputFormat: string | undefined): string | undefined {
  if (outputFormat === 'png') {
    return 'image/png';
  }
  if (outputFormat === 'jpeg') {
    return 'image/jpeg';
  }
  if (outputFormat === 'webp') {
    return 'image/webp';
  }
  return undefined;
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
  const details = error as { readonly kind?: string; readonly statusCode?: number };
  const message = error instanceof Error ? error.message : 'Endpoint measurement failed.';
  const httpStatus = typeof details.statusCode === 'number' ? details.statusCode : undefined;
  switch (details.kind) {
    case 'auth_failed':
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: 'auth', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'rate_limited':
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: 'rate-limit', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'invalid_response':
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: 'invalid-response', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
    case 'timeout':
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: 'timeout', errorMessage: message };
    case 'network_error':
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: classifyMeasurementFailure(message), errorMessage: message };
    default:
      return { endpointId, checkedAt: Date.now(), reachable: false, latencyMs, failureKind: 'unknown', ...(httpStatus !== undefined ? { httpStatus } : {}), errorMessage: message };
  }
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

export function createChatImageProvider(): Provider<ChatImageProviderConfig, MockProviderRequest> {
  return {
    id: chatImageDescriptor.id,
    family: chatImageDescriptor.family,

    describe(): ProviderDescriptor {
      return chatImageDescriptor;
    },

    validateConfig(input: unknown): ChatImageProviderConfig {
      const result = chatImageConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Chat image provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    validateRequest(input: unknown): MockProviderRequest {
      const result = mockRequestSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Chat image provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(args: ProviderInvokeArgs<ChatImageProviderConfig, MockProviderRequest>): Promise<ProviderInvokeResult> {
      const { config, request, signal, logger } = args;
      const providerLogger = logger?.child({
        package: 'providers',
        component: 'provider',
        provider_id: chatImageDescriptor.id,
      });
      const requestCodec = resolveChatImageWireCodec(chatImageDescriptor);
      const builtRequest = requestCodec.buildRequest(request, {});
      const { body } = builtRequest;
      const imageConfig = recordField(body.image_config);
      const requestedOutputFormat = stringField(request.output?.outputFormat);
      for (const diagnostic of builtRequest.diagnostics ?? []) {
        providerLogger?.warn('provider.chat_image.request_option_ignored', {
          requestCodec: requestCodec.id,
          diagnosticCode: diagnostic.code,
          ...(diagnostic.details ?? {}),
        });
      }
      providerLogger?.info('provider.chat_image.request_summary', {
        requestCodec: requestCodec.id,
        operation: request.operation,
        model: body.model,
        endpointCount: config.connection.endpoints.filter((candidate) => candidate.enabled).length,
        inputImageCount: request.images?.length ?? 0,
        hasMaskImage: request.maskImage !== undefined,
        requestedOutputFormat,
        requestedSizePreset: request.output?.sizePreset,
        requestedAspectRatio: request.output?.aspectRatio,
        wireImageConfigOutputFormat: stringField(imageConfig?.output_format),
        wireImageConfigSize: stringField(imageConfig?.size),
        wireImageConfigAspectRatio: stringField(imageConfig?.aspect_ratio),
      });

      // 付费生成请求：按 provider 能力解析保守重试策略与可选 idempotency key。
      const paidRetry = resolvePaidRetryConfig(chatImageDescriptor);
      const idempotencyHeader = resolveIdempotencyHeader(paidRetry, request as unknown as Record<string, unknown>);

      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        signal,
        retryPolicy: paidRetry.policy,
        retryOptions: { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        execute: async (candidate, candidateSignal) => httpRequest(
          {
            url: assembleApiUrl(candidate.url, config.paths.invoke),
            method: builtRequest.method,
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.extraHeaders ?? {}),
              ...(idempotencyHeader ?? {}),
            },
            body: builtRequest.body,
            timeoutMs: config.timeoutMs,
          },
          { ...paidRetry.policy, maxRetries: 0 },
          candidateSignal,
          providerLogger,
          { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        ),
      });

      let parsed: ParsedChatImageResponse;
      try {
        parsed = requestCodec.parseExecutionResponse(execution.value.response.data);
      } catch (error) {
        providerLogger?.error('provider.chat_image.response_parse_fail', {
          requestCodec: requestCodec.id,
          model: body.model,
          requestedOutputFormat,
          selectedEndpointId: execution.selectedEndpointId,
        }, { error: error as Error });
        throw error;
      }

      providerLogger?.info('provider.chat_image.response_summary', {
        requestCodec: requestCodec.id,
        model: body.model,
        selectedEndpointId: execution.selectedEndpointId,
        assetCount: parsed.assets.length,
        assetMimeTypes: parsed.assetSummaries?.map((item) => item.mimeType ?? 'unknown') ?? [],
        assetNames: parsed.assetSummaries?.map((item) => item.name ?? 'unnamed') ?? [],
        assetSources: parsed.assetSummaries?.map((item) => item.source) ?? [],
        assetReferenceKinds: parsed.assetSummaries?.map((item) => item.referenceKind) ?? [],
      });
      const expectedMimeType = expectedMimeTypeForOutputFormat(requestedOutputFormat);
      const actualMimeTypes = parsed.assetSummaries?.map((item) => item.mimeType).filter((item): item is string => item !== undefined) ?? [];
      if (
        expectedMimeType !== undefined &&
        actualMimeTypes.length > 0 &&
        actualMimeTypes.some((mimeType) => mimeType !== expectedMimeType)
      ) {
        providerLogger?.warn('provider.chat_image.response_format_mismatch', {
          requestCodec: requestCodec.id,
          model: body.model,
          requestedOutputFormat,
          expectedMimeType,
          actualMimeTypes,
          assetNames: parsed.assetSummaries?.map((item) => item.name ?? 'unnamed') ?? [],
          assetSources: parsed.assetSummaries?.map((item) => item.source) ?? [],
          selectedEndpointId: execution.selectedEndpointId,
        });
      }

      const result: {
        assets: readonly ProviderInvokeResult['assets'][number][];
        text?: string;
        raw: unknown;
        diagnostics?: ProviderInvokeResult['diagnostics'];
        created?: number;
        usage?: ProviderInvokeResult['usage'];
        execution?: ProviderInvokeResult['execution'];
      } = {
        assets: parsed.assets,
        raw: parsed.raw,
        execution: {
          selectedEndpointId: execution.selectedEndpointId,
          attempts: execution.attempts,
        },
      };
      const diagnostics = [
        ...(builtRequest.diagnostics ?? []),
        ...execution.diagnostics,
        ...execution.value.diagnostics,
        ...(parsed.diagnostics ?? []),
      ];
      if (diagnostics.length > 0) {
        result.diagnostics = diagnostics;
      }
      if (parsed.text !== undefined) {
        result.text = parsed.text;
      }
      if (parsed.created !== undefined) {
        result.created = parsed.created;
      }
      if (parsed.usage !== undefined) {
        result.usage = parsed.usage;
      }
      return result;
    },

    async discoverModels(config: ChatImageProviderConfig): Promise<readonly DiscoveredModel[]> {
      const execution = await executeWithEndpointFailover({
        connection: config.connection,
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
          undefined,
        ),
      });
      return parseChatImageModelsResponse(execution.value.response.data);
    },

    async measureEndpoints(
      config: ChatImageProviderConfig,
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
      config: ChatImageProviderConfig,
    ): Promise<ProviderConnectionTestResult> {
      try {
        const models = await this.discoverModels!(config);
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

    async queryBalance(config: ChatImageProviderConfig, input): Promise<ProviderBalanceSnapshot> {
      const mode = config.billing?.mode ?? chatImageDescriptor.billing?.defaultMode;
      if (mode === undefined || mode === 'none') {
        throw createValidationError(`Provider implementation "${chatImageDescriptor.id}" does not support balance query for mode "none".`);
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
      throw createValidationError('Official balance query is not implemented for generic chat-image providers yet.');
    },
  };
}
