import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { geminiGenerateContentConfigSchema, type GeminiGenerateContentProviderConfig } from './config-schema.js';
import { geminiGenerateContentDescriptor } from './descriptor.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import {
  buildGeminiGenerateContentRequest,
} from '../../transport/gemini-generate-content/build-request.js';
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
      const { config, request, signal } = args;
      const builtRequest = buildGeminiGenerateContentRequest({
        request,
        defaultModel: config.defaultModel,
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
          args.logger,
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
  };
}
