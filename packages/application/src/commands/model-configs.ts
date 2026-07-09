import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getRequestStrategy,
  getOfficialModelPreset,
  listOfficialModelPresets,
  listRequestStrategies,
} from '@imagen-ps/providers';
import { getProviderProfileRepository, getRuntimeLogger, getUserModelConfigRepository } from '../runtime.js';
import type {
  ApiFormat,
  CommandResult,
  ImageOutputMatrix,
  ImageOutputMatrixCell,
  OfficialModelPreset,
  RequestStrategy,
  SaveUserModelConfigInput,
  UserModelConfig,
} from './types.js';

function commandError(error: unknown): ReturnType<typeof createValidationError> {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { readonly category?: unknown }).category === 'string'
  ) {
    return error as ReturnType<typeof createValidationError>;
  }
  if (error instanceof Error) {
    return createValidationError(error.message, { name: error.name });
  }
  return createValidationError('Model config command failed.', { cause: String(error) });
}

function assertNoOldAggregateOutput(input: SaveUserModelConfigInput): void {
  const raw = input as unknown as { readonly output?: unknown; readonly outputMatrix?: unknown };
  if (raw.output !== undefined || raw.outputMatrix !== undefined) {
    throw createValidationError('User model config output must use exposure rules, not old aggregate output or authored outputMatrix.', {
      apiFormat: input.apiFormat,
      modelId: input.modelId,
    });
  }
}

function assertStrategyMatchesApiFormat(args: {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly requestStrategyId: string;
}): RequestStrategy {
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
  return strategy;
}

function cloneCell(cell: ImageOutputMatrixCell): ImageOutputMatrixCell {
  return {
    id: cell.id,
    imageSize: cell.imageSize,
    ratio: cell.ratio,
    outputFormat: cell.outputFormat,
    selection: cell.selection,
  };
}

function cloneMatrix(matrix: ImageOutputMatrix, cells: readonly ImageOutputMatrixCell[]): ImageOutputMatrix {
  const imageSizeIds = new Set(cells.map((cell) => cell.imageSize));
  const ratioIds = new Set(cells.map((cell) => cell.ratio));
  const outputFormatIds = new Set(cells.map((cell) => cell.outputFormat));
  return {
    operation: matrix.operation,
    archetype: matrix.archetype,
    geometryKind: matrix.geometryKind,
    imageSizes: matrix.imageSizes.filter((option) => imageSizeIds.has(option.id)),
    ratios: matrix.ratios.filter((option) => ratioIds.has(option.id)),
    outputFormats: matrix.outputFormats.filter((option) => outputFormatIds.has(option.id)),
    defaultCellId: cells.some((cell) => cell.id === matrix.defaultCellId) ? matrix.defaultCellId : cells[0]!.id,
    cells: cells.map(cloneCell),
  };
}

function cellMatchesExposure(
  cell: ImageOutputMatrixCell,
  exposure: SaveUserModelConfigInput['outputExposure'],
): boolean {
  if (exposure.kind === 'flexible-pixels') {
    if (!exposure.outputFormats.includes(cell.outputFormat)) {
      return false;
    }
    if (cell.selection.geometry.kind === 'input-derived') {
      return exposure.allowInputDerivedExactSize && exposure.sizePresetIds.includes('use-input-size');
    }
    return exposure.sizePresetIds.includes(cell.imageSize);
  }

  if (!exposure.outputFormats.includes(cell.outputFormat)) {
    return false;
  }
  if (cell.selection.geometry.kind === 'provider-default') {
    return true;
  }
  if (cell.selection.geometry.kind !== 'ratio-resolution') {
    return false;
  }
  return (
    exposure.aspectRatios.includes(cell.selection.geometry.aspectRatio) &&
    exposure.resolutions.includes(cell.selection.geometry.resolution)
  );
}

