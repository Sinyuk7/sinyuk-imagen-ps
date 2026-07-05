import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getRequestStrategy,
  listOfficialModelPresets,
  listRequestStrategies,
  type ModelOutputConfig,
} from '@imagen-ps/providers';
import { getRuntimeLogger, getUserModelConfigRepository } from '../runtime.js';
import type {
  ApiFormat,
  CommandResult,
  OfficialModelPreset,
  RequestStrategy,
  SaveUserModelConfigInput,
  UserModelConfig,
} from './types.js';

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeOutput(output: ModelOutputConfig): ModelOutputConfig {
  return {
    aspectRatios: uniqueStrings(output.aspectRatios),
    sizes: uniqueStrings(output.sizes),
    outputFormats: uniqueStrings(output.outputFormats),
  };
}

function validateOutput(output: ModelOutputConfig, args: { readonly apiFormat: ApiFormat; readonly modelId: string }): ModelOutputConfig {
  const normalized = normalizeOutput(output);
  if (normalized.aspectRatios.length === 0) {
    throw createValidationError(`Model "${args.modelId}" output.aspectRatios must not be empty.`, args);
  }
  if (normalized.sizes.length === 0) {
    throw createValidationError(`Model "${args.modelId}" output.sizes must not be empty.`, args);
  }
  if (normalized.outputFormats.length === 0) {
    throw createValidationError(`Model "${args.modelId}" output.outputFormats must not be empty.`, args);
  }
  return normalized;
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

  try {
    assertStrategyMatchesApiFormat({
      apiFormat: input.apiFormat,
      modelId: normalizedModelId,
      requestStrategyId: input.requestStrategyId,
    });
    const output = validateOutput(input.output, {
      apiFormat: input.apiFormat,
      modelId: normalizedModelId,
    });
    const config: UserModelConfig = {
      apiFormat: input.apiFormat,
      modelId: normalizedModelId,
      requestStrategyId: input.requestStrategyId,
      output,
    };
    await getUserModelConfigRepository().save(config);
    span.finish({
      requestStrategyId: config.requestStrategyId,
      aspectRatios: config.output.aspectRatios.length,
      sizes: config.output.sizes.length,
      outputFormats: config.output.outputFormats.length,
    });
    return { ok: true, value: config };
  } catch (error) {
    span.fail(error);
    if (
      typeof error === 'object' &&
      error !== null &&
      typeof (error as { readonly category?: unknown }).category === 'string'
    ) {
      return { ok: false, error: error as ReturnType<typeof createValidationError> };
    }
    throw error;
  }
}
