import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { chatImageConfigSchema, type ChatImageProviderConfig } from './config-schema.js';
import { chatImageDescriptor } from './descriptor.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import { resolvePaidRetryConfig, resolveIdempotencyHeader } from '../../transport/image-endpoint/paid-retry.js';
import { buildChatImageRequestBody } from '../../transport/chat-image/build-request.js';
import { parseChatImageResponse } from '../../transport/chat-image/parse-response.js';
import { parseChatImageModelsResponse } from '../../transport/chat-image/models.js';

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
      const { config, request, signal } = args;
      const url = endpointUrl(config.baseURL, 'chat/completions');
      const body = buildChatImageRequestBody(request, config.defaultModel);

      // 付费生成请求：按 provider 能力解析保守重试策略与可选 idempotency key。
      const paidRetry = resolvePaidRetryConfig(chatImageDescriptor);
      const idempotencyHeader = resolveIdempotencyHeader(paidRetry, request as unknown as Record<string, unknown>);

      const response = await httpRequest(
        {
          url,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            ...(config.extraHeaders ?? {}),
            ...(idempotencyHeader ?? {}),
          },
          body,
          timeoutMs: config.timeoutMs,
        },
        paidRetry.policy,
        signal,
        undefined,
        { retryability: 'paid', idempotencySupported: paidRetry.idempotencySupported },
      );

      const parsed = parseChatImageResponse(response.response.data);
      const result: {
        assets: readonly ProviderInvokeResult['assets'][number][];
        raw: unknown;
        diagnostics?: ProviderInvokeResult['diagnostics'];
        created?: number;
        usage?: ProviderInvokeResult['usage'];
      } = {
        assets: parsed.assets,
        raw: response.response.data,
      };
      if (response.diagnostics.length > 0) {
        result.diagnostics = response.diagnostics;
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
      const url = endpointUrl(config.baseURL, 'models?output_modalities=image');
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

      return parseChatImageModelsResponse(response.response.data);
    },
  };
}
