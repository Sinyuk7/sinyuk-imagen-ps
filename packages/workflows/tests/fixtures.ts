import { createRuntime, type ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import { createDispatchAdapter, createMockProvider, createOpenAICompatibleProvider } from '@imagen-ps/providers';
import { builtinWorkflows } from '../src/index.js';

/**
 * 递归清理值中的 undefined 字段与 TypedArray。
 *
 * Workaround:
 * 1. provider 实现会在 diagnostics 为空时返回 undefined，导致
 *    core-engine dispatch 边界的 assertSerializable 拒绝。
 * 2. provider 返回的 assets 中可能包含 Uint8Array，导致
 *    core-engine dispatch 边界的 deepFreeze 抛出 TypeError。
 *
 * 在测试夹具中做清理，使跨包测试能继续验证其他场景。
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeValue(val);
      }
    }
    return cleaned;
  }
  return value;
}

/**
 * 创建基于 mock provider 的 ProviderDispatchAdapter。
 *
 * @param options - 可选覆盖配置字段
 * @returns 可直接用于 createRuntime 的 adapter
 */
export function createMockBridgeAdapter(options?: {
  failMode?: { type: 'always' } | { type: 'probability'; rate: number };
  delayMs?: number;
}): ProviderDispatchAdapter {
  const provider = createMockProvider();
  const config = provider.validateConfig({
    providerId: 'mock',
    displayName: 'Mock Provider',
    family: 'openai-compatible',
    baseURL: 'https://example.com',
    apiKey: 'test-key',
    delayMs: options?.delayMs ?? 0,
    ...(options?.failMode ? { failMode: options.failMode } : {}),
  });

  const adapter = createDispatchAdapter({ provider, config });

  return {
    provider: adapter.provider,
    async dispatch(params) {
      const result = await adapter.dispatch(params);
      return sanitizeValue(result);
    },
  };
}

/**
 * 创建基于 openai-compatible provider 的 ProviderDispatchAdapter。
 *
 * @returns 可直接用于 createRuntime 的 adapter
 */
export function createOpenAICompatibleBridgeAdapter(): ProviderDispatchAdapter {
  const provider = createOpenAICompatibleProvider();
  const config = provider.validateConfig({
    providerId: 'openai-compatible',
    displayName: 'OpenAI Compatible',
    family: 'openai-compatible',
    baseURL: 'https://api.openai.com',
    apiKey: 'test-key',
    defaultModel: 'dall-e-3',
  });

  const adapter = createDispatchAdapter({ provider, config });

  return {
    provider: adapter.provider,
    async dispatch(params) {
      const result = await adapter.dispatch(params);
      return sanitizeValue(result);
    },
  };
}

/**
 * 预置 builtinWorkflows 与可选 adapters 的快捷 runtime 构造器。
 *
 * @param adapters - 要注册的 provider adapters
 * @returns 可直接执行 workflow 的 runtime
 */
export function createRuntimeWithBuiltins(adapters: ProviderDispatchAdapter[] = []) {
  return createRuntime({
    initialWorkflows: builtinWorkflows,
    adapters,
  });
}

/**
 * 生成一个合法的 provider-generate job input。
 *
 * @param overrides - 可覆盖任意字段
 * @returns 合法的 generate job input
 */
export function generateValidGenerateInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: 'mock',
    prompt: 'a red apple',
    ...overrides,
  };
}

/**
 * 生成一个合法的 provider-edit job input。
 *
 * @param overrides - 可覆盖任意字段（包括 `providerOptions`，用于 future model override）
 * @returns 合法的 edit job input
 */
export function generateValidEditInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: 'mock',
    prompt: 'change background to blue',
    inputAssets: [
      {
        type: 'image' as const,
        name: 'input.png',
        url: 'https://example.com/input.png',
        mimeType: 'image/png',
      },
    ],
    ...overrides,
  };
}
