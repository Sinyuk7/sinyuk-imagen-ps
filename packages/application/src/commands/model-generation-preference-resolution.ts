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
import { resolveConfiguredModel } from './model-config-resolution.js';
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

function ratioMagnitude(ratio: ImageAspectRatio): number | undefined {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match) {
    return undefined;
  }
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? numerator / denominator : undefined;
}

function ratioDistance(left: ImageAspectRatio, right: ImageAspectRatio): number {
  if (left === right) {
    return 0;
  }
  const leftMagnitude = ratioMagnitude(left);
  const rightMagnitude = ratioMagnitude(right);
  if (leftMagnitude === undefined || rightMagnitude === undefined) {
    return 1;
  }
  return Math.abs(Math.log(leftMagnitude / rightMagnitude));
}

function closestMatrixCell(
  matrix: ImageOutputMatrix,
  selection: ImageOutputSelection,
  key: ModelGenerationPreferenceKey,
): ImageOutputMatrixCell {
  const fallback = defaultCell(matrix, key);
  const imageSize = sizeIdForSelection(selection);
  const ratio = ratioForSelection(selection);
  const outputFormat = selection.outputFormat;
  return matrix.cells.reduce((best, candidate) => {
    const score =
      (candidate.imageSize === imageSize ? 0 : 1000) +
      ratioDistance(candidate.ratio, ratio) * 10 +
      (candidate.outputFormat === outputFormat ? 0 : 1);
    const bestScore =
      (best.imageSize === imageSize ? 0 : 1000) +
      ratioDistance(best.ratio, ratio) * 10 +
      (best.outputFormat === outputFormat ? 0 : 1);
    return score < bestScore ? candidate : best;
  }, fallback);
}

export function resolveModelGenerationSettingsValue(args: {
  readonly key: ModelGenerationPreferenceKey;
  readonly preference?: ModelGenerationPreference;
  readonly inheritedPreference?: ModelGenerationPreference;
  readonly userConfig?: { readonly outputMatrix: readonly ImageOutputMatrix[] };
}): ModelGenerationSettings {
  const key = assertModelGenerationPreferenceKey(args.key);
  const matrix = matrixForModelGenerationPreferenceKey(key, args.userConfig);
  const candidatePreference = args.preference ?? args.inheritedPreference;
  const preferredProjection = candidatePreference === undefined
    ? undefined
    : effectiveSelectionForOperation(candidatePreference.selection, key.operation);
  const preferredCell = preferredProjection === undefined ? undefined : findMatrixCell(matrix, preferredProjection.effectiveSelection);
  const inheritedCell = args.preference === undefined && preferredProjection !== undefined
    ? closestMatrixCell(matrix, preferredProjection.effectiveSelection, key)
    : undefined;
  const cell = preferredCell ?? inheritedCell ?? defaultCell(matrix, key);
  const storedSelection = preferredCell === undefined ? cell.selection : candidatePreference!.selection;
  const effective = effectiveSelectionForOperation(storedSelection, key.operation);
  const selection = projectSelectionToUi(storedSelection, effective.effectiveSelection, effective.normalized);

  return {
    key,
    matrix,
    preference: args.preference ?? null,
    selection,
    cell,
    source: preferredCell !== undefined
      ? args.preference === undefined ? 'inherited' : 'preference'
      : inheritedCell !== undefined ? 'inherited' : 'default',
  };
}

export async function resolveUserModelConfigForPreferenceKey(
  key: ModelGenerationPreferenceKey,
  repository: Pick<UserModelConfigRepository, 'get'>,
): Promise<{ readonly outputMatrix: readonly ImageOutputMatrix[] } | undefined> {
  const stored = await repository.get(key.profileId, key.modelId);
  if (stored === undefined) {
    return undefined;
  }
  return resolveConfiguredModel({
    profileId: key.profileId,
    apiFormat: key.apiFormat,
    modelId: key.modelId,
    userModelConfigRepository: repository,
  });
}
