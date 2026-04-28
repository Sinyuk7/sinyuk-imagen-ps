/**
 * saveProviderConfig 命令
 */

import { createValidationError } from '@imagen-ps/core-engine';
import { getRuntime, getConfigAdapter } from '../runtime.js';
import type { CommandResult } from './types.js';

/** 保存 provider 配置，先校验再持久化 */
export async function saveProviderConfig(providerId: string, config: unknown): Promise<CommandResult<void>> {
  const runtime = getRuntime();
  const provider = runtime.providerRegistry.get(providerId);

  if (!provider) {
    return {
      ok: false,
      error: createValidationError(`Provider "${providerId}" not found.`),
    };
  }

  let validatedConfig;
  try {
    validatedConfig = provider.validateConfig(config);
  } catch (err) {
    return {
      ok: false,
      error: createValidationError(err instanceof Error ? err.message : `Invalid config for provider "${providerId}".`),
    };
  }

  const adapter = getConfigAdapter();
  await adapter.save(providerId, validatedConfig);

  return { ok: true, value: undefined };
}