function deriveOutputMatrixFromExposure(args: {
  readonly modelId: string;
  readonly preset: OfficialModelPreset;
  readonly exposure: SaveUserModelConfigInput['outputExposure'];
}): readonly ImageOutputMatrix[] {
  return args.preset.outputMatrix.map((presetMatrix) => {
    const selectedCells = presetMatrix.cells.filter((cell) => cellMatchesExposure(cell, args.exposure));
    if (selectedCells.length === 0) {
      throw createValidationError(`Model "${args.modelId}" output operation "${presetMatrix.operation}" must keep at least one exposed entry.`, {
        apiFormat: args.preset.apiFormat,
        modelId: args.modelId,
        baseModelId: args.preset.modelId,
        operation: presetMatrix.operation,
      });
    }
    return cloneMatrix(presetMatrix, selectedCells);
  });
}

function validateExposure(args: {
  readonly input: SaveUserModelConfigInput;
  readonly preset: OfficialModelPreset;
}): SaveUserModelConfigInput['outputExposure'] {
  const { input, preset } = args;
  const exposure = input.outputExposure;
  if (exposure.kind !== preset.outputExposure.kind) {
    throw createValidationError(
      `Model "${input.modelId}" output exposure kind must match preset "${preset.modelId}".`,
      { apiFormat: input.apiFormat, modelId: input.modelId, baseModelId: preset.modelId, exposureKind: exposure.kind },
    );
  }
  if (exposure.kind === 'flexible-pixels' && preset.outputExposure.kind === 'flexible-pixels') {
    const presetSizes = new Set(preset.outputExposure.sizePresetIds);
    const presetFormats = new Set(preset.outputExposure.outputFormats);
    for (const id of exposure.sizePresetIds) {
      if (!presetSizes.has(id)) {
        throw createValidationError(`Model "${input.modelId}" cannot expose unsupported output size "${id}".`, { id });
      }
    }
    for (const format of exposure.outputFormats) {
      if (!presetFormats.has(format)) {
        throw createValidationError(`Model "${input.modelId}" cannot expose unsupported output format "${format}".`, { format });
      }
    }
    return {
      kind: 'flexible-pixels',
      sizePresetIds: preset.outputExposure.sizePresetIds.filter((id) => exposure.sizePresetIds.includes(id)),
      outputFormats: preset.outputExposure.outputFormats.filter((format) => exposure.outputFormats.includes(format)),
      allowInputDerivedExactSize: Boolean(exposure.allowInputDerivedExactSize && preset.outputExposure.allowInputDerivedExactSize),
    };
  }
  if (exposure.kind === 'ratio-resolution' && preset.outputExposure.kind === 'ratio-resolution') {
    const presetRatios = new Set(preset.outputExposure.aspectRatios);
    const presetResolutions = new Set(preset.outputExposure.resolutions);
    const presetFormats = new Set(preset.outputExposure.outputFormats);
    for (const ratio of exposure.aspectRatios) {
      if (!presetRatios.has(ratio)) {
        throw createValidationError(`Model "${input.modelId}" cannot expose unsupported aspect ratio "${ratio}".`, { ratio });
      }
    }
    for (const resolution of exposure.resolutions) {
      if (!presetResolutions.has(resolution)) {
        throw createValidationError(`Model "${input.modelId}" cannot expose unsupported resolution "${resolution}".`, { resolution });
      }
    }
    for (const format of exposure.outputFormats) {
      if (!presetFormats.has(format)) {
        throw createValidationError(`Model "${input.modelId}" cannot expose unsupported output format "${format}".`, { format });
      }
    }
    return {
      kind: 'ratio-resolution',
      aspectRatios: preset.outputExposure.aspectRatios.filter((ratio) => exposure.aspectRatios.includes(ratio)),
      resolutions: preset.outputExposure.resolutions.filter((resolution) => exposure.resolutions.includes(resolution)),
      outputFormats: preset.outputExposure.outputFormats.filter((format) => exposure.outputFormats.includes(format)),
    };
  }
  return exposure;
}

/**
 * 列出当前 profile 已保存的 model config；仅走 repository。
 */
