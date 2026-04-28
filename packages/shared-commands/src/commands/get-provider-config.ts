/**
 * getProviderConfig 命令
 */

import { createValidationError } from '@imagen-ps/core-engine';
import type { ProviderConfig } from '@imagen-ps/providers';
import { getRuntime, getConfigAdapter } from '../runtime.js';
import type { CommandResult } from './types.js';

/** 获取指定 provider 的配置 */
export async function getProviderConfig(providerId: string): Promise<CommandResult<ProviderConfig>> {
  const runtime = getRuntime();
  const provider = runtime.providerRegistry.get(providerId);

  if (!provider) {
    return {
      ok: false,
      error: createValidationError(`Provider "${providerId}" not found.`),
    };
  }

  const adapter = getConfigAdapter();
  const config = await adapter.get(providerId);

  if (!config) {
    return {
      ok: false,
      error: createValidationError(`No saved config for provider "${providerId}".`),
    };
  }

  return { ok: true, value: config };
}
