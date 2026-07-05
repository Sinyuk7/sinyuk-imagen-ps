import type {
  ImageAspectRatio,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputMatrix,
  OfficialModelPreset,
  UserModelConfig,
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
  readonly imageSizes: readonly ImageOutputMatrix['imageSizes'][number][];
  readonly ratios: readonly ImageOutputMatrix['ratios'][number][];
  readonly outputFormats: readonly ImageOutputMatrix['outputFormats'][number][];
}

export interface OutputCapabilityEditorState {
  readonly modules: readonly OutputCapabilityModule[];
  readonly selections: Readonly<Record<string, MatrixDimensionSelection>>;
  readonly normalizationRequiredModuleIds: readonly string[];
}

const RATIO_ORDER = ['auto', 'source', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] as const;

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

function mergeSelectionsByUnion(
  module: OutputCapabilityModule,
  selections: readonly MatrixDimensionSelection[],
): MatrixDimensionSelection {
  const imageSizeIds = new Set(selections.flatMap((selection) => selection.imageSizes));
  const ratioIds = new Set(selections.flatMap((selection) => selection.ratios));
  const outputFormatIds = new Set(selections.flatMap((selection) => selection.outputFormats));

  return {
    imageSizes: uniqueInOptionOrder(module.imageSizes.map((option) => option.id), imageSizeIds),
    ratios: uniqueInOptionOrder(module.ratios.map((option) => option.id), ratioIds),
    outputFormats: uniqueInOptionOrder(module.outputFormats.map((option) => option.id), outputFormatIds),
  };
}

function createSharedModule(matrices: readonly ImageOutputMatrix[]): OutputCapabilityModule {
  const primary = matrices[0]!;
  return {
    id: moduleIdForOperations(matrices.map((matrix) => matrix.operation)),
    shared: true,
    operations: matrices.map((matrix) => matrix.operation),
    matrices,
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

  if (textToImage && imageEdit && areMatricesSemanticallyEqual(textToImage, imageEdit)) {
    modules.push(createSharedModule([textToImage, imageEdit]));
  } else {
    modules.push(...preset.outputMatrix.map(createOperationModule));
  }

  const subsetByOperation = new Map(config?.outputMatrix.map((matrix) => [matrix.operation, matrix] as const) ?? []);
  const selections = new Map<string, MatrixDimensionSelection>();
  const normalizationRequiredModuleIds: string[] = [];

  for (const module of modules) {
    const derivedStates = module.matrices.map((matrix) => deriveSelectionFromSubset(matrix, subsetByOperation.get(matrix.operation)));
    if (module.shared) {
      const firstSelection = derivedStates[0]!.selection;
      const exact = derivedStates.every((state) => state.exact) && derivedStates.every((state) => selectionEquals(state.selection, firstSelection));
      const selection = exact ? firstSelection : mergeSelectionsByUnion(module, derivedStates.map((state) => state.selection));
      selections.set(module.id, selection);
      if (!exact) {
        normalizationRequiredModuleIds.push(module.id);
      }
      continue;
    }

    selections.set(module.id, derivedStates[0]!.selection);
    if (!derivedStates[0]!.exact) {
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
