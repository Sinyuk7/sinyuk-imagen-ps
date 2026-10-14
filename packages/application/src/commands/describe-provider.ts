import { getRuntime } from '../runtime.js';
import type { ProviderDescriptor } from './types.js';

/** 获取指定 provider 的描述，不存在返回 undefined。 */
export function describeProvider(providerId: string): ProviderDescriptor | undefined {
  return getRuntime().providerRegistry.get(providerId)?.describe();
}
