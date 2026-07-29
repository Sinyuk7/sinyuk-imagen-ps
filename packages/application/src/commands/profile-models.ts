/**
 * Profile model commands.
 *
 * `listProfileModels()` only lists persisted profile-owned configured models.
 */

import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getProviderProfileRepository,
  getRuntime,
  getRuntimeLogger,
  getUserModelConfigRepository,
} from '../runtime.js';
import type { CommandResult, ProfileModelItem, ProviderProfile, UserModelConfig } from './types.js';
import { listOfficialModelPresets } from '@imagen-ps/providers';

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
  readonly userModelConfigs: readonly UserModelConfig[];
  readonly officialCatalogDisplayNames?: ReadonlyMap<string, string>;
}): readonly ProfileModelItem[] {
  const userConfigsById = new Map(args.userModelConfigs.map((config) => [config.modelId, config] as const));
  const candidateIds = uniqueModelIds(args.userModelConfigs.map((config) => config.modelId));

  return candidateIds.map((modelId) => {
    const userConfig = userConfigsById.get(modelId);
    const displayName = resolvedProfileModelDisplayName({
      modelId,
      userConfig,
      officialCatalogDisplayNames: args.officialCatalogDisplayNames,
    });
    return {
      modelId,
      ...(displayName ? { displayName } : {}),
      ...(userConfig?.wireModelId ? { wireModelId: userConfig.wireModelId } : {}),
      discovered: false,
      configured: true,
      configSource: 'user' as const,
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

  const userConfigs = await getUserModelConfigRepository().list(profileId);
  const items = reconcileProfileModels({
    userModelConfigs: userConfigs,
    officialCatalogDisplayNames: officialCatalogDisplayNames(profile),
  });
  span.finish({
    count: items.length,
  });
  return { ok: true, value: items };
}
