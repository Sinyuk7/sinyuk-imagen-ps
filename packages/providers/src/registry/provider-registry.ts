import {
  getOfficialModelPreset,
  getRequestStrategy,
  implementationIdForApiFormat,
  type ApiFormat,
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

  /** 按 API format 获取 provider 实例。 */
  getByApiFormat(apiFormat: ApiFormat): Provider<ProviderConfig, ProviderRequest> | undefined;

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
      descriptor.apiFormat === undefined ||
      template.apiFormat !== descriptor.apiFormat ||
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
    const preset = getOfficialModelPreset(template.apiFormat, template.baseModelId);
    const strategy = preset ? getRequestStrategy(preset.requestStrategyId) : undefined;
    if (!preset || !strategy || strategy.apiFormat !== template.apiFormat) {
      throw createRegistryError('invalid_provider', `Provider "${descriptor.id}" default model template does not resolve exactly.`, {
        providerId: descriptor.id,
        modelId: template.modelId,
      });
    }
  }
}

/** 创建内存级 provider registry。 */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, Provider>();
  const providersByApiFormat = new Map<ApiFormat, Provider>();

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
      if (descriptor.apiFormat !== undefined) {
        const expectedId = implementationIdForApiFormat(descriptor.apiFormat);
        if (provider.id !== expectedId) {
          throw createRegistryError(
            'invalid_provider',
            `Provider "${provider.id}" is not canonical for apiFormat "${descriptor.apiFormat}".`,
            { providerId: provider.id, apiFormat: descriptor.apiFormat, expectedId },
          );
        }
        if (providersByApiFormat.has(descriptor.apiFormat)) {
          throw createRegistryError(
            'invalid_provider',
            `Provider apiFormat "${descriptor.apiFormat}" is already registered.`,
            { providerId: provider.id, apiFormat: descriptor.apiFormat },
          );
        }
        providersByApiFormat.set(descriptor.apiFormat, provider);
      }
      providers.set(provider.id, provider);
    },

    get(providerId: string): Provider | undefined {
      return providers.get(providerId);
    },

    getByApiFormat(apiFormat: ApiFormat): Provider | undefined {
      return providersByApiFormat.get(apiFormat);
    },

    list(): ProviderDescriptor[] {
      return Array.from(providers.values()).map((p) => p.describe());
    },
  };
}
