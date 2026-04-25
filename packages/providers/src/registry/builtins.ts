import type { ProviderRegistry } from './provider-registry.js';
import { createMockProvider } from '../providers/mock/provider.js';

/**
 * 将内置 provider 注册到给定的 registry。
 *
 * 由应用层在初始化时调用，避免模块顶层副作用。
 */
export function registerBuiltins(registry: ProviderRegistry): void {
  registry.register(createMockProvider());
}
