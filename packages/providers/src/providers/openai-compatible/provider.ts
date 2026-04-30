import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { openaiCompatibleDescriptor } from './descriptor.js';
import { openaiCompatibleConfigSchema, type OpenAICompatibleProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { httpRequest } from '../../transport/openai-compatible/http.js';
import { buildEditRequestBody, buildRequestBody } from '../../transport/openai-compatible/build-request.js';
import { parseResponse } from '../../transport/openai-compatible/parse-response.js';
import { parseModelsResponse } from '../../transport/openai-compatible/models.js';

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

      const endpoint =
        request.operation === 'generate'
          ? '/v1/images/generations'
          : request.operation === 'edit'
            ? '/v1/images/edits'
            : undefined;

      if (endpoint === undefined) {
        throw createValidationError(`Unsupported OpenAI-compatible provider operation: "${request.operation}".`);
      }

      const url = new URL(endpoint, config.baseURL).toString();
      const body =
        request.operation === 'generate'
          ? buildRequestBody(request, config.defaultModel)
          : buildEditRequestBody(request, config.defaultModel);

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

      const parsed = parseResponse(response.response.data);

      // 契约：无值的可选字段 **省略**（不写 `undefined`），
      // 与 `ProviderInvokeResult` 的缺省字段约定对齐（见 contract/result.ts）。
      const result: {
        assets: readonly ProviderInvokeResult['assets'][number][];
        raw: unknown;
        diagnostics?: ProviderInvokeResult['diagnostics'];
        created?: number;
        usage?: ProviderInvokeResult['usage'];
        metadata?: ProviderInvokeResult['metadata'];
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
      if (parsed.metadata !== undefined) {
        result.metadata = parsed.metadata;
      }
      return result;
    },

    async discoverModels(config: OpenAICompatibleProviderConfig): Promise<readonly ProviderModelInfo[]> {
      const url = new URL('/v1/models', config.baseURL).toString();

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

      return parseModelsResponse(response.response.data);
    },
  };
}
