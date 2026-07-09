import { createValidationError } from '@imagen-ps/core-engine';
import {
  getRequestStrategy,
  type ApiFormat,
  type ImageOutputMatrix,
  type ProviderModelExecution,
  type UserModelOutputExposure,
} from '@imagen-ps/providers';
import type { UserModelConfigRepository } from './types.js';

export interface ResolvedModelConfig {
  readonly apiFormat: ApiFormat;
  readonly configModelId: string;
  readonly capabilityModelId: string;
  readonly wireModelId: string;
  readonly requestStrategyId: string;
  readonly outputExposure: UserModelOutputExposure;
  readonly outputMatrix: readonly ImageOutputMatrix[];
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
  const userConfig = await args.userModelConfigRepository.get(args.profileId, normalizedModelId);
  if (userConfig !== undefined) {
    if (userConfig.apiFormat !== args.apiFormat) {
      throw createValidationError(
        `Provider profile "${args.profileId}" model "${normalizedModelId}" apiFormat "${userConfig.apiFormat}" does not match profile apiFormat "${args.apiFormat}".`,
        { profileId: args.profileId, apiFormat: args.apiFormat, modelId: normalizedModelId, configApiFormat: userConfig.apiFormat },
      );
    }
    assertStrategyMatchesApiFormat({
      apiFormat: args.apiFormat,
      modelId: normalizedModelId,
      requestStrategyId: userConfig.requestStrategyId,
    });
    return {
      apiFormat: userConfig.apiFormat,
      configModelId: userConfig.modelId,
      capabilityModelId: userConfig.baseModelId,
      wireModelId: userConfig.wireModelId,
      requestStrategyId: userConfig.requestStrategyId,
      outputExposure: userConfig.outputExposure,
      outputMatrix: userConfig.outputMatrix,
      source: 'user',
    };
  }

  throw configuredModelError(args.profileId, args.apiFormat, args.modelId);
}

export function toProviderModelExecution(config: ResolvedModelConfig): ProviderModelExecution {
  return {
    apiFormat: config.apiFormat,
    modelId: config.wireModelId,
    requestStrategyId: config.requestStrategyId,
  };
}
