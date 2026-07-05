import { createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getModelGenerationPreferenceRepository,
  getRuntimeLogger,
  getUserModelConfigRepository,
} from '../runtime.js';
import {
  assertModelGenerationPreferenceKey,
  findMatrixCell,
  matrixForModelGenerationPreferenceKey,
  resolveModelGenerationSettingsValue,
  resolveUserModelConfigForPreferenceKey,
} from './model-generation-preference-resolution.js';
import type {
  CommandResult,
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationSettings,
  SaveModelGenerationPreferenceInput,
} from './types.js';

function preferenceFromInput(input: SaveModelGenerationPreferenceInput): ModelGenerationPreference {
  const key = assertModelGenerationPreferenceKey(input);
  return {
    ...key,
    cellId: input.cellId.trim(),
    imageSize: input.imageSize,
    ratio: input.ratio,
    outputFormat: input.outputFormat,
  };
}

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
  return createValidationError('Model generation preference command failed.', { cause: String(error) });
}

export async function getModelGenerationSettings(
  keyInput: ModelGenerationPreferenceKey,
): Promise<CommandResult<ModelGenerationSettings>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: keyInput.profileId,
  });
  const span = logger.startSpan('command.model_generation_settings.get');

  try {
    const key = assertModelGenerationPreferenceKey(keyInput);
    const preference = await getModelGenerationPreferenceRepository().get(key);
    const userConfig = await resolveUserModelConfigForPreferenceKey(key, getUserModelConfigRepository());
    const value = resolveModelGenerationSettingsValue({ key, preference, userConfig });
    span.finish({ source: value.source, cellId: value.selection.cellId });
    return { ok: true, value };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: commandError(error) };
  }
}

export async function saveModelGenerationPreference(
  input: SaveModelGenerationPreferenceInput,
): Promise<CommandResult<ModelGenerationPreference>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId,
  });
  const span = logger.startSpan('command.model_generation_settings.save');

  try {
    const preference = preferenceFromInput(input);
    const userConfig = await resolveUserModelConfigForPreferenceKey(preference, getUserModelConfigRepository());
    const matrix = matrixForModelGenerationPreferenceKey(preference, userConfig);
    const cell = findMatrixCell(matrix, preference);
    if (cell === undefined) {
      throw createValidationError(
        `Model "${preference.modelId}" output selection "${preference.cellId}" is not valid for "${preference.operation}".`,
        { ...preference },
      );
    }
    await getModelGenerationPreferenceRepository().save(preference);
    span.finish({ cellId: preference.cellId });
    return { ok: true, value: preference };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: commandError(error) };
  }
}

export async function deleteModelGenerationPreference(
  keyInput: ModelGenerationPreferenceKey,
): Promise<CommandResult<null>> {
  try {
    await getModelGenerationPreferenceRepository().delete(assertModelGenerationPreferenceKey(keyInput));
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: commandError(error) };
  }
}
