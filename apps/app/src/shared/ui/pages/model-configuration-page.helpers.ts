import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  OfficialModelPreset,
  UserModelConfig,
  UserModelOutputExposure,
} from '@imagen-ps/application';

type ImageOperation = 'text_to_image' | 'image_edit';

export interface MatrixDimensionSelection {
  readonly imageSizes: readonly ImageOutputImageSize[];
  readonly ratios: readonly ImageAspectRatio[];
  readonly outputFormats: readonly ImageOutputFormat[];
}

export interface OutputCapabilityModule {
  readonly id: string;
  readonly shared: boolean;
  readonly operations: readonly ImageOperation[];
  readonly matrices: readonly ImageOutputMatrix[];
  readonly archetype: ImageOutputMatrix['archetype'];
  readonly geometryKind: ImageOutputMatrix['geometryKind'];
  readonly imageSizes: readonly ImageOutputMatrix['imageSizes'][number][];
  readonly ratios: readonly ImageOutputMatrix['ratios'][number][];
  readonly outputFormats: readonly ImageOutputMatrix['outputFormats'][number][];
}

export interface OutputCapabilityEditorState {
  readonly modules: readonly OutputCapabilityModule[];
  readonly selections: Readonly<Record<string, MatrixDimensionSelection>>;
  readonly normalizationRequiredModuleIds: readonly string[];
}

const RATIO_ORDER = ['auto', 'source', '8:1', '4:1', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '1:4', '1:8'] as const;

function idsEqual(values: readonly string[], other: readonly string[]): boolean {
  return values.length === other.length && values.every((value, index) => value === other[index]);
}

function sameSet(values: readonly string[], other: readonly string[]): boolean {
  return values.length === other.length && values.every((value) => other.includes(value));
}

function uniqueInOptionOrder<T extends string>(
  optionIds: readonly T[],
  selectedIds: ReadonlySet<string>,
): readonly T[] {
  return optionIds.filter((id) => selectedIds.has(id));
}

function selectionEquals(a: MatrixDimensionSelection, b: MatrixDimensionSelection): boolean {
  return (
    idsEqual(a.imageSizes, b.imageSizes) &&
    idsEqual(a.ratios, b.ratios) &&
    idsEqual(a.outputFormats, b.outputFormats)
  );
}

function moduleIdForOperations(operations: readonly ImageOperation[]): string {
  return operations.length > 1 ? 'shared' : operations[0]!;
}

