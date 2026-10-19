import type { ProviderRegistry } from './provider-registry.js';
import type { Provider } from '../contract/provider.js';
import { createOpenAiProvider } from '../providers/openai/provider.js';
import { createGoogleGeminiProvider } from '../providers/gemini/provider.js';
import { createGrsaiProvider } from '../providers/grsai/provider.js';
import { createRunningHubProvider } from '../providers/runninghub/provider.js';

/** 内置 provider id 的编译期穷举集合。 */
export type BuiltinProviderId =
  | 'openai'
  | 'google-gemini'
  | 'grsai'
  | 'runninghub';

/** 内置 provider factory 映射；仅覆盖 repo 维护的真实 builtin。 */
export const builtins = {
  'openai': createOpenAiProvider,
  'google-gemini': createGoogleGeminiProvider,
  'grsai': createGrsaiProvider,
  'runninghub': createRunningHubProvider,
} satisfies Record<BuiltinProviderId, () => Provider<unknown, unknown>>;

/**
 * 将内置 provider 注册到给定的 registry。
 *
 * 由应用层在初始化时调用，避免模块顶层副作用。
 */
export function registerBuiltins(registry: ProviderRegistry): void {
  for (const createProvider of Object.values(builtins)) {
    registry.register(createProvider());
  }
}
