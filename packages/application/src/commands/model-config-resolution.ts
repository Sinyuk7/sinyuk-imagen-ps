import { createValidationError } from '@imagen-ps/core-engine';
import {
  getOfficialModelPreset,
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

function projectOutputMatrixForWireModel(args: {
  readonly apiFormat: ApiFormat;
  readonly wireModelId: string;
  readonly configuredMatrix: readonly ImageOutputMatrix[];
}): readonly ImageOutputMatrix[] | undefined {
  const wirePreset = getOfficialModelPreset(args.apiFormat, args.wireModelId);
  if (wirePreset === undefined) {
    return undefined;
  }

  return args.configuredMatrix.map((configured) => {
    const wireMatrix = wirePreset.outputMatrix.find((candidate) => candidate.operation === configured.operation);
    if (wireMatrix === undefined) {
      throw createValidationError(
        `Wire model "${args.wireModelId}" does not support output operation "${configured.operation}".`,
        { apiFormat: args.apiFormat, wireModelId: args.wireModelId, operation: configured.operation },
      );
    }
    const wireCellIds = new Set(wireMatrix.cells.map((cell) => cell.id));
    const cells = configured.cells.filter((cell) => wireCellIds.has(cell.id));
    if (cells.length === 0) {
      throw createValidationError(
        `Configured output for wire model "${args.wireModelId}" has no supported entries for "${configured.operation}".`,
        { apiFormat: args.apiFormat, wireModelId: args.wireModelId, operation: configured.operation },
      );
    }
    const imageSizeIds = new Set(cells.map((cell) => cell.imageSize));
    const ratioIds = new Set(cells.map((cell) => cell.ratio));
    const outputFormatIds = new Set(cells.map((cell) => cell.outputFormat));
    return {
      ...configured,
      imageSizes: configured.imageSizes.filter((option) => imageSizeIds.has(option.id)),
      ratios: configured.ratios.filter((option) => ratioIds.has(option.id)),
      outputFormats: configured.outputFormats.filter((option) => outputFormatIds.has(option.id)),
      defaultCellId: cells.some((cell) => cell.id === configured.defaultCellId)
        ? configured.defaultCellId
        : cells[0]!.id,
      cells,
    };
  });
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
    const wirePreset = getOfficialModelPreset(args.apiFormat, userConfig.wireModelId);
    const wireOutputMatrix = projectOutputMatrixForWireModel({
      apiFormat: args.apiFormat,
      wireModelId: userConfig.wireModelId,
      configuredMatrix: userConfig.outputMatrix,
    });
    return {
      apiFormat: userConfig.apiFormat,
      configModelId: userConfig.modelId,
      capabilityModelId: wirePreset?.modelId ?? userConfig.baseModelId,
      wireModelId: userConfig.wireModelId,
      requestStrategyId: userConfig.requestStrategyId,
      outputExposure: userConfig.outputExposure,
      outputMatrix: wireOutputMatrix ?? userConfig.outputMatrix,
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
