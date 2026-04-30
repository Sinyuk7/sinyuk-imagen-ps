/**
 * Runtime 单例管理
 *
 * 本模块持有唯一的 Runtime 实例，仅 `commands/` 模块可以 import。
 * UI 层、host 层 MUST NOT 直接引用。
 */

import { createRuntime, type Runtime } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '@imagen-ps/workflows';
import {
  createDispatchAdapter,
  createProviderRegistry,
  registerBuiltins,
  type ProviderRegistry,
  type ProviderConfig,
} from '@imagen-ps/providers';
import type {
  ConfigStorageAdapter,
  ProviderConfigResolver,
  ProviderProfile,
  ProviderProfileRepository,
  ResolvedProviderConfig,
  SecretStorageAdapter,
} from './commands/types.js';

/** 扩展的 Runtime 类型，暴露 provider registry 只读访问 */
export interface ExtendedRuntime extends Runtime {
  /** Provider registry 只读访问（与 Runtime.registry 的 WorkflowRegistry 不同） */
  readonly providerRegistry: Pick<ProviderRegistry, 'list' | 'get'>;
}

let instance: ExtendedRuntime | null = null;
let registryInstance: ProviderRegistry | null = null;
let configAdapterInstance: ConfigStorageAdapter | null = null;
let providerProfileRepositoryInstance: ProviderProfileRepository | null = null;
let secretStorageAdapterInstance: SecretStorageAdapter | null = null;
let providerConfigResolverInstance: ProviderConfigResolver | null = null;

function createInMemoryConfigAdapter(): ConfigStorageAdapter {
  const store = new Map<string, ProviderConfig>();
  return {
    async get(providerId: string): Promise<ProviderConfig | undefined> {
      return store.get(providerId);
    },
    async save(providerId: string, config: ProviderConfig): Promise<void> {
      store.set(providerId, config);
    },
  };
}

