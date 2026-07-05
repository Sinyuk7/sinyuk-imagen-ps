import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiFormat,
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrixCell,
  ImageOutputSelection,
  ModelGenerationPreferenceSelection,
  ModelGenerationSettings,
} from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import type { ComposerOperation } from '../composer-readiness';

export type ModelGenerationSettingsSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ModelGenerationSettingsContext {
  readonly profileId: string | null;
  readonly apiFormat: ApiFormat | null;
  readonly modelId: string;
  readonly operation: ComposerOperation;
}

export interface ModelGenerationSelectionOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
}

export interface ModelGenerationSettingsController {
  readonly context: ModelGenerationSettingsContext;
  readonly settings: ModelGenerationSettings | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: ModelGenerationSettingsSaveState;
  readonly imageSizeOptions: readonly ModelGenerationSelectionOption<ImageOutputImageSize>[];
  readonly ratioOptions: readonly ModelGenerationSelectionOption<ImageAspectRatio>[];
  readonly outputFormatOptions: readonly ModelGenerationSelectionOption<ImageOutputFormat>[];
  readonly selection: ModelGenerationPreferenceSelection | null;
  readonly outputSelection: ImageOutputSelection | null;
  readonly archetype: ModelGenerationSettings['matrix']['archetype'] | null;
  readonly showRatio: boolean;
  readonly ready: boolean;
  readonly validationMessage: string | null;
  readonly saveSelection: (selection: ModelGenerationPreferenceSelection) => Promise<boolean>;
  readonly selectImageSize: (imageSize: ImageOutputImageSize) => Promise<boolean>;
  readonly selectRatio: (ratio: ImageAspectRatio) => Promise<boolean>;
  readonly selectOutputFormat: (outputFormat: ImageOutputFormat) => Promise<boolean>;
  readonly reload: () => Promise<void>;
}

function commandErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as { readonly message?: unknown }).message === 'string') {
    return (error as { readonly message: string }).message;
  }
  return error instanceof Error ? error.message : String(error);
}

function appOperationToProviderOperation(operation: ComposerOperation): 'text_to_image' | 'image_edit' {
  return operation === 'image-edit' ? 'image_edit' : 'text_to_image';
}

function optionLabel<T extends string>(
  options: readonly ModelGenerationSelectionOption<T>[],
  id: T,
): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

function firstOption<T extends string>(
  options: readonly ModelGenerationSelectionOption<T>[],
): T | undefined {
  return options[0]?.id;
}

function selectableCells(
  settings: ModelGenerationSettings | null,
  selection: ModelGenerationPreferenceSelection | null,
): readonly ImageOutputMatrixCell[] {
  if (!settings || !selection) {
    return [];
  }
  return settings.matrix.cells.filter((cell) => cell.imageSize === selection.imageSize);
}

function outputFormatCells(
  settings: ModelGenerationSettings | null,
  selection: ModelGenerationPreferenceSelection | null,
): readonly ImageOutputMatrixCell[] {
  return selectableCells(settings, selection).filter((cell) => cell.ratio === selection?.ratio);
}

function uniqueOptions<T extends string>(
  ids: readonly T[],
  labels: readonly ModelGenerationSelectionOption<T>[],
): readonly ModelGenerationSelectionOption<T>[] {
  const seen = new Set<T>();
  const result: ModelGenerationSelectionOption<T>[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({ id, label: optionLabel(labels, id) });
  }
  return result;
}

function findNearestCell(
  settings: ModelGenerationSettings,
  selection: ModelGenerationPreferenceSelection,
): ImageOutputMatrixCell {
  const exact = settings.matrix.cells.find(
    (cell) =>
      cell.imageSize === selection.imageSize &&
      cell.ratio === selection.ratio &&
      cell.outputFormat === selection.outputFormat,
  );
  if (exact) {
    return exact;
  }
  const sameSizeAndRatio = settings.matrix.cells.find(
    (cell) => cell.imageSize === selection.imageSize && cell.ratio === selection.ratio,
  );
  if (sameSizeAndRatio) {
    return sameSizeAndRatio;
  }
  const sameSize = settings.matrix.cells.find((cell) => cell.imageSize === selection.imageSize);
  if (sameSize) {
    return sameSize;
  }
  return settings.cell;
}

function selectionFromCell(cell: ImageOutputMatrixCell): ModelGenerationPreferenceSelection {
  return {
    selection: cell.selection,
    effectiveSelection: cell.selection,
    imageSize: cell.imageSize,
    ratio: cell.ratio,
    outputFormat: cell.outputFormat,
    normalized: false,
  };
}

