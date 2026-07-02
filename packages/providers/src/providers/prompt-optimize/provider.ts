import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { promptOptimizeConfigSchema, type PromptOptimizeProviderConfig } from './config-schema.js';
import { promptOptimizeDescriptor } from './descriptor.js';
import { buildPromptOptimizeRequestBody } from './build-request.js';
import { parsePromptOptimizeModelsResponse } from './models.js';
import { promptOptimizeRequestSchema, type PromptOptimizeRequest } from './request-schema.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { executeWithEndpointFailover } from '../../transport/image-endpoint/failover.js';

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

export function createPromptOptimizeProvider(): Provider<PromptOptimizeProviderConfig, PromptOptimizeRequest> {
  return {
    id: promptOptimizeDescriptor.id,
    family: promptOptimizeDescriptor.family,

    describe(): ProviderDescriptor {
      return promptOptimizeDescriptor;
    },

    validateConfig(input: unknown): PromptOptimizeProviderConfig {
      const result = promptOptimizeConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Prompt optimize provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    validateRequest(input: unknown): PromptOptimizeRequest {
      const result = promptOptimizeRequestSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Prompt optimize provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(args: ProviderInvokeArgs<PromptOptimizeProviderConfig, PromptOptimizeRequest>): Promise<ProviderInvokeResult> {
      const { config, request, signal } = args;
      const body = buildPromptOptimizeRequestBody(request, config);

      const execution = await executeWithEndpointFailover({
        connection: config.connection,
        signal,
        retryPolicy: { maxRetries: 0, baseDelayMs: 0, factor: 1 },
        retryOptions: { retryability: 'broad' },
        execute: async (candidate, candidateSignal) => httpRequest(
          {
            url: endpointUrl(candidate.url, 'chat/completions'),
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.extraHeaders ?? {}),
            },
            body,
            timeoutMs: config.timeoutMs,
          },
          { maxRetries: 0, baseDelayMs: 0, factor: 1 },
          candidateSignal,
          undefined,
        ),
      });

      return {
        assets: [],
        raw: execution.value.response.data,
        execution: {
          selectedEndpointId: execution.selectedEndpointId,
          attempts: execution.attempts,
        },
        ...(execution.diagnostics.length > 0 || execution.value.diagnostics.length > 0
          ? { diagnostics: [...execution.diagnostics, ...execution.value.diagnostics] }
          : {}),
      };
    },

    async discoverModels(config: PromptOptimizeProviderConfig): Promise<readonly ProviderModelInfo[]> {
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

      return parsePromptOptimizeModelsResponse(execution.value.response.data);
    },
  };
}
