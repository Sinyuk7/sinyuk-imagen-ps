/**
 * Profile model commands.
 *
 * 本模块在不动 dispatch / secret 边界的前提下，提供与 provider profile
 * 的 model 候选相关的 surface-agnostic 命令：
 *
 * - `listProfileModels(profileId)`：catalog provider 始终以本地 catalog 为
 *   picker 来源，`profile.models` 仅作为 remotelyAvailable 的缓存；其他
 *   provider 仍按 `profile.models` → `descriptor.defaultModels` → `[]`
 *   回退，不做任何网络调用。
 * - `refreshProfileModels(profileId)`：调用 implementation 的
 *   `discoverModels(config)`；catalog provider 成功时只更新 discovery cache，
 *   返回值仍是本地 catalog + availability metadata；失败时不擦除已有缓存、
 *   不持久化任何失败状态。
 */

import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { getProviderConfigResolver, getProviderProfileRepository, getRuntime, getRuntimeLogger } from '../runtime.js';
import type { CommandResult, ProviderProfile } from './types.js';
import {
  listLocalCatalogModels,
  providerUsesImageModelCatalog,
  reconcileDiscoveredCatalogModels,
  type ProviderModelInfo,
} from '@imagen-ps/providers';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';
import { assertSupportedProfileDefaultModel } from './default-model-validation.js';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && typeof (error as { readonly message?: unknown }).message === 'string') {
    return (error as { readonly message: string }).message;
  }
  return fallback;
}

export function reconcileCachedCatalogModels(profile: ProviderProfile): readonly ProviderModelInfo[] {
  const catalogProviderId = catalogProviderIdForApiFormat(profile.apiFormat);
  if (!providerUsesImageModelCatalog(catalogProviderId)) {
    return profile.models ?? [];
  }

  const discoveredModels = reconcileDiscoveredCatalogModels({
    providerId: catalogProviderId,
    discoveredModels: profile.models ?? [],
  });
  if ((profile.models ?? []).length === 0) {
    return listLocalCatalogModels(catalogProviderId);
  }

  const remotelyAvailableRuleIds = new Set(discoveredModels.map((model) => model.ruleId));
  return listLocalCatalogModels(catalogProviderId).map((model) => ({
    ...model,
    remotelyAvailable: remotelyAvailableRuleIds.has(model.ruleId),
  }));
}

function resolvedBaseModels(
  profile: ProviderProfile,
  descriptorDefaults: readonly ProviderModelInfo[],
): { readonly models: readonly ProviderModelInfo[]; readonly source: 'profile.cache' | 'provider.defaults' | 'none' } {
  const catalogProviderId = catalogProviderIdForApiFormat(profile.apiFormat);
  if (providerUsesImageModelCatalog(catalogProviderId)) {
    if (profile.models && profile.models.length > 0) {
      return {
        models: reconcileCachedCatalogModels(profile),
        source: 'profile.cache',
      };
    }
    return {
      models: listLocalCatalogModels(catalogProviderId),
      source: 'provider.defaults',
    };
  }

  if (profile.models && profile.models.length > 0) {
    return {
      models: profile.models,
      source: 'profile.cache',
    };
  }

  if (descriptorDefaults.length > 0) {
    return {
      models: descriptorDefaults,
      source: 'provider.defaults',
    };
  }

  return {
    models: [],
    source: 'none',
  };
}

export function resolvedModelsForProfile(
  profile: ProviderProfile,
  descriptorDefaults: readonly ProviderModelInfo[],
): { readonly models: readonly ProviderModelInfo[]; readonly source: 'profile.cache' | 'provider.defaults' | 'none' } {
  return resolvedBaseModels(profile, descriptorDefaults);
}

export function reconcilePersistedDiscoveredModels(
  apiFormat: ProviderProfile['apiFormat'],
  models: readonly ProviderModelInfo[],
): readonly ProviderModelInfo[] {
  const catalogProviderId = catalogProviderIdForApiFormat(apiFormat);
  return providerUsesImageModelCatalog(catalogProviderId)
    ? reconcileDiscoveredCatalogModels({
      providerId: catalogProviderId,
      discoveredModels: models,
    })
    : models;
}

