/**
 * Runtime 单例管理。
 *
 * 本模块持有唯一的 Runtime 实例，仅 `commands/` 模块可以 import。
 * UI 层、host 层 MUST NOT 直接引用。
 */

import { createRuntime, type Runtime } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '@imagen-ps/workflows';
import { createMockProvider, createDispatchAdapter } from '@imagen-ps/providers';

/** Runtime 单例实例。 */
let instance: Runtime | null = null;

/**
 * 获取 Runtime 单例。
 *
 * 首次调用时懒初始化：注入 builtinWorkflows 与 mock provider adapter。
 * 后续调用返回同一实例。
 */
export function getRuntime(): Runtime {
  if (instance === null) {
    // v1: 硬编码 mock provider adapter
    const mockProvider = createMockProvider();
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

    instance = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [mockAdapter],
    });
  }
  return instance;
}

/**
 * 重置 Runtime 单例（仅供测试使用）。
 *
 * 调用后，下次 `getRuntime()` 将创建新的 Runtime 实例。
 * 以下划线前缀约定仅测试用。
 */
export function _resetForTesting(): void {
  instance = null;
}