export function useModelGenerationSettings(
  services: AppServices,
  context: ModelGenerationSettingsContext,
): ModelGenerationSettingsController {
  const [settings, setSettings] = useState<ModelGenerationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ModelGenerationSettingsSaveState>('idle');
  const requestSeqRef = useRef(0);

  const key = useMemo(() => {
    if (!context.profileId || !context.apiFormat || context.modelId.trim().length === 0) {
      return null;
    }
    return {
      profileId: context.profileId,
      apiFormat: context.apiFormat,
      modelId: context.modelId,
      operation: appOperationToProviderOperation(context.operation),
    } as const;
  }, [context.apiFormat, context.modelId, context.operation, context.profileId]);

  const reload = useCallback(async () => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;

    if (!key) {
      setSettings(null);
      setLoading(false);
      setError(null);
      setSaveState('idle');
      return;
    }

    setLoading(true);
    const result = await services.commands.getModelGenerationSettings(key);
    if (requestSeqRef.current !== seq) {
      return;
    }
    if (result.ok) {
      setSettings(result.value);
      setError(null);
      setSaveState('idle');
    } else {
      setSettings(null);
      setError(commandErrorMessage(result.error));
      setSaveState('error');
    }
    setLoading(false);
  }, [key, services.commands]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selection = settings?.selection ?? null;
  const imageSizeOptions = settings?.matrix.imageSizes ?? [];
  const ratioOptions = useMemo(() => {
    if (!settings || !selection) {
      return [];
    }
    return uniqueOptions(
      selectableCells(settings, selection).map((cell) => cell.ratio),
      settings.matrix.ratios,
    );
  }, [selection, settings]);
  const outputFormatOptions = useMemo(() => {
    if (!settings || !selection) {
      return [];
    }
    return uniqueOptions(
      outputFormatCells(settings, selection).map((cell) => cell.outputFormat),
      settings.matrix.outputFormats,
    );
  }, [selection, settings]);

  const saveSelection = useCallback(async (nextSelection: ModelGenerationPreferenceSelection): Promise<boolean> => {
    if (!settings || !key) {
      return false;
    }
    const cell = findNearestCell(settings, nextSelection);
    const normalizedSelection = selectionFromCell(cell);
    const optimistic: ModelGenerationSettings = {
      ...settings,
      preference: {
        ...key,
        selection: normalizedSelection.selection,
      },
      selection: normalizedSelection,
      cell,
      source: 'preference',
    };
    setSettings(optimistic);
    setSaveState('saving');
    const result = await services.commands.saveModelGenerationPreference({
      ...key,
      selection: normalizedSelection.selection,
    });
    if (result.ok) {
      setSaveState('saved');
      return true;
    }
    setError(commandErrorMessage(result.error));
    setSaveState('error');
    await reload();
    return false;
  }, [key, reload, services.commands, settings]);

  const selectImageSize = useCallback(async (imageSize: ImageOutputImageSize): Promise<boolean> => {
    if (!settings || !selection) {
      return false;
    }
    const candidates = settings.matrix.cells.filter((cell) => cell.imageSize === imageSize);
    const next = candidates.find((cell) => cell.ratio === selection.ratio && cell.outputFormat === selection.outputFormat) ??
      candidates.find((cell) => cell.ratio === selection.ratio) ??
      candidates[0];
    return next ? saveSelection({
      selection: next.selection,
      effectiveSelection: next.selection,
      imageSize: next.imageSize,
      ratio: next.ratio,
      outputFormat: next.outputFormat,
      normalized: false,
    }) : false;
  }, [saveSelection, selection, settings]);

  const selectRatio = useCallback(async (ratio: ImageAspectRatio): Promise<boolean> => {
    if (!settings || !selection) {
      return false;
    }
    const candidates = settings.matrix.cells.filter((cell) => cell.imageSize === selection.imageSize && cell.ratio === ratio);
    const next = candidates.find((cell) => cell.outputFormat === selection.outputFormat) ?? candidates[0];
    return next ? saveSelection({
      selection: next.selection,
      effectiveSelection: next.selection,
      imageSize: next.imageSize,
      ratio: next.ratio,
      outputFormat: next.outputFormat,
      normalized: false,
    }) : false;
  }, [saveSelection, selection, settings]);

  const selectOutputFormat = useCallback(async (outputFormat: ImageOutputFormat): Promise<boolean> => {
    if (!settings || !selection) {
      return false;
    }
    const next = settings.matrix.cells.find(
      (cell) =>
        cell.imageSize === selection.imageSize &&
        cell.ratio === selection.ratio &&
        cell.outputFormat === outputFormat,
    );
    return next ? saveSelection({
      selection: next.selection,
      effectiveSelection: next.selection,
      imageSize: next.imageSize,
      ratio: next.ratio,
      outputFormat: next.outputFormat,
      normalized: false,
    }) : false;
  }, [saveSelection, selection, settings]);

  const validationMessage = useMemo(() => {
    if (key === null) {
      return 'Select a profile and model.';
    }
    if (error) {
      return error;
    }
    if (loading) {
      return null;
    }
    if (!settings) {
      return 'Selected model has no executable output configuration.';
    }
    if (!firstOption(imageSizeOptions) || !firstOption(ratioOptions) || !firstOption(outputFormatOptions)) {
      return 'Selected model has no executable output configuration.';
    }
    return null;
  }, [error, imageSizeOptions, key, loading, outputFormatOptions, ratioOptions, settings]);

  return {
    context,
    settings,
    loading,
    error,
    saveState,
    imageSizeOptions,
    ratioOptions,
    outputFormatOptions,
    selection,
    outputSelection: settings?.selection.effectiveSelection ?? null,
    archetype: settings?.matrix.archetype ?? null,
    showRatio: settings?.matrix.archetype === 'size-aspect-ratio-format',
    ready: settings !== null && validationMessage === null,
    validationMessage,
    saveSelection,
    selectImageSize,
    selectRatio,
    selectOutputFormat,
    reload,
  };
}