function createInMemoryProviderProfileRepository(): ProviderProfileRepository {
  const store = new Map<string, ProviderProfile>();
  return {
    async list(): Promise<readonly ProviderProfile[]> {
      return Array.from(store.values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      return store.get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      store.set(profile.profileId, profile);
    },
    async delete(profileId: string): Promise<void> {
      store.delete(profileId);
    },
  };
}

function createInMemorySecretStorageAdapter(): SecretStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getSecret(key: string): Promise<string | undefined> {
      return store.get(key);
    },
    async setSecret(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function createDefaultProviderConfigResolver(): ProviderConfigResolver {
  return {
    async resolve(profileId: string): Promise<ResolvedProviderConfig> {
      const profile = await getProviderProfileRepository().get(profileId);
      if (!profile) {
        throw new Error(`Provider profile not found: ${profileId}`);
      }

      const provider = getRuntime().providerRegistry.get(profile.providerId);
      if (!provider) {
        throw new Error(`Provider implementation not found: ${profile.providerId}`);
      }
      if (provider.family !== profile.family) {
        throw new Error(
          `Provider profile family mismatch: profile "${profile.profileId}" expects "${profile.family}" but provider "${profile.providerId}" is "${provider.family}".`,
        );
      }

      const resolvedSecrets: Record<string, string> = {};
      for (const [name, ref] of Object.entries(profile.secretRefs ?? {})) {
        const value = await getSecretStorageAdapter().getSecret(ref);
        if (value === undefined) {
          throw new Error(`Provider profile secret is missing: ${name}`);
        }
        resolvedSecrets[name] = value;
      }

      const providerConfig = provider.validateConfig({
        providerId: profile.providerId,
        displayName: profile.displayName,
        family: profile.family,
        ...profile.config,
        ...resolvedSecrets,
      });

      return {
        profileId,
        family: profile.family,
        providerConfig,
      };
    },
  };
}

/**
 * 从 params 中定位 request 对象。
 *
 * 兼容两种 params 结构：
 * (a) params 含 `request` key → `params.request` 为 request
 * (b) params 不含 `request` key → 整个 params（排除 signal 等 meta key）即 request
 */
function locateRequestInParams(params: Record<string, unknown>): {
  requestObj: Record<string, unknown>;
  hasRequestKey: boolean;
} {
  if ('request' in params && typeof params.request === 'object' && params.request !== null) {
    return { requestObj: params.request as Record<string, unknown>, hasRequestKey: true };
  }
  return { requestObj: params, hasRequestKey: false };
}

/**
 * 将 defaultModel 注入到 params 中的 providerOptions.model（不 mutate 原对象）。
 * 仅在 providerOptions.model 缺失时注入。
 */
function injectDefaultModel(params: Record<string, unknown>, defaultModel: string): Record<string, unknown> {
  const { requestObj, hasRequestKey } = locateRequestInParams(params);

  const existingOptions = (requestObj.providerOptions as Record<string, unknown> | undefined) ?? {};

  const sanitizedOptions =
    defaultModel.startsWith('gpt-image') || defaultModel === 'chatgpt-image-latest'
      ? Object.fromEntries(
          Object.entries(existingOptions).filter(
            ([key]) => key !== 'response_format' && key !== 'image_response_format',
          ),
        )
      : existingOptions;

  // 如果 providerOptions.model 已存在（job input explicit），不覆盖
  if (sanitizedOptions.model !== undefined && sanitizedOptions.model !== null) {
    if (sanitizedOptions === existingOptions) {
      return params;
    }
    if (hasRequestKey) {
      return { ...params, request: { ...requestObj, providerOptions: sanitizedOptions } };
    }
    return { ...params, providerOptions: sanitizedOptions };
  }

  const mergedOptions = { ...sanitizedOptions, model: defaultModel };

  if (hasRequestKey) {
    // 结构 (a)：params.request 是 request 对象
    const newRequest = { ...requestObj, providerOptions: mergedOptions };
    return { ...params, request: newRequest };
  }

  // 结构 (b)：整个 params 即 request
  return { ...params, providerOptions: mergedOptions };
}

/**
 * 判断值是否为 workflow input binding 的未解析模板字面量占位符
 *（如 `'${providerProfileId}'`）。
 */
function isTemplateLiteralPlaceholder(val: unknown): boolean {
  return typeof val === 'string' && /^\$\{[^}]+\}$/.test(val);
}

/**
 * 从 params 中解析有效的 profileId。
 *
 * 优先使用 `providerProfileId`，当其存在且不是模板字面量占位符时直接选用；
 * 否则 fallback 到 `profileId`；若两者都是占位符，返回 `undefined`。
 */
function resolveProfileId(params: Record<string, unknown>): string | undefined {
  if (
    !isTemplateLiteralPlaceholder(params.providerProfileId) &&
    typeof params.providerProfileId === 'string' &&
    params.providerProfileId.length > 0
  ) {
    return params.providerProfileId;
  }
  if (
    !isTemplateLiteralPlaceholder(params.profileId) &&
    typeof params.profileId === 'string' &&
    params.profileId.length > 0
  ) {
    return params.profileId;
  }
  return undefined;
}

function createProfileAwareDispatchAdapter(): ReturnType<typeof createDispatchAdapter> {
  return {
    provider: 'profile',

    async dispatch(params: Record<string, unknown>): Promise<unknown> {
      const profileId = resolveProfileId(params);
      if (profileId === undefined || profileId.trim().length === 0) {
        throw new Error('Provider profile dispatch requires a non-empty providerProfileId or profileId.');
      }

      const { providerConfig } = await getProviderConfigResolver().resolve(profileId);
      const provider = getRuntime().providerRegistry.get(providerConfig.providerId);
      if (!provider) {
        throw new Error(`Provider implementation not found: ${providerConfig.providerId}`);
      }

      // Inject profile defaultModel into providerOptions (three-tier priority: tier 2)
      const defaultModel = (providerConfig as unknown as Record<string, unknown>).defaultModel;
      const resolvedParams =
        typeof defaultModel === 'string' && defaultModel.length > 0 ? injectDefaultModel(params, defaultModel) : params;

      const adapter = createDispatchAdapter({ provider, config: providerConfig });
      return adapter.dispatch(resolvedParams);
    },
  };
}

/**
 * 获取 Runtime 单例
 *
 * 首次调用时懒初始化，注入 builtinWorkflows 与 provider adapters。
 * 返回对象额外暴露 `registry` 属性用于 provider 访问。
 */
export function getRuntime(): ExtendedRuntime {
  if (instance === null) {
    registryInstance = createProviderRegistry();
    registerBuiltins(registryInstance);

    const mockProvider = registryInstance.get('mock')!;
    const mockConfig = mockProvider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock Provider',
      family: 'openai-compatible',
      baseURL: 'https://mock.local',
      apiKey: 'mock-key',
    });
    const mockAdapter = createDispatchAdapter({
      provider: mockProvider,
      config: mockConfig,
    });

    const baseRuntime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [mockAdapter, createProfileAwareDispatchAdapter()],
    });

    instance = Object.assign(baseRuntime, {
      providerRegistry: {
        list: () => registryInstance!.list(),
        get: (id: string) => registryInstance!.get(id),
      },
    }) as ExtendedRuntime;

    if (configAdapterInstance === null) {
      configAdapterInstance = createInMemoryConfigAdapter();
    }
  }
  return instance;
}

