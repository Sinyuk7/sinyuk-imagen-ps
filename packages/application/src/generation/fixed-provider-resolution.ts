import { createImmutableSnapshot, createValidationError } from '@imagen-ps/core-engine';
import {
  checkProviderParameters,
  resolveProviderCatalog,
  type CatalogResolution,
  type FixedGenerationRequest,
  type FixedProviderId,
} from '@imagen-ps/providers';
import type { ProviderAccount, ProviderAccountRepository, SecretStorageAdapter } from '../commands/types.js';

/** 固定 provider 解析依赖；模型解析和账号读取均可由宿主注入。 */
export interface FixedProviderResolutionDependencies {
  readonly accounts: Pick<ProviderAccountRepository, 'get'>;
  readonly secrets: Pick<SecretStorageAdapter, 'getSecret'>;
  readonly resolveCatalog?: (providerId: FixedProviderId) => Promise<CatalogResolution>;
}

/** 不包含密钥的 admission 解析结果。 */
export interface ResolvedFixedGeneration {
  readonly request: FixedGenerationRequest;
  readonly account: ProviderAccount;
  readonly catalog: CatalogResolution;
}

/** 仅供 dispatch 调用栈消费的账号凭据，不得写入 Job/Task。 */
export interface FixedProviderCredentials {
  readonly providerId: FixedProviderId;
  readonly baseUrl: string;
  readonly apiKey: string;
}

function assertProviderId(providerId: unknown): asserts providerId is FixedProviderId {
  if (providerId !== 'grsai' && providerId !== 'runninghub') throw createValidationError('Unsupported fixed provider.');
}

function checkedBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/$/u, '');
  } catch {
    throw createValidationError('Provider Base URL must be an HTTP(S) URL without credentials, query or fragment.');
  }
}

/** 创建固定 provider 解析器；admission 不读 Key，dispatch 读取当前账号 Key。 */
export function createFixedProviderResolver(dependencies: FixedProviderResolutionDependencies) {
  const loadCatalog = dependencies.resolveCatalog ?? resolveProviderCatalog;
  return {
    async resolveGeneration(request: FixedGenerationRequest): Promise<ResolvedFixedGeneration> {
      assertProviderId(request.providerId);
      if (typeof request.modelId !== 'string' || !request.modelId.trim()) throw createValidationError('Catalog model ID is required.');
      if (typeof request.prompt !== 'string' || !request.prompt.trim()) throw createValidationError('Generation prompt is required.');
      const catalog = await loadCatalog(request.providerId);
      const checked = checkProviderParameters(request, catalog.catalog);
      if (request.operation === 'image_edit' && !request.images?.length) throw createValidationError('Image edit requires input images.');
      if (checked.model.input?.maxImages !== undefined && (request.images?.length ?? 0) > checked.model.input.maxImages) throw createValidationError('Too many input images for the selected model.');
      if (request.operation === 'text_to_image' && (request.images?.length || request.maskImage)) throw createValidationError('Text to image must not contain images or Mask.');
      if (request.maskImage && checked.model.input?.mask !== true) throw createValidationError('Selected model does not support Mask.');
      const account = await dependencies.accounts.get(request.providerId);
      if (!account || account.providerId !== request.providerId || !account.secretRef) throw createValidationError('Provider API Key is not configured.');
      return createImmutableSnapshot({ request: { ...request, parameters: checked.parameters }, account, catalog }) as ResolvedFixedGeneration;
    },
    async resolveCredentials(providerId: FixedProviderId, catalog: CatalogResolution): Promise<FixedProviderCredentials> {
      assertProviderId(providerId);
      if (catalog.catalog.providerId !== providerId) throw createValidationError('Catalog provider does not match account provider.');
      // 每次 dispatch 重读账号与密钥，排队期间更新 Key 会立即生效。
      const account = await dependencies.accounts.get(providerId);
      if (!account || account.providerId !== providerId || !account.secretRef) throw createValidationError('Provider API Key is not configured.');
      const apiKey = await dependencies.secrets.getSecret(account.secretRef);
      if (!apiKey?.trim()) throw createValidationError('Provider API Key is missing.');
      return { providerId, baseUrl: checkedBaseUrl(account.baseUrl ?? catalog.catalog.baseUrl), apiKey: apiKey.trim() };
    },
  };
}
