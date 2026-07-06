/**
 * Profile model commands.
 *
 * `refreshProfileModels()` owns remote discovery and writes a profile-scoped
 * discovery cache. `listProfileModels()` is local-only reconciliation over the
 * cache, user model configs, official catalog, and profile selection state.
 */

import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getModelDiscoveryCacheRepository,
  getProviderConfigResolver,
  getProviderProfileRepository,
  getRuntime,
  getRuntimeLogger,
  getUserModelConfigRepository,
} from '../runtime.js';
import type { CommandResult, ProfileModelItem, ProviderProfile, UserModelConfig } from './types.js';
import {
  listOfficialModelPresets,
  providerUsesImageModelCatalog,
  type DiscoveredModel,
} from '@imagen-ps/providers';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && typeof (error as { readonly message?: unknown }).message === 'string') {
    return (error as { readonly message: string }).message;
  }
  return fallback;
}

function uniqueModelIds(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const modelId = id.trim();
    if (modelId.length === 0 || seen.has(modelId)) {
      continue;
    }
    seen.add(modelId);
    result.push(modelId);
  }
  return result;
}

function officialCatalogIds(profile: Pick<ProviderProfile, 'apiFormat'>): ReadonlySet<string> {
  const catalogProviderId = catalogProviderIdForApiFormat(profile.apiFormat);
  if (!providerUsesImageModelCatalog(catalogProviderId)) {
    return new Set();
  }
  return new Set(listOfficialModelPresets(profile.apiFormat).map((model) => model.modelId));
}

function officialCatalogDisplayNames(profile: Pick<ProviderProfile, 'apiFormat'>): ReadonlyMap<string, string> {
  return new Map(listOfficialModelPresets(profile.apiFormat).map((model) => [model.modelId, model.displayName] as const));
}

function resolvedProfileModelDisplayName(args: {
  readonly modelId: string;
  readonly userConfig?: UserModelConfig;
  readonly officialCatalogDisplayNames?: ReadonlyMap<string, string>;
}): string | undefined {
  const direct = args.officialCatalogDisplayNames?.get(args.modelId);
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct;
  }
  const baseModelId = args.userConfig?.baseModelId?.trim();
  if (!baseModelId) {
    return undefined;
  }
  const base = args.officialCatalogDisplayNames?.get(baseModelId);
  return typeof base === 'string' && base.trim().length > 0 ? base : undefined;
}

export function reconcileProfileModels(args: {
  readonly discoveredModelIds: readonly string[];
  readonly userModelConfigs: readonly UserModelConfig[];
  readonly officialCatalogModelIds: ReadonlySet<string>;
  readonly officialCatalogDisplayNames?: ReadonlyMap<string, string>;
  readonly selectedModelIds: readonly string[];
  readonly defaultModelId?: string;
}): readonly ProfileModelItem[] {
  const discoveredIds = new Set(uniqueModelIds(args.discoveredModelIds));
  const userConfigsById = new Map(args.userModelConfigs.map((config) => [config.modelId, config] as const));
  const userConfigIds = new Set(userConfigsById.keys());
  const selectedIds = new Set(uniqueModelIds(args.selectedModelIds));
  const candidateIds = uniqueModelIds([
    ...discoveredIds,
    ...userConfigIds,
    ...args.officialCatalogModelIds,
  ]);

  return candidateIds.map((modelId) => {
    const userConfig = userConfigsById.get(modelId);
    const userConfigured = userConfig !== undefined;
    const catalogConfigured = args.officialCatalogModelIds.has(modelId);
    const displayName = resolvedProfileModelDisplayName({
      modelId,
      userConfig,
      officialCatalogDisplayNames: args.officialCatalogDisplayNames,
    });
    return {
      modelId,
      ...(displayName ? { displayName } : {}),
      ...(userConfig?.wireModelId ? { wireModelId: userConfig.wireModelId } : {}),
      discovered: discoveredIds.has(modelId),
      configured: userConfigured || catalogConfigured,
      selected: selectedIds.has(modelId),
      default: args.defaultModelId === modelId,
      ...(userConfigured ? { configSource: 'user' as const } : catalogConfigured ? { configSource: 'catalog' as const } : {}),
    };
  });
}

/**
 * 列出 provider profile 的模型项。纯本地读取，不发起网络请求。
 */
export async function listProfileModels(profileId: string): Promise<CommandResult<readonly ProfileModelItem[]>> {
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

  const cache = await getModelDiscoveryCacheRepository().get(profileId);
  const userConfigs = await getUserModelConfigRepository().list(profile.apiFormat);
  const items = reconcileProfileModels({
    discoveredModelIds: cache?.modelIds ?? [],
    userModelConfigs: userConfigs,
    officialCatalogModelIds: officialCatalogIds(profile),
    officialCatalogDisplayNames: officialCatalogDisplayNames(profile),
    selectedModelIds: profile.selectedModelIds,
    defaultModelId: profile.defaultModelId,
  });
  span.finish({
    count: items.length,
    discoveredCount: cache?.modelIds.length ?? 0,
    selectedCount: profile.selectedModelIds.length,
  });
  return { ok: true, value: items };
}

/**
 * 触发一次 model discovery 并把远端事实写入独立 discovery cache。
 */
export async function refreshProfileModels(profileId: string): Promise<CommandResult<readonly DiscoveredModel[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.model.refresh');

  const profile = await getProviderProfileRepository().get(profileId);
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

  let models: readonly DiscoveredModel[];
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
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, `Model discovery failed for profile "${profileId}".`), {
        profileId,
        apiFormat: profile.apiFormat,
      }),
    };
  }

  const modelIds = uniqueModelIds(models.map((model) => model.id));
  try {
    await getModelDiscoveryCacheRepository().put({
      profileId,
      modelIds,
      refreshedAt: new Date().toISOString(),
    });
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

  span.finish({
    persistedCount: modelIds.length,
  });
  return { ok: true, value: modelIds.map((id) => ({ id })) };
}