/** 获取当前 config storage adapter */
export function getConfigAdapter(): ConfigStorageAdapter {
  if (configAdapterInstance === null) {
    configAdapterInstance = createInMemoryConfigAdapter();
  }
  return configAdapterInstance;
}

/** 设置 config storage adapter，允许 CLI / UI 注入自定义实现 */
export function setConfigAdapter(adapter: ConfigStorageAdapter): void {
  configAdapterInstance = adapter;
}

/** 获取当前 provider profile repository */
export function getProviderProfileRepository(): ProviderProfileRepository {
  if (providerProfileRepositoryInstance === null) {
    providerProfileRepositoryInstance = createInMemoryProviderProfileRepository();
  }
  return providerProfileRepositoryInstance;
}

/** 设置 provider profile repository，允许 CLI / UI 注入自定义实现 */
export function setProviderProfileRepository(repository: ProviderProfileRepository): void {
  providerProfileRepositoryInstance = repository;
}

/** 获取当前 secret storage adapter */
export function getSecretStorageAdapter(): SecretStorageAdapter {
  if (secretStorageAdapterInstance === null) {
    secretStorageAdapterInstance = createInMemorySecretStorageAdapter();
  }
  return secretStorageAdapterInstance;
}

/** 设置 secret storage adapter，允许 CLI / UI 注入自定义实现 */
export function setSecretStorageAdapter(adapter: SecretStorageAdapter): void {
  secretStorageAdapterInstance = adapter;
}

/** 获取当前 provider config resolver */
export function getProviderConfigResolver(): ProviderConfigResolver {
  if (providerConfigResolverInstance === null) {
    providerConfigResolverInstance = createDefaultProviderConfigResolver();
  }
  return providerConfigResolverInstance;
}

/** 设置 provider config resolver，允许 CLI / UI 注入自定义实现 */
export function setProviderConfigResolver(resolver: ProviderConfigResolver): void {
  providerConfigResolverInstance = resolver;
}

/** 重置单例（仅供测试），同时重置所有 adapter */
export function _resetForTesting(): void {
  instance = null;
  registryInstance = null;
  configAdapterInstance = null;
  providerProfileRepositoryInstance = null;
  secretStorageAdapterInstance = null;
  providerConfigResolverInstance = null;
}
