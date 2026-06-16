import type { Provider, ProviderDescriptor } from '../contract/index.js';

/**
 * Provider registry 接口。
 *
 * 纯内存路由表，不持有 runtime state、config 持久化或 lifecycle。
 */
export interface ProviderRegistry {
  /** 注册一个 provider 实例。 */
  register(provider: Provider): void;

  /** 按 id 获取 provider 实例。 */
  get(providerId: string): Provider | undefined;

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

    list(): ProviderDescriptor[] {
      return Array.from(providers.values()).map((p) => p.describe());
    },
  };
}
