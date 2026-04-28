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
import type { ConfigStorageAdapter } from './commands/types.js';

/** 扩展的 Runtime 类型，暴露 provider registry 只读访问 */
export interface ExtendedRuntime extends Runtime {
  /** Provider registry 只读访问（与 Runtime.registry 的 WorkflowRegistry 不同） */
  readonly providerRegistry: Pick<ProviderRegistry, 'list' | 'get'>;
}

let instance: ExtendedRuntime | null = null;
let registryInstance: ProviderRegistry | null = null;
let configAdapterInstance: ConfigStorageAdapter | null = null;

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
      adapters: [mockAdapter],
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

/** 重置单例（仅供测试），同时重置 config adapter */
export function _resetForTesting(): void {
  instance = null;
  registryInstance = null;
  configAdapterInstance = null;
}
