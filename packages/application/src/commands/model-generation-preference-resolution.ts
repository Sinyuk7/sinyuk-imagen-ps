import { createValidationError } from '@imagen-ps/core-engine';
import {
  getOfficialModelPreset,
  type ApiFormat,
  type ImageCatalogProviderId,
  type ImageAspectRatio,
  type ImageOutputImageSize,
  type ImageOutputMatrix,
  type ImageOutputMatrixCell,
  type ImageOutputSelection,
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
      `Model "${key.modelId}" has no executable output configuration for "${key.operation}".`,
      { ...key },
    );
  }
  return matrix;
}

export function selectionFromMatrixCell(cell: ImageOutputMatrixCell): ModelGenerationPreferenceSelection {
  return projectSelectionToUi(cell.selection, cell.selection);
}

function sizeIdForSelection(selection: ImageOutputSelection): ImageOutputImageSize {
  switch (selection.geometry.kind) {
    case 'provider-default':
      return 'auto';
    case 'input-derived':
      return 'use-input-size';
    case 'ratio-resolution':
      return selection.geometry.resolution;
    case 'pixels':
      if (selection.geometry.width >= 3840 || selection.geometry.height >= 3840) {
        return '4k';
      }
      if (selection.geometry.width >= 2048 || selection.geometry.height >= 2048) {
        return '2k';
      }
      return '1k';
  }
}

function ratioForSelection(selection: ImageOutputSelection): ImageAspectRatio {
  switch (selection.geometry.kind) {
    case 'ratio-resolution':
      return selection.geometry.aspectRatio;
    case 'input-derived':
      return 'source';
    case 'provider-default':
    case 'pixels':
      return 'auto';
  }
}

function effectiveSelectionForOperation(
  selection: ImageOutputSelection,
  operation: ModelGenerationPreferenceKey['operation'],
): { readonly effectiveSelection: ImageOutputSelection; readonly normalized: boolean } {
  if (selection.geometry.kind === 'input-derived' && operation === 'text_to_image') {
    return {
      effectiveSelection: {
        geometry: { kind: 'provider-default' },
        outputFormat: selection.outputFormat,
      },
      normalized: true,
    };
  }
  return {
    effectiveSelection: selection,
    normalized: false,
  };
}

function projectSelectionToUi(
  storedSelection: ImageOutputSelection,
  effectiveSelection: ImageOutputSelection,
  normalized = false,
): ModelGenerationPreferenceSelection {
  return {
    selection: storedSelection,
    effectiveSelection,
    imageSize: sizeIdForSelection(effectiveSelection),
    ratio: ratioForSelection(effectiveSelection),
    outputFormat: effectiveSelection.outputFormat,
    normalized,
  };
}

function defaultCell(matrix: ImageOutputMatrix, key: ModelGenerationPreferenceKey): ImageOutputMatrixCell {
  const cell = matrix.cells.find((candidate) => candidate.id === matrix.defaultCellId);
  if (cell === undefined) {
    throw createValidationError(
      `Model "${key.modelId}" output configuration default entry "${matrix.defaultCellId}" is invalid.`,
      { ...key },
    );
  }
  return cell;
}

export function findMatrixCell(
  matrix: ImageOutputMatrix,
  selection: ImageOutputSelection,
): ImageOutputMatrixCell | undefined {
  const imageSize = sizeIdForSelection(selection);
  const ratio = ratioForSelection(selection);
  const outputFormat = selection.outputFormat;
  return matrix.cells.find(
    (cell) =>
      cell.imageSize === imageSize &&
      cell.ratio === ratio &&
      cell.outputFormat === outputFormat,
  );
}

export function resolveModelGenerationSettingsValue(args: {
  readonly key: ModelGenerationPreferenceKey;
  readonly preference?: ModelGenerationPreference;
  readonly userConfig?: { readonly outputMatrix: readonly ImageOutputMatrix[] };
}): ModelGenerationSettings {
  const key = assertModelGenerationPreferenceKey(args.key);
  const matrix = matrixForModelGenerationPreferenceKey(key, args.userConfig);
  const preferredProjection = args.preference === undefined
    ? undefined
    : effectiveSelectionForOperation(args.preference.selection, key.operation);
  const preferredCell = preferredProjection === undefined ? undefined : findMatrixCell(matrix, preferredProjection.effectiveSelection);
  const cell = preferredCell ?? defaultCell(matrix, key);
  const storedSelection = args.preference?.selection ?? cell.selection;
  const effective = effectiveSelectionForOperation(storedSelection, key.operation);
  const selection = projectSelectionToUi(storedSelection, effective.effectiveSelection, effective.normalized);

  return {
    key,
    matrix,
    preference: args.preference ?? null,
    selection,
    cell,
    source: preferredCell === undefined ? 'default' : 'preference',
  };
}

export async function resolveUserModelConfigForPreferenceKey(
  key: ModelGenerationPreferenceKey,
  repository: Pick<UserModelConfigRepository, 'get'>,
): Promise<{ readonly outputMatrix: readonly ImageOutputMatrix[] } | undefined> {
  return repository.get(key.profileId, key.modelId);
}