/**
 * 列出 provider profile 的 model 候选清单。
 *
 * INTENT: 提供 surface-agnostic 的 model 候选获取通路。
 * INPUT: profileId。
 * OUTPUT: 按 fallback chain 解析后的 `readonly ProviderModelInfo[]`。
 * SIDE EFFECT: 无（不发起网络、不写入持久化）。
 * FAILURE: profile 不存在 / apiFormat 未注册 → validation error。
 */
export async function listProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.model.list');

  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    span.fail({ message: `Provider profile "${profileId}" not found.` });
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
  if (!provider) {
    span.fail({ message: `Provider implementation for apiFormat "${profile.apiFormat}" not found for profile "${profileId}".` });
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation for apiFormat "${profile.apiFormat}" not found for profile "${profileId}".`,
        { profileId, apiFormat: profile.apiFormat },
      ),
    };
  }

  const descriptorDefaults = provider.describe().defaultModels ?? [];
  let resolved;
  try {
    assertSupportedProfileDefaultModel({ profile, descriptor: provider.describe(), descriptorDefaults });
    resolved = resolvedModelsForProfile(profile, descriptorDefaults);
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
        apiFormat: profile.apiFormat,
      }),
    };
  }
  span.finish({
    source: resolved.source,
    count: resolved.models.length,
  });
  return { ok: true, value: resolved.models };
}

/**
 * 触发一次 model discovery 并把结果写入 `profile.models` 缓存。
 *
 * INTENT: 让用户主动触发 implementation 的 discovery，并在成功时刷新缓存。
 * INPUT: profileId。
 * OUTPUT: 成功时返回新 model 列表（含空数组）。
 * SIDE EFFECT: 仅在成功时写 repository；失败时 `profile.models` 维持原值。
 * FAILURE:
 *   - profile 不存在 / config resolve 失败 / implementation 未实现 discoverModels
 *     → validation error（不修改 profile）。
 *   - discoverModels 抛错 → provider error（不修改 profile）。
 */
export async function refreshProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.model.refresh');

  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    span.fail({ message: `Provider profile "${profileId}" not found.` });
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }

  let providerConfig: unknown;
  try {
    const resolved = await getProviderConfigResolver().resolve(profileId);
    providerConfig = resolved.providerConfig;
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
      }),
    };
  }

  const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
  if (!provider) {
    span.fail({ message: `Provider implementation for apiFormat "${profile.apiFormat}" not found for profile "${profileId}".` });
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation for apiFormat "${profile.apiFormat}" not found for profile "${profileId}".`,
        { profileId, apiFormat: profile.apiFormat },
      ),
    };
  }

  if (typeof provider.discoverModels !== 'function') {
    span.fail({ message: `Provider implementation for apiFormat "${profile.apiFormat}" does not support model discovery.` });
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation for apiFormat "${profile.apiFormat}" does not support model discovery.`,
        { profileId, apiFormat: profile.apiFormat },
      ),
    };
  }

  let models: readonly ProviderModelInfo[];
  try {
    models = await provider.discoverModels(
      providerConfig as never,
      logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: provider.id,
      }),
    );
  } catch (error) {
    // Sanitize secret leakage: only forward `Error.message`, never raw error or
    // resolved config; the provider implementation owns "no secret in messages".
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, `Model discovery failed for profile "${profileId}".`), {
        profileId,
        apiFormat: profile.apiFormat,
      }),
    };
  }

  const persistedModels = reconcilePersistedDiscoveredModels(profile.apiFormat, models);

  const updated: ProviderProfile = {
    ...profile,
    models: persistedModels,
    updatedAt: new Date().toISOString(),
  };
  try {
    await repository.save(updated);
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(
        errorMessage(error, `Failed to persist refreshed models for profile "${profileId}".`),
        { profileId, apiFormat: profile.apiFormat },
      ),
    };
  }

  const descriptorDefaults = provider.describe().defaultModels ?? [];
  let resolved;
  try {
    assertSupportedProfileDefaultModel({ profile: updated, descriptor: provider.describe(), descriptorDefaults });
    resolved = resolvedModelsForProfile(updated, descriptorDefaults);
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
        apiFormat: profile.apiFormat,
      }),
    };
  }
  span.finish({
    persistedCount: persistedModels.length,
    returnedCount: resolved.models.length,
  });
  return { ok: true, value: resolved.models };
}
