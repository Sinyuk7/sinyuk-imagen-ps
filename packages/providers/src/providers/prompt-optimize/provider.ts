import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { promptOptimizeConfigSchema, type PromptOptimizeProviderConfig } from './config-schema.js';
import { promptOptimizeDescriptor } from './descriptor.js';
import { buildPromptOptimizeRequestBody } from './build-request.js';
import { parsePromptOptimizeModelsResponse } from './models.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';

interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function endpointUrl(baseURL: string, path: string): string {
  return new URL(path.replace(/^\//, ''), baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString();
}

export function createPromptOptimizeProvider(): Provider<PromptOptimizeProviderConfig, MockProviderRequest> {
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

    validateRequest(input: unknown): MockProviderRequest {
      const result = mockRequestSchema.safeParse(input);
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

    async invoke(args: ProviderInvokeArgs<PromptOptimizeProviderConfig, MockProviderRequest>): Promise<ProviderInvokeResult> {
      const { config, request, signal } = args;
      const url = endpointUrl(config.baseURL, 'chat/completions');
      const body = buildPromptOptimizeRequestBody(request, config);

      const response = await httpRequest(
        {
          url,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            ...(config.extraHeaders ?? {}),
          },
          body,
          timeoutMs: config.timeoutMs,
        },
        undefined,
        signal,
        undefined,
      );

      return {
        assets: [],
        raw: response.response.data,
      };
    },

    async discoverModels(config: PromptOptimizeProviderConfig): Promise<readonly ProviderModelInfo[]> {
      const url = endpointUrl(config.baseURL, 'models');
      const response = await httpRequest(
        {
          url,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            ...(config.extraHeaders ?? {}),
          },
          timeoutMs: config.timeoutMs,
        },
        undefined,
        undefined,
      );

      return parsePromptOptimizeModelsResponse(response.response.data);
    },
  };
}
