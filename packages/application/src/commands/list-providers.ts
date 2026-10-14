import { getRuntime } from '../runtime.js';
import type { ProviderDescriptor } from './types.js';

/** 列出所有已注册 provider，并投影出给 UI/host 可消费的 surface 元数据。 */
export function listProviders(): ProviderDescriptor[] {
  return getRuntime().providerRegistry.list();
}