export async function listUserModelConfigs(profileId: string): Promise<CommandResult<readonly UserModelConfig[]>> {
  const normalizedProfileId = profileId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: normalizedProfileId,
  });
  const span = logger.startSpan('command.model_config.list');

  if (normalizedProfileId.length === 0) {
    span.fail({ message: 'Model config requires profileId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires profileId.', { profileId }),
    };
  }
  const profile = await getProviderProfileRepository().get(normalizedProfileId);
  if (!profile) {
    span.fail({ message: 'profile not found' });
    return {
      ok: false,
      error: createValidationError('profile not found', { profileId: normalizedProfileId }),
    };
  }

  const configs = await getUserModelConfigRepository().list(normalizedProfileId);
  span.finish({ count: configs.length });
  return { ok: true, value: configs };
}

/**
 * 列出某个 apiFormat 下可供 editor 选择的官方 preset。
 */
export async function listOfficialModelConfigPresets(apiFormat: ApiFormat): Promise<CommandResult<readonly OfficialModelPreset[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    ...(apiFormat ? { apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.list_presets');

  const presets = listOfficialModelPresets(apiFormat);
  span.finish({ count: presets.length });
  return { ok: true, value: presets };
}

/**
 * 列出某个 apiFormat 下可用 request strategy，供 editor 展示与校验。
 */
export async function listRequestStrategiesForApiFormat(apiFormat: ApiFormat): Promise<CommandResult<readonly RequestStrategy[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    ...(apiFormat ? { apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.list_strategies');

  const strategies = listRequestStrategies(apiFormat);
  span.finish({ count: strategies.length });
  return { ok: true, value: strategies };
}

/**
 * 读取单个已保存 user model config。
 */
export async function getUserModelConfig(
  profileId: string,
  modelId: string,
): Promise<CommandResult<UserModelConfig | null>> {
  const normalizedProfileId = profileId.trim();
  const normalizedModelId = modelId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: normalizedProfileId,
  });
  const span = logger.startSpan('command.model_config.get');

  if (normalizedProfileId.length === 0) {
    span.fail({ message: 'Model config requires profileId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires profileId.', { profileId }),
    };
  }
  if (normalizedModelId.length === 0) {
    span.fail({ message: 'Model config requires modelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires modelId.', { profileId: normalizedProfileId, modelId }),
    };
  }
  const profile = await getProviderProfileRepository().get(normalizedProfileId);
  if (!profile) {
    span.fail({ message: 'profile not found' });
    return {
      ok: false,
      error: createValidationError('profile not found', { profileId: normalizedProfileId }),
    };
  }

  const config = await getUserModelConfigRepository().get(normalizedProfileId, normalizedModelId);
  span.finish({ found: config !== undefined });
  return { ok: true, value: config ?? null };
}

/**
 * 删除单个 user model config。
 */
export async function deleteUserModelConfig(
  profileId: string,
  modelId: string,
): Promise<CommandResult<null>> {
  const normalizedProfileId = profileId.trim();
  const normalizedModelId = modelId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: normalizedProfileId,
  });
  const span = logger.startSpan('command.model_config.delete');

  if (normalizedProfileId.length === 0) {
    span.fail({ message: 'Model config requires profileId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires profileId.', { profileId }),
    };
  }
  if (normalizedModelId.length === 0) {
    span.fail({ message: 'Model config requires modelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires modelId.', { profileId: normalizedProfileId, modelId }),
    };
  }
  const profile = await getProviderProfileRepository().get(normalizedProfileId);
  if (!profile) {
    span.fail({ message: 'profile not found' });
    return {
      ok: false,
      error: createValidationError('profile not found', { profileId: normalizedProfileId }),
    };
  }

  await getUserModelConfigRepository().delete(normalizedProfileId, normalizedModelId);
  span.finish({ modelId: normalizedModelId });
  return { ok: true, value: null };
}

/**
 * 保存 profile-owned user model config；保存本身即 ownership。
 */
