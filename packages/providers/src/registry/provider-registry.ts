import {
  type ProviderId,
  type Provider,
  type ProviderConfig,
  type ProviderDescriptor,
  type ProviderRequest,
} from '../contract/index.js';

/**
 * Provider registry 接口。
 *
 * 纯内存路由表，不持有 runtime state、config 持久化或 lifecycle。
 */
export interface ProviderRegistry {
  /** 注册一个 provider 实例。 */
  register(provider: Provider<ProviderConfig, ProviderRequest>): void;

  /** 按 id 获取 provider 实例。 */
  get(providerId: string): Provider<ProviderConfig, ProviderRequest> | undefined;

  /** 按 Provider id 获取 provider 实例。 */
  getByProviderId(providerId: ProviderId): Provider<ProviderConfig, ProviderRequest> | undefined;

  /** 列出所有已注册 provider 的 descriptor。 */
  list(): ProviderDescriptor[];
}

/** 结构化 registry 错误。 */
export interface RegistryError extends Error {
  code: 'duplicate_id' | 'not_found' | 'invalid_provider';
  details?: Record<string, unknown>;
}

function createRegistryError(
  code: RegistryError['code'],
  message: string,
  details?: Record<string, unknown>,
): RegistryError {
  const err = new Error(message) as RegistryError;
  err.code = code;
  err.details = details;
  err.name = 'RegistryError';
  return err;
}

function assertDefaultModelTemplates(descriptor: ProviderDescriptor): void {
  const modelIds = new Set<string>();
  for (const template of descriptor.defaultModelTemplates) {
    if (
      template.providerId !== descriptor.id ||
      template.modelId.trim().length === 0 ||
      template.wireModelId.trim().length === 0 ||
      template.baseModelId.trim().length === 0 ||
      modelIds.has(template.modelId)
    ) {
      throw createRegistryError('invalid_provider', `Provider "${descriptor.id}" has an invalid default model template.`, {
        providerId: descriptor.id,
      });
    }
    modelIds.add(template.modelId);
  }
}

/** 创建内存级 provider registry。 */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, Provider>();
  const providersByProviderId = new Map<ProviderId, Provider>();

  return {
    register(provider: Provider): void {
      const descriptor = provider.describe();
      assertDefaultModelTemplates(descriptor);
      if ((descriptor.invokeMode === 'async') !== (provider.asyncLifecycle !== undefined)) {
        throw createRegistryError(
          'invalid_provider',
          `Provider "${provider.id}" async lifecycle does not match descriptor invokeMode.`,
          { providerId: provider.id, invokeMode: descriptor.invokeMode },
        );
      }
      if (providers.has(provider.id)) {
        throw createRegistryError(
          'duplicate_id',
          `Provider with id "${provider.id}" is already registered.`,
          { providerId: provider.id },
        );
      }
      if (isProviderId(provider.id)) {
        if (providersByProviderId.has(provider.id)) {
          throw createRegistryError('invalid_provider', `Provider "${provider.id}" is already registered.`, { providerId: provider.id });
        }
        providersByProviderId.set(provider.id, provider);
      }
      providers.set(provider.id, provider);
    },

    get(providerId: string): Provider | undefined {
      return providers.get(providerId);
    },

    getByProviderId(providerId: ProviderId): Provider | undefined {
      return providersByProviderId.get(providerId);
    },

    list(): ProviderDescriptor[] {
      return Array.from(providers.values()).map((p) => p.describe());
    },
  };
}

function isProviderId(value: string): value is ProviderId {
  return value === 'openai' || value === 'google-gemini' || value === 'grsai' || value === 'runninghub';
}
