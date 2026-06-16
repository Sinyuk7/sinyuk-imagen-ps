import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { ProviderModelInfo } from '../../contract/model.js';
import { imageEndpointDescriptor } from './descriptor.js';
import { imageEndpointConfigSchema, type ImageEndpointProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from '../mock/request-schema.js';
import { httpRequest } from '../../transport/image-endpoint/http.js';
import {
  buildEditRequestBody,
  buildEditMultipartBody,
  buildRequestBody,
} from '../../transport/image-endpoint/build-request.js';
import { parseResponse } from '../../transport/image-endpoint/parse-response.js';
import { parseModelsResponse } from '../../transport/image-endpoint/models.js';

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

function hasInlineAssetData(asset: { readonly data?: unknown } | undefined): boolean {
  return (
    (typeof asset?.data === 'string' && asset.data.length > 0) ||
    (asset?.data instanceof Uint8Array && asset.data.byteLength > 0)
  );
}

function shouldUseMultipartEditBody(request: MockProviderRequest): boolean {
  if (request.operation !== 'image_edit') {
    return false;
  }
  return (request.images ?? []).some(hasInlineAssetData) || hasInlineAssetData(request.maskImage);
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
          ? '/v1/images/generations'
          : request.operation === 'image_edit'
            ? '/v1/images/edits'
            : undefined;

      if (endpoint === undefined) {
        throw createValidationError(`Unsupported image endpoint provider operation: "${request.operation}".`);
      }

      const url = new URL(endpoint, config.baseURL).toString();
      const body =
        request.operation === 'text_to_image'
          ? buildRequestBody(request, config.defaultModel)
          : shouldUseMultipartEditBody(request)
            ? buildEditMultipartBody(request, config.defaultModel)
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

    async discoverModels(config: ImageEndpointProviderConfig): Promise<readonly ProviderModelInfo[]> {
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