export async function saveUserModelConfig(input: SaveUserModelConfigInput): Promise<CommandResult<UserModelConfig>> {
  const normalizedProfileId = input.profileId.trim();
  const normalizedModelId = input.modelId.trim();
  const normalizedBaseModelId = input.baseModelId.trim();
  const normalizedWireModelId = input.wireModelId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: normalizedProfileId,
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.save');

  if (normalizedProfileId.length === 0) {
    span.fail({ message: 'Model config requires profileId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires profileId.', { profileId: input.profileId }),
    };
  }
  if (normalizedModelId.length === 0) {
    span.fail({ message: 'Model config requires modelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires modelId.', {
        profileId: normalizedProfileId,
        apiFormat: input.apiFormat,
        modelId: input.modelId,
      }),
    };
  }
  if (normalizedBaseModelId.length === 0) {
    span.fail({ message: 'Model config requires baseModelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires baseModelId.', { apiFormat: input.apiFormat, modelId: normalizedModelId }),
    };
  }
  if (normalizedWireModelId.length === 0) {
    span.fail({ message: 'Model config requires wireModelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires wireModelId.', {
        apiFormat: input.apiFormat,
        modelId: normalizedModelId,
        wireModelId: input.wireModelId,
      }),
    };
  }

  try {
    const profile = await getProviderProfileRepository().get(normalizedProfileId);
    if (!profile) {
      throw createValidationError('profile not found', { profileId: normalizedProfileId });
    }
    if (profile.apiFormat !== input.apiFormat) {
      throw createValidationError(
        `Model config apiFormat "${input.apiFormat}" must match provider profile "${normalizedProfileId}" apiFormat "${profile.apiFormat}".`,
        { profileId: normalizedProfileId, apiFormat: input.apiFormat, profileApiFormat: profile.apiFormat },
      );
    }
    assertNoOldAggregateOutput(input);
    const preset = getOfficialModelPreset(profile.apiFormat, normalizedBaseModelId);
    if (preset === undefined) {
      throw createValidationError(
        `Model config baseModelId "${normalizedBaseModelId}" is not an official preset for apiFormat "${profile.apiFormat}".`,
        { profileId: normalizedProfileId, apiFormat: profile.apiFormat, modelId: normalizedModelId, baseModelId: normalizedBaseModelId },
      );
    }
    if (input.requestStrategyId !== preset.requestStrategyId) {
      throw createValidationError(
        `Model "${normalizedModelId}" requestStrategyId must match official preset "${normalizedBaseModelId}".`,
        {
          apiFormat: input.apiFormat,
          modelId: normalizedModelId,
          baseModelId: normalizedBaseModelId,
          requestStrategyId: input.requestStrategyId,
          presetRequestStrategyId: preset.requestStrategyId,
        },
      );
    }
    const strategy = assertStrategyMatchesApiFormat({
      apiFormat: profile.apiFormat,
      modelId: normalizedModelId,
      requestStrategyId: input.requestStrategyId,
    });
    const outputExposure = validateExposure({
      input: {
        ...input,
        modelId: normalizedModelId,
        baseModelId: normalizedBaseModelId,
        wireModelId: normalizedWireModelId,
      },
      preset,
    });
    const outputMatrix = deriveOutputMatrixFromExposure({
      modelId: normalizedModelId,
      preset,
      exposure: outputExposure,
    });
    const config: UserModelConfig = {
      profileId: normalizedProfileId,
      apiFormat: profile.apiFormat,
      modelId: normalizedModelId,
      baseModelId: normalizedBaseModelId,
      wireModelId: normalizedWireModelId,
      requestStrategyId: strategy.id,
      outputExposure,
      outputMatrix,
    };
    await getUserModelConfigRepository().save(config);
    span.finish({
      requestStrategyId: config.requestStrategyId,
      operationCount: config.outputMatrix.length,
      cellCount: config.outputMatrix.reduce((sum, matrix) => sum + matrix.cells.length, 0),
    });
    return { ok: true, value: config };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: commandError(error) };
  }
}
