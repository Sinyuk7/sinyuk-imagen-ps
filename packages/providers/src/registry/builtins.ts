import type { ProviderRegistry } from './provider-registry.js';
import type { Provider } from '../contract/provider.js';
import { createMockProvider } from '../providers/mock/provider.js';
import { createImageEndpointProvider } from '../providers/openai-images/provider.js';
import { createGeminiGenerateContentProvider } from '../providers/gemini/provider.js';
import { createGrsaiGenerateProvider } from '../providers/grsai/provider.js';

/** 内置 provider id 的编译期穷举集合。 */
export type BuiltinProviderId =
  | 'image-endpoint'
  | 'gemini-generate-content'
  | 'grsai-generate';

/** 内置 provider factory 映射；仅覆盖 repo 维护的真实 builtin。 */
export const builtins = {
  'image-endpoint': createImageEndpointProvider,
  'gemini-generate-content': createGeminiGenerateContentProvider,
  'grsai-generate': createGrsaiGenerateProvider,
} satisfies Record<BuiltinProviderId, () => Provider<unknown, unknown>>;

/**
 * 将内置 provider 注册到给定的 registry。
 *
 * 由应用层在初始化时调用，避免模块顶层副作用。
 */
export function registerBuiltins(registry: ProviderRegistry): void {
  registry.register(createMockProvider());
  for (const createProvider of Object.values(builtins)) {
    registry.register(createProvider());
  }
}
