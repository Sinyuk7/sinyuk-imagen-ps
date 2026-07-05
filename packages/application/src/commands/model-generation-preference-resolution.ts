import { createValidationError } from '@imagen-ps/core-engine';
import {
  getOfficialModelPreset,
  type ApiFormat,
  type ImageCatalogProviderId,
  type ImageOutputMatrix,
  type ImageOutputMatrixCell,
} from '@imagen-ps/providers';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';
import type {
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceSelection,
  ModelGenerationSettings,
  UserModelConfigRepository,
} from './types.js';

export function normalizeModelGenerationPreferenceKey(
  key: ModelGenerationPreferenceKey,
): ModelGenerationPreferenceKey {
  return {
    profileId: key.profileId.trim(),
    apiFormat: key.apiFormat,
    modelId: key.modelId.trim(),
    operation: key.operation,
  };
}

export function assertModelGenerationPreferenceKey(
  key: ModelGenerationPreferenceKey,
): ModelGenerationPreferenceKey {
  const normalized = normalizeModelGenerationPreferenceKey(key);
  if (normalized.profileId.length === 0) {
    throw createValidationError('Model generation preference requires profileId.', { ...normalized });
  }
  if (normalized.modelId.length === 0) {
    throw createValidationError('Model generation preference requires modelId.', { ...normalized });
  }
  return normalized;
}

export function catalogProviderIdForPreferenceApiFormat(apiFormat: ApiFormat): ImageCatalogProviderId {
  return catalogProviderIdForApiFormat(apiFormat);
}

export function matrixForModelGenerationPreferenceKey(
  key: ModelGenerationPreferenceKey,
  userConfig?: { readonly outputMatrix: readonly ImageOutputMatrix[] },
): ImageOutputMatrix {
  const matrixSource = userConfig?.outputMatrix ?? getOfficialModelPreset(key.apiFormat, key.modelId)?.outputMatrix;
  const matrix = matrixSource?.find((candidate) => candidate.operation === key.operation);
  if (matrix === undefined) {
    throw createValidationError(
      `Model "${key.modelId}" has no executable output matrix for "${key.operation}".`,
      { ...key },
    );
  }
  return matrix;
}

export function selectionFromMatrixCell(cell: ImageOutputMatrixCell): ModelGenerationPreferenceSelection {
  return {
    cellId: cell.id,
    imageSize: cell.imageSize,
    ratio: cell.ratio,
    outputFormat: cell.outputFormat,
  };
}

function defaultCell(matrix: ImageOutputMatrix, key: ModelGenerationPreferenceKey): ImageOutputMatrixCell {
  const cell = matrix.cells.find((candidate) => candidate.id === matrix.defaultCellId);
  if (cell === undefined) {
    throw createValidationError(
      `Model "${key.modelId}" output matrix defaultCellId "${matrix.defaultCellId}" is invalid.`,
      { ...key },
    );
  }
  return cell;
}

export function findMatrixCell(
  matrix: ImageOutputMatrix,
  selection: ModelGenerationPreferenceSelection,
): ImageOutputMatrixCell | undefined {
  return matrix.cells.find(
    (cell) =>
      cell.id === selection.cellId &&
      cell.imageSize === selection.imageSize &&
      cell.ratio === selection.ratio &&
      cell.outputFormat === selection.outputFormat,
  );
}

export function resolveModelGenerationSettingsValue(args: {
  readonly key: ModelGenerationPreferenceKey;
  readonly preference?: ModelGenerationPreference;
  readonly userConfig?: { readonly outputMatrix: readonly ImageOutputMatrix[] };
}): ModelGenerationSettings {
  const key = assertModelGenerationPreferenceKey(args.key);
  const matrix = matrixForModelGenerationPreferenceKey(key, args.userConfig);
  const preferredCell = args.preference === undefined ? undefined : findMatrixCell(matrix, args.preference);
  const cell = preferredCell ?? defaultCell(matrix, key);
  const selection = selectionFromMatrixCell(cell);
  const requestOutput = cell.requestOutput;

  return {
    key,
    matrix,
    preference: args.preference ?? null,
    selection,
    cell,
    requestOutput,
    source: preferredCell === undefined ? 'default' : 'preference',
  };
}

export async function resolveUserModelConfigForPreferenceKey(
  key: ModelGenerationPreferenceKey,
  repository: Pick<UserModelConfigRepository, 'get'>,
): Promise<{ readonly outputMatrix: readonly ImageOutputMatrix[] } | undefined> {
  return repository.get(key.apiFormat, key.modelId);
}
