import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getRequestStrategy,
  getOfficialModelPreset,
  listOfficialModelPresets,
  listRequestStrategies,
} from '@imagen-ps/providers';
import { getRuntimeLogger, getUserModelConfigRepository } from '../runtime.js';
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
  const raw = input as unknown as { readonly output?: unknown };
  if (raw.output !== undefined) {
    throw createValidationError('User model config output must use preset outputMatrix subset, not old aggregate output.', {
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
    requestOutput: cell.requestOutput,
  };
}

function cloneMatrix(matrix: ImageOutputMatrix, cells: readonly ImageOutputMatrixCell[]): ImageOutputMatrix {
  const imageSizeIds = new Set(cells.map((cell) => cell.imageSize));
  const ratioIds = new Set(cells.map((cell) => cell.ratio));
  const outputFormatIds = new Set(cells.map((cell) => cell.outputFormat));
  return {
    operation: matrix.operation,
    imageSizes: matrix.imageSizes.filter((option) => imageSizeIds.has(option.id)),
    ratios: matrix.ratios.filter((option) => ratioIds.has(option.id)),
    outputFormats: matrix.outputFormats.filter((option) => outputFormatIds.has(option.id)),
    defaultCellId: cells.some((cell) => cell.id === matrix.defaultCellId) ? matrix.defaultCellId : cells[0]!.id,
    cells: cells.map(cloneCell),
  };
}

function validateMatrixSubset(args: {
  readonly input: SaveUserModelConfigInput;
  readonly preset: OfficialModelPreset;
}): readonly ImageOutputMatrix[] {
  const { input, preset } = args;
  if (input.outputMatrix.length === 0) {
    throw createValidationError(`Model "${input.modelId}" outputMatrix must not be empty.`, {
      apiFormat: input.apiFormat,
      modelId: input.modelId,
      baseModelId: input.baseModelId,
    });
  }

  const seenOperations = new Set<string>();
  return input.outputMatrix.map((matrix) => {
    if (seenOperations.has(matrix.operation)) {
      throw createValidationError(`Model "${input.modelId}" outputMatrix has duplicate operation "${matrix.operation}".`, {
        apiFormat: input.apiFormat,
        modelId: input.modelId,
        operation: matrix.operation,
      });
    }
    seenOperations.add(matrix.operation);

    const presetMatrix = preset.outputMatrix.find((candidate) => candidate.operation === matrix.operation);
    if (presetMatrix === undefined) {
      throw createValidationError(
        `Model "${input.modelId}" cannot add output matrix operation "${matrix.operation}" not present in preset "${preset.modelId}".`,
        { apiFormat: input.apiFormat, modelId: input.modelId, baseModelId: preset.modelId, operation: matrix.operation },
      );
    }
    if (matrix.cells.length === 0) {
      throw createValidationError(`Model "${input.modelId}" outputMatrix "${matrix.operation}" must keep at least one cell.`, {
        apiFormat: input.apiFormat,
        modelId: input.modelId,
        operation: matrix.operation,
      });
    }

    const presetCells = new Map(presetMatrix.cells.map((cell) => [cell.id, cell] as const));
    const selectedCells: ImageOutputMatrixCell[] = [];
    const seenCellIds = new Set<string>();
    for (const cell of matrix.cells) {
      if (seenCellIds.has(cell.id)) {
        continue;
      }
      const presetCell = presetCells.get(cell.id);
      if (presetCell === undefined) {
        throw createValidationError(
          `Model "${input.modelId}" cannot add unsupported output matrix cell "${cell.id}".`,
          { apiFormat: input.apiFormat, modelId: input.modelId, baseModelId: preset.modelId, operation: matrix.operation, cellId: cell.id },
        );
      }
      if (
        cell.imageSize !== presetCell.imageSize ||
        cell.ratio !== presetCell.ratio ||
        cell.outputFormat !== presetCell.outputFormat ||
        JSON.stringify(cell.requestOutput) !== JSON.stringify(presetCell.requestOutput)
      ) {
        throw createValidationError(
          `Model "${input.modelId}" cannot change preset output matrix cell "${cell.id}".`,
          { apiFormat: input.apiFormat, modelId: input.modelId, baseModelId: preset.modelId, operation: matrix.operation, cellId: cell.id },
        );
      }
      seenCellIds.add(cell.id);
      selectedCells.push(presetCell);
    }

    return cloneMatrix(presetMatrix, selectedCells);
  });
}

/**
 * 列出当前用户已保存的 model config；仅走 repository，不修改 profile 选择状态。
 */
export async function listUserModelConfigs(apiFormat?: ApiFormat): Promise<CommandResult<readonly UserModelConfig[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    ...(apiFormat ? { apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.list');

  const configs = await getUserModelConfigRepository().list(apiFormat);
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
  apiFormat: ApiFormat,
  modelId: string,
): Promise<CommandResult<UserModelConfig | null>> {
  const normalizedModelId = modelId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    ...(apiFormat ? { apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.get');

  if (normalizedModelId.length === 0) {
    span.fail({ message: 'Model config requires modelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires modelId.', { apiFormat, modelId }),
    };
  }

  const config = await getUserModelConfigRepository().get(apiFormat, normalizedModelId);
  span.finish({ found: config !== undefined });
  return { ok: true, value: config ?? null };
}

/**
 * 保存 user model config；只写 repository，不自动修改任何 profile 的 selected/default。
 */
export async function saveUserModelConfig(input: SaveUserModelConfigInput): Promise<CommandResult<UserModelConfig>> {
  const normalizedModelId = input.modelId.trim();
  const normalizedBaseModelId = input.baseModelId.trim();
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
  });
  const span = logger.startSpan('command.model_config.save');

  if (normalizedModelId.length === 0) {
    span.fail({ message: 'Model config requires modelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires modelId.', { apiFormat: input.apiFormat, modelId: input.modelId }),
    };
  }
  if (normalizedBaseModelId.length === 0) {
    span.fail({ message: 'Model config requires baseModelId.' });
    return {
      ok: false,
      error: createValidationError('Model config requires baseModelId.', { apiFormat: input.apiFormat, modelId: normalizedModelId }),
    };
  }

  try {
    assertNoOldAggregateOutput(input);
    const preset = getOfficialModelPreset(input.apiFormat, normalizedBaseModelId);
    if (preset === undefined) {
      throw createValidationError(
        `Model config baseModelId "${normalizedBaseModelId}" is not an official preset for apiFormat "${input.apiFormat}".`,
        { apiFormat: input.apiFormat, modelId: normalizedModelId, baseModelId: normalizedBaseModelId },
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
      apiFormat: input.apiFormat,
      modelId: normalizedModelId,
      requestStrategyId: input.requestStrategyId,
    });
    const outputMatrix = validateMatrixSubset({
      input: {
        ...input,
        modelId: normalizedModelId,
        baseModelId: normalizedBaseModelId,
      },
      preset,
    });
    const config: UserModelConfig = {
      apiFormat: input.apiFormat,
      modelId: normalizedModelId,
      baseModelId: normalizedBaseModelId,
      requestStrategyId: strategy.id,
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
