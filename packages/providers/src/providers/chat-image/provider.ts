import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderBalanceSnapshot } from '../../contract/billing.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { chatImageConfigSchema, type ChatImageProviderConfig } from './config-schema.js';
import { chatImageDescriptor } from './descriptor.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import { resolveChatImageWireCodec } from '../../transport/chat-image/request-codec.js';
import type { ParsedChatImageResponse } from '../../transport/chat-image/parse-response.js';
import { parseChatImageModelsResponse } from '../../transport/chat-image/models.js';
import { listLocalCatalogModels } from '../../contract/image-model-capability.js';
import { fetchProviderBalanceJson, parseNewApiBalanceResponse } from '../../transport/billing/query-balance.js';

interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function endpointUrl(endpointRoot: string, path: string): string {
  return new URL(path.replace(/^\//, ''), endpointRoot.endsWith('/') ? endpointRoot : `${endpointRoot}/`).toString();
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
      const builtRequest = requestCodec.buildRequest(request, { defaultModel: config.defaultModel });
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
            url: endpointUrl(candidate.url, builtRequest.path),
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

    async discoverModels(config: ChatImageProviderConfig): Promise<readonly ProviderModelInfo[]> {
      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
        retryOptions: { retryability: 'broad' },
        execute: async (candidate) => httpRequest(
          {
            url: endpointUrl(candidate.url, 'models'),
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

      const discovered = parseChatImageModelsResponse(execution.value.response.data);
      return discovered.length > 0 ? discovered : listLocalCatalogModels('chat-image').map((model) => ({
        ...model,
        remotelyAvailable: false,
      }));
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
          url: endpointUrl(endpoint.url, '/api/user/self'),
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
