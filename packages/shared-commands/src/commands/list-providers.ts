/**
 * listProviders 命令
 */

import type { ProviderDescriptor } from '@imagen-ps/providers';
import { getRuntime } from '../runtime.js';

/** 列出所有已注册 provider */
export function listProviders(): ProviderDescriptor[] {
  return getRuntime().providerRegistry.list();
}
