import type { ApiFormat, Provider, ProviderConfig, ProviderDescriptor, ProviderRequest } from '../contract/index.js';

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
  code: 'duplicate_id' | 'not_found';
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

/** 创建内存级 provider registry。 */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, Provider>();

  return {
    register(provider: Provider): void {
      if (providers.has(provider.id)) {
        throw createRegistryError(
          'duplicate_id',
          `Provider with id "${provider.id}" is already registered.`,
          { providerId: provider.id },
        );
      }
      providers.set(provider.id, provider);
    },

    get(providerId: string): Provider | undefined {
      return providers.get(providerId);
    },

    getByApiFormat(apiFormat: ApiFormat): Provider | undefined {
      const matches = Array.from(providers.values()).filter((provider) => provider.describe().apiFormat === apiFormat);
      return matches.find((provider) => provider.id !== 'mock') ?? matches[0];
    },

    list(): ProviderDescriptor[] {
      return Array.from(providers.values()).map((p) => p.describe());
    },
  };
}
