import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import { openaiCompatibleDescriptor } from './descriptor.js';
import { openaiCompatibleConfigSchema, type OpenAICompatibleProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { httpRequest } from '../../transport/openai-compatible/http.js';
import { buildRequestBody } from '../../transport/openai-compatible/build-request.js';
import { parseResponse } from '../../transport/openai-compatible/parse-response.js';

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

/**
 * 创建 OpenAI-compatible provider 实例。
 */
export function createOpenAICompatibleProvider(): Provider<OpenAICompatibleProviderConfig, MockProviderRequest> {
  return {
    id: openaiCompatibleDescriptor.id,
    family: openaiCompatibleDescriptor.family,

    describe(): ProviderDescriptor {
      return openaiCompatibleDescriptor;
    },

    validateConfig(input: unknown): OpenAICompatibleProviderConfig {
      const result = openaiCompatibleConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `OpenAI-compatible provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
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
          `OpenAI-compatible provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(
      args: ProviderInvokeArgs<OpenAICompatibleProviderConfig, MockProviderRequest>,
    ): Promise<ProviderInvokeResult> {
      const { config, request, signal } = args;

      if (request.operation !== 'generate') {
        throw createValidationError(
          `OpenAI-compatible provider currently only supports "generate" operation, received "${request.operation}".`,
        );
      }

      const url = new URL('/v1/images/generations', config.baseURL).toString();
      const body = buildRequestBody(request, config.defaultModel);

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
      );

      const assets = parseResponse(response.response.data);

      // 契约：无诊断时**省略** `diagnostics` 字段（不写 `undefined`），
      // 与 ProviderInvokeResult 的 optional 语义对齐（参见 contract/result.ts）。
      const result: ProviderInvokeResult = {
        assets,
        raw: response.response.data,
      };
      if (response.diagnostics.length > 0) {
        return { ...result, diagnostics: response.diagnostics };
      }
      return result;
    },
  };
}
