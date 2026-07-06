import type {
  Provider,
  ProviderDescriptor,
  ProviderEndpointMeasurement,
  ProviderEndpointMeasurementOptions,
  ProviderEndpointMeasurementResult,
  ProviderInvokeArgs,
  ProviderSafeProbeResult,
} from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { DiscoveredModel } from '../../contract/model.js';
import type { Logger } from '@imagen-ps/foundation';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { geminiGenerateContentConfigSchema, type GeminiGenerateContentProviderConfig } from './config-schema.js';
import { geminiGenerateContentDescriptor } from './descriptor.js';
import { probeEndpointReachability } from '../../transport/endpoint-probe.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import {
  buildGeminiGenerateContentRequest,
} from '../../transport/gemini-generate-content/build-request.js';
import { parseGeminiGenerateContentModelsResponse } from '../../transport/gemini-generate-content/models.js';
import { parseGeminiGenerateContentResponse } from '../../transport/gemini-generate-content/parse-response.js';
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

function buildAuthHeaders(config: GeminiGenerateContentProviderConfig): Readonly<Record<string, string>> {
  if (config.authMode === 'none') {
    return {};
  }
  return config.authMode === 'x-goog-api-key'
    ? { 'x-goog-api-key': config.apiKey ?? '' }
    : { Authorization: `Bearer ${config.apiKey ?? ''}` };
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

function recordField(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeGeminiProbeFailure(error: unknown): ProviderSafeProbeResult {
  const details = error as { readonly kind?: string; readonly statusCode?: number };
  const message = error instanceof Error ? error.message : 'Connection test failed.';
  const httpStatus = typeof details.statusCode === 'number' ? details.statusCode : undefined;
  switch (details.kind) {
    case 'auth_failed':
      return { status: 'failed', reason: 'auth_rejected', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    case 'network_error':
    case 'timeout':
      return { status: 'failed', reason: 'endpoint_unreachable', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    case 'rate_limited':
      return { status: 'partial', reason: 'service_rate_limited', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    case 'upstream_unavailable':
      return { status: 'partial', reason: 'service_unavailable', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    case 'request_invalid':
    case 'invalid_response':
      return { status: 'failed', reason: 'protocol_mismatch', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    case 'unknown_provider_error':
      if (httpStatus === 404 || httpStatus === 405 || httpStatus === 501) {
        return { status: 'partial', reason: 'safe_probe_unsupported', message, httpStatus };
      }
      if (httpStatus === 500 || httpStatus === 503 || httpStatus === 504) {
        return { status: 'partial', reason: 'service_unavailable', message, httpStatus };
      }
      return { status: 'failed', reason: 'unknown_failure', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
    default:
      return { status: 'failed', reason: 'unknown_failure', message, ...(httpStatus !== undefined ? { httpStatus } : {}) };
  }
}

function countTokensRequestBody(): Readonly<{
  readonly contents: readonly [{
    readonly role: 'user';
    readonly parts: readonly [{ readonly text: 'test' }];
  }];
}> {
  return {
    contents: [{
      role: 'user',
      parts: [{ text: 'test' }],
    }],
  };
}

export function createGeminiGenerateContentProvider(): Provider<GeminiGenerateContentProviderConfig, MockProviderRequest> {
  return {
    id: geminiGenerateContentDescriptor.id,
    family: geminiGenerateContentDescriptor.family,

    describe(): ProviderDescriptor {
      return geminiGenerateContentDescriptor;
    },

    validateConfig(input: unknown): GeminiGenerateContentProviderConfig {
      const result = geminiGenerateContentConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Gemini Generate Content provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
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
          `Gemini Generate Content provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(args: ProviderInvokeArgs<GeminiGenerateContentProviderConfig, MockProviderRequest>): Promise<ProviderInvokeResult> {
      const { config, request, signal, logger } = args;
      const providerLogger = logger?.child({
        package: 'providers',
        component: 'provider',
        provider_id: geminiGenerateContentDescriptor.id,
      });
      const builtRequest = buildGeminiGenerateContentRequest({ request });
      const imageConfig = recordField(builtRequest.body.generationConfig.imageConfig);
      for (const diagnostic of builtRequest.diagnostics) {
        providerLogger?.warn('provider.gemini_generate_content.request_option_ignored', {
          diagnosticCode: diagnostic.code,
          model: builtRequest.model,
          wireRevision: builtRequest.wireRevision,
          ...(diagnostic.details ?? {}),
        });
      }
      providerLogger?.info('provider.gemini_generate_content.request_summary', {
        operation: request.operation,
        model: builtRequest.model,
        wireRevision: builtRequest.wireRevision,
        endpointCount: config.connection.endpoints.filter((candidate) => candidate.enabled).length,
        inputImageCount: request.images?.length ?? 0,
        hasMaskImage: request.maskImage !== undefined,
        requestedOutputFormat: request.output?.outputFormat,
        requestedSizePreset: request.output?.sizePreset,
        requestedAspectRatio: request.output?.aspectRatio,
        wireImageConfigSize: stringField(imageConfig?.imageSize),
        wireImageConfigAspectRatio: stringField(imageConfig?.aspectRatio),
      });
      const path = config.paths.invokeTemplate.replace('{model}', encodeURIComponent(builtRequest.model));

      const paidRetry = resolvePaidRetryConfig(geminiGenerateContentDescriptor);
      const idempotencyHeader = resolveIdempotencyHeader(paidRetry, request as unknown as Record<string, unknown>);

      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        signal,
        retryPolicy: paidRetry.policy,
        retryOptions: { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
        execute: async (candidate, candidateSignal) => httpRequest(
          {
            url: assembleApiUrl(candidate.url, path),
            method: 'POST',
            headers: {
              ...buildAuthHeaders(config),
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

      const parsed = parseGeminiGenerateContentResponse(execution.value.response.data);
      const diagnostics = [
        ...builtRequest.diagnostics,
        ...execution.diagnostics,
        ...execution.value.diagnostics,
        ...(parsed.diagnostics ?? []),
      ];
      providerLogger?.info('provider.gemini_generate_content.response_summary', {
        model: builtRequest.model,
        wireRevision: builtRequest.wireRevision,
        selectedEndpointId: execution.selectedEndpointId,
        assetCount: parsed.assets.length,
        assetMimeTypes: parsed.assets.map((asset) => asset.mimeType ?? 'unknown'),
        assetNames: parsed.assets.map((asset) => asset.name ?? 'unnamed'),
        textPresent: parsed.text !== undefined,
        usageInputTokens: parsed.usage?.inputTokens,
        usageOutputTokens: parsed.usage?.outputTokens,
        usageTotalTokens: parsed.usage?.totalTokens,
        diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
      });

      return {
        assets: parsed.assets,
        ...(parsed.text !== undefined ? { text: parsed.text } : {}),
        raw: parsed.raw,
        ...(parsed.usage !== undefined ? { usage: parsed.usage } : {}),
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
        execution: {
          selectedEndpointId: execution.selectedEndpointId,
          attempts: execution.attempts,
        },
      };
    },

    async discoverModels(
      config: GeminiGenerateContentProviderConfig,
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
              ...buildAuthHeaders(config),
              ...(config.extraHeaders ?? {}),
            },
            timeoutMs: config.timeoutMs,
          },
          { maxRetries: 0, baseDelayMs: 0, factor: 1 },
          undefined,
          logger,
        ),
      });
      const parsed = parseGeminiGenerateContentModelsResponse(execution.value.response.data);
      if (parsed.sourceFormat === 'openai-like-fallback') {
        logger?.warn('provider.gemini_generate_content.discover_models.non_native_payload', {
          selectedEndpointId: execution.selectedEndpointId,
          targetPath: '/models',
        });
      }
      logger?.info('provider.gemini_generate_content.discover_models.summary', {
        selectedEndpointId: execution.selectedEndpointId,
        targetPath: '/models',
        sourceFormat: parsed.sourceFormat,
        parsedModelCount: parsed.models.length,
        returnedModelCount: parsed.models.length,
        modelIds: parsed.models.map((model) => model.id),
      });
      return parsed.models;
    },

    async measureEndpoints(
      config: GeminiGenerateContentProviderConfig,
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

    async safeProbe(
      config: GeminiGenerateContentProviderConfig,
      context,
      logger?: Logger,
    ): Promise<ProviderSafeProbeResult> {
      const modelId = context.modelId?.trim() ?? config.defaultModel?.trim();
      if (!modelId) {
        return {
          status: 'failed',
          reason: 'model_id_required',
          message: 'Model ID is required for Gemini safe connection verification.',
        };
      }

      try {
        const path = `/models/${encodeURIComponent(modelId)}:countTokens`;
        await executeWithEndpointFailover({
          connection: config.connection,
          logger,
          retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
          retryOptions: { retryability: 'broad' },
          execute: async (candidate) => httpRequest(
            {
              url: assembleApiUrl(candidate.url, path),
              method: 'POST',
              headers: {
                ...buildAuthHeaders(config),
                ...(config.extraHeaders ?? {}),
              },
              body: countTokensRequestBody(),
              timeoutMs: config.timeoutMs,
            },
            { maxRetries: 0, baseDelayMs: 0, factor: 1 },
            undefined,
            logger,
          ),
        });
        return {
          status: 'verified',
          reason: 'verified',
          message: 'Connection verified without generation.',
        };
      } catch (error) {
        return normalizeGeminiProbeFailure(error);
      }
    },
  };
}
