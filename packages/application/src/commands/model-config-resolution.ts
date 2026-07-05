import { createValidationError } from '@imagen-ps/core-engine';
import {
  getOfficialModelPreset,
  resolveImageModelRule,
  getRequestStrategy,
  type ApiFormat,
  type ProviderModelExecution,
} from '@imagen-ps/providers';
import type { ProviderProfile, UserModelConfig, UserModelConfigRepository } from './types.js';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';

export interface ResolvedModelConfig {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly requestStrategyId: string;
  readonly output: UserModelConfig['output'];
  readonly source: 'user' | 'catalog';
}

function configuredModelError(profileId: string, apiFormat: ApiFormat, modelId: string): ReturnType<typeof createValidationError> {
  return createValidationError(
    `Provider profile "${profileId}" model "${modelId}" is not configured for apiFormat "${apiFormat}".`,
    { profileId, apiFormat, modelId },
  );
}

function assertStrategyMatchesApiFormat(args: {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly requestStrategyId: string;
}): void {
  const strategy = getRequestStrategy(args.requestStrategyId);
  if (strategy === undefined) {
    throw createValidationError(`Unknown requestStrategyId "${args.requestStrategyId}" for model "${args.modelId}".`, args);
  }
  if (strategy.apiFormat !== args.apiFormat) {
    throw createValidationError(
      `requestStrategyId "${args.requestStrategyId}" is not valid for apiFormat "${args.apiFormat}".`,
      { ...args, strategyApiFormat: strategy.apiFormat },
    );
  }
}

export async function resolveConfiguredModel(args: {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly userModelConfigRepository: Pick<UserModelConfigRepository, 'get'>;
}): Promise<ResolvedModelConfig> {
  const normalizedModelId = args.modelId.trim();
  const resolvedRule = resolveImageModelRule({
    providerId: catalogProviderIdForApiFormat(args.apiFormat),
    modelId: normalizedModelId,
  });
  const canonicalModelId = resolvedRule.concreteModelId;
  const userConfig = await args.userModelConfigRepository.get(args.apiFormat, canonicalModelId);
  if (userConfig !== undefined) {
    assertStrategyMatchesApiFormat({
      apiFormat: args.apiFormat,
      modelId: canonicalModelId,
      requestStrategyId: userConfig.requestStrategyId,
    });
    return {
      apiFormat: userConfig.apiFormat,
      modelId: userConfig.modelId,
      requestStrategyId: userConfig.requestStrategyId,
      output: userConfig.output,
      source: 'user',
    };
  }

  const officialPreset = getOfficialModelPreset(args.apiFormat, args.modelId);
  const canonicalPreset = canonicalModelId === normalizedModelId ? officialPreset : getOfficialModelPreset(args.apiFormat, canonicalModelId);
  const preset = officialPreset ?? canonicalPreset;
  if (preset !== undefined) {
    assertStrategyMatchesApiFormat({
      apiFormat: args.apiFormat,
      modelId: preset.modelId,
      requestStrategyId: preset.requestStrategyId,
    });
    return {
      apiFormat: preset.apiFormat,
      modelId: preset.modelId,
      requestStrategyId: preset.requestStrategyId,
      output: preset.output,
      source: 'catalog',
    };
  }

  throw configuredModelError(args.profileId, args.apiFormat, args.modelId);
}

export async function assertProfileModelSelectionIsConfigured(
  profile: Pick<ProviderProfile, 'profileId' | 'apiFormat' | 'selectedModelIds' | 'defaultModelId'>,
  userModelConfigRepository: Pick<UserModelConfigRepository, 'get'>,
): Promise<void> {
  for (const modelId of profile.selectedModelIds) {
    await resolveConfiguredModel({
      profileId: profile.profileId,
      apiFormat: profile.apiFormat,
      modelId,
      userModelConfigRepository,
    });
  }
  if (profile.defaultModelId !== undefined) {
    if (!profile.selectedModelIds.includes(profile.defaultModelId)) {
      throw createValidationError(
        `Provider profile "${profile.profileId}" defaultModelId must be included in selectedModelIds.`,
        {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
          defaultModelId: profile.defaultModelId,
        },
      );
    }
    await resolveConfiguredModel({
      profileId: profile.profileId,
      apiFormat: profile.apiFormat,
      modelId: profile.defaultModelId,
      userModelConfigRepository,
    });
  }
}

export function toProviderModelExecution(config: ResolvedModelConfig): ProviderModelExecution {
  return {
    apiFormat: config.apiFormat,
    modelId: config.modelId,
    requestStrategyId: config.requestStrategyId,
  };
}