function sortedRatios(matrix: ImageOutputMatrix): readonly ImageOutputMatrix['ratios'][number][] {
  const order = new Map(RATIO_ORDER.map((id, index) => [id, index] as const));
  return [...matrix.ratios].sort((left, right) => {
    const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

function defaultCellSignature(matrix: ImageOutputMatrix): string {
  const cell = matrix.cells.find((candidate) => candidate.id === matrix.defaultCellId) ?? matrix.cells[0];
  return cell ? `${cell.imageSize}|${cell.ratio}|${cell.outputFormat}` : '';
}

function cellSignatures(matrix: ImageOutputMatrix): readonly string[] {
  return matrix.cells
    .map((cell) => `${cell.imageSize}|${cell.ratio}|${cell.outputFormat}`)
    .sort();
}

function baseCellSignatures(matrix: ImageOutputMatrix): readonly string[] {
  return matrix.cells
    .filter((cell) => cell.imageSize !== 'use-input-size')
    .map((cell) => `${cell.imageSize}|${cell.ratio}|${cell.outputFormat}`)
    .sort();
}

function hasOnlyEditDerivedExactSizeExtra(left: ImageOutputMatrix, right: ImageOutputMatrix): boolean {
  const textMatrix = left.operation === 'text_to_image'
    ? left
    : right.operation === 'text_to_image'
      ? right
      : undefined;
  const editMatrix = left.operation === 'image_edit'
    ? left
    : right.operation === 'image_edit'
      ? right
      : undefined;
  if (!textMatrix || !editMatrix || textMatrix.archetype !== editMatrix.archetype || textMatrix.geometryKind !== editMatrix.geometryKind) {
    return false;
  }
  if (
    !idsEqual(textMatrix.outputFormats.map((option) => option.id), editMatrix.outputFormats.map((option) => option.id)) ||
    !idsEqual(textMatrix.ratios.map((option) => option.id), editMatrix.ratios.filter((option) => option.id !== 'source').map((option) => option.id)) ||
    !idsEqual(textMatrix.imageSizes.map((option) => option.id), editMatrix.imageSizes.filter((option) => option.id !== 'use-input-size').map((option) => option.id))
  ) {
    return false;
  }
  return idsEqual(baseCellSignatures(textMatrix), baseCellSignatures(editMatrix));
}

export function applyDimensionSelectionToMatrix(
  matrix: ImageOutputMatrix,
  selection: MatrixDimensionSelection,
): ImageOutputMatrix {
  const imageSizes = new Set(selection.imageSizes);
  const ratios = new Set(selection.ratios);
  const outputFormats = new Set(selection.outputFormats);
  const cells = matrix.cells.filter((cell) => (
    imageSizes.has(cell.imageSize) &&
    ratios.has(cell.ratio) &&
    outputFormats.has(cell.outputFormat)
  ));
  const imageSizeIds = new Set(cells.map((cell) => cell.imageSize));
  const ratioIds = new Set(cells.map((cell) => cell.ratio));
  const outputFormatIds = new Set(cells.map((cell) => cell.outputFormat));

  return {
    operation: matrix.operation,
    archetype: matrix.archetype,
    geometryKind: matrix.geometryKind,
    imageSizes: matrix.imageSizes.filter((option) => imageSizeIds.has(option.id)),
    ratios: sortedRatios(matrix).filter((option) => ratioIds.has(option.id)),
    outputFormats: matrix.outputFormats.filter((option) => outputFormatIds.has(option.id)),
    defaultCellId: cells.some((cell) => cell.id === matrix.defaultCellId) ? matrix.defaultCellId : cells[0]?.id ?? matrix.defaultCellId,
    cells,
  };
}

export function validCombinationCount(matrix: ImageOutputMatrix, selection: MatrixDimensionSelection): number {
  return applyDimensionSelectionToMatrix(matrix, selection).cells.length;
}

export function hasSparseCombinationSet(matrix: ImageOutputMatrix, selection: MatrixDimensionSelection): boolean {
  const combinationCount = selection.imageSizes.length * selection.ratios.length * selection.outputFormats.length;
  return combinationCount > 0 && validCombinationCount(matrix, selection) < combinationCount;
}

export function areMatricesSemanticallyEqual(left: ImageOutputMatrix, right: ImageOutputMatrix): boolean {
  return (
    idsEqual(left.imageSizes.map((option) => option.id), right.imageSizes.map((option) => option.id)) &&
    idsEqual(sortedRatios(left).map((option) => option.id), sortedRatios(right).map((option) => option.id)) &&
    idsEqual(left.outputFormats.map((option) => option.id), right.outputFormats.map((option) => option.id)) &&
    idsEqual(cellSignatures(left), cellSignatures(right)) &&
    defaultCellSignature(left) === defaultCellSignature(right)
  );
}

export function canShareOutputConfig(left: ImageOutputMatrix, right: ImageOutputMatrix): boolean {
  return areMatricesSemanticallyEqual(left, right) || hasOnlyEditDerivedExactSizeExtra(left, right);
}

function deriveSelectionFromSubset(
  presetMatrix: ImageOutputMatrix,
  subsetMatrix: ImageOutputMatrix | undefined,
): { readonly selection: MatrixDimensionSelection; readonly exact: boolean } {
  const selectedCells = subsetMatrix?.cells.length ? subsetMatrix.cells : presetMatrix.cells;
  const selectedCellIds = new Set(selectedCells.map((cell) => cell.id));
  const imageSizeIds = new Set(selectedCells.map((cell) => cell.imageSize));
  const ratioIds = new Set(selectedCells.map((cell) => cell.ratio));
  const outputFormatIds = new Set(selectedCells.map((cell) => cell.outputFormat));
  const selection = {
    imageSizes: uniqueInOptionOrder(presetMatrix.imageSizes.map((option) => option.id), imageSizeIds),
    ratios: uniqueInOptionOrder(sortedRatios(presetMatrix).map((option) => option.id), ratioIds),
    outputFormats: uniqueInOptionOrder(presetMatrix.outputFormats.map((option) => option.id), outputFormatIds),
  } satisfies MatrixDimensionSelection;
  const filtered = applyDimensionSelectionToMatrix(presetMatrix, selection);
  const exact = sameSet(filtered.cells.map((cell) => cell.id), Array.from(selectedCellIds));
  return { selection, exact };
}

function deriveSelectionFromExposure(
  module: OutputCapabilityModule,
  exposure: UserModelOutputExposure,
): MatrixDimensionSelection {
  if (module.geometryKind === 'flexible-pixels' && exposure.kind === 'flexible-pixels') {
    const sizeIds = new Set(exposure.sizePresetIds);
    const formatIds = new Set(exposure.outputFormats);
    return {
      imageSizes: module.imageSizes
        .filter((option) => option.id === 'use-input-size'
          ? exposure.allowInputDerivedExactSize && sizeIds.has(option.id)
          : sizeIds.has(option.id))
        .map((option) => option.id),
      ratios: module.ratios.map((option) => option.id),
      outputFormats: module.outputFormats.filter((option) => formatIds.has(option.id)).map((option) => option.id),
    };
  }

  if (module.geometryKind === 'ratio-resolution' && exposure.kind === 'ratio-resolution') {
    const ratioIds = new Set(exposure.aspectRatios);
    const resolutionIds = new Set(exposure.resolutions);
    const formatIds = new Set(exposure.outputFormats);
    return {
      imageSizes: module.imageSizes
        .filter((option) => option.id === 'auto' || option.id === 'use-input-size' || resolutionIds.has(option.id as Exclude<ImageOutputImageSize, 'auto' | 'use-input-size'>))
        .map((option) => option.id),
      ratios: module.ratios
        .filter((option) => option.id === 'auto' || option.id === 'source' || ratioIds.has(option.id as Exclude<ImageAspectRatio, 'auto' | 'source'>))
        .map((option) => option.id),
      outputFormats: module.outputFormats.filter((option) => formatIds.has(option.id)).map((option) => option.id),
    };
  }

  return fullSelectionForModule(module);
}

function legacySubsetRequiresNormalization(
  module: OutputCapabilityModule,
  config: UserModelConfig | null | undefined,
  exposureSelection: MatrixDimensionSelection,
): boolean {
  if (!config) {
    return false;
  }
  const subsetByOperation = new Map(config.outputMatrix.map((matrix) => [matrix.operation, matrix] as const));
  const derivedStates = module.matrices.map((matrix) => deriveSelectionFromSubset(matrix, subsetByOperation.get(matrix.operation)));
  if (module.shared) {
    const firstSelection = derivedStates[0]!.selection;
    const exact = derivedStates.every((state) => state.exact) && derivedStates.every((state) => selectionEquals(state.selection, firstSelection));
    return !exact || !selectionEquals(firstSelection, exposureSelection);
  }
  const derived = derivedStates[0]!;
  return !derived.exact || !selectionEquals(derived.selection, exposureSelection);
}

function createSharedModule(matrices: readonly ImageOutputMatrix[]): OutputCapabilityModule {
  const primary = matrices.find((matrix) => matrix.operation === 'image_edit') ?? matrices[0]!;
  return {
    id: moduleIdForOperations(matrices.map((matrix) => matrix.operation)),
    shared: true,
    operations: matrices.map((matrix) => matrix.operation),
    matrices,
    archetype: primary.archetype,
    geometryKind: primary.geometryKind,
    imageSizes: primary.imageSizes,
    ratios: sortedRatios(primary),
    outputFormats: primary.outputFormats,
  };
}

function createOperationModule(matrix: ImageOutputMatrix): OutputCapabilityModule {
  return {
    id: moduleIdForOperations([matrix.operation]),
    shared: false,
    operations: [matrix.operation],
    matrices: [matrix],
    archetype: matrix.archetype,
    geometryKind: matrix.geometryKind,
    imageSizes: matrix.imageSizes,
    ratios: sortedRatios(matrix),
    outputFormats: matrix.outputFormats,
  };
}

export function buildOutputCapabilityEditorState(
  preset: OfficialModelPreset,
  config?: UserModelConfig | null,
): OutputCapabilityEditorState {
  const textToImage = preset.outputMatrix.find((matrix) => matrix.operation === 'text_to_image');
  const imageEdit = preset.outputMatrix.find((matrix) => matrix.operation === 'image_edit');
  const modules: OutputCapabilityModule[] = [];

  if (textToImage && imageEdit && canShareOutputConfig(textToImage, imageEdit)) {
    modules.push(createSharedModule([textToImage, imageEdit]));
  } else {
    modules.push(...preset.outputMatrix.map(createOperationModule));
  }

  const selections = new Map<string, MatrixDimensionSelection>();
  const normalizationRequiredModuleIds: string[] = [];

  for (const module of modules) {
    const selection = deriveSelectionFromExposure(module, config?.outputExposure ?? preset.outputExposure);
    selections.set(module.id, selection);
    if (legacySubsetRequiresNormalization(module, config, selection)) {
      normalizationRequiredModuleIds.push(module.id);
    }
  }

  return {
    modules,
    selections: Object.freeze(Object.fromEntries(selections)) as Readonly<Record<string, MatrixDimensionSelection>>,
    normalizationRequiredModuleIds,
  };
}

export function fullSelectionForModule(module: OutputCapabilityModule): MatrixDimensionSelection {
  return {
    imageSizes: module.imageSizes.map((option) => option.id),
    ratios: module.ratios.map((option) => option.id),
    outputFormats: module.outputFormats.map((option) => option.id),
  };
}
