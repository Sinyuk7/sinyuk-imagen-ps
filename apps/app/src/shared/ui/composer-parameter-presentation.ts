export interface ComposerCatalogParameter {
  readonly type: 'choice';
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface ComposerParameterChoice {
  readonly id: string;
  readonly label: string;
}

export interface ComposerRatioSizeProjection {
  readonly ratio?: {
    readonly value: string;
    readonly options: readonly ComposerParameterChoice[];
  };
  readonly size?: {
    readonly value: string;
    readonly options: readonly ComposerParameterChoice[];
  };
  readonly sourceName?: string;
  readonly ratioSourceName?: string;
  readonly sizeSourceName?: string;
  readonly sourceOptions?: readonly ComposerParameterChoice[];
  readonly sourceValue?: string;
  readonly sourceDefault?: string;
  readonly compositePairs?: readonly { readonly source: string; readonly ratio: string; readonly size: string }[];
}

function ratioChoicesForSelection(projection: ComposerRatioSizeProjection): readonly ComposerParameterChoice[] {
  if (!projection.compositePairs || !projection.size) return projection.ratio?.options ?? [];
  return [...new Set(projection.compositePairs.filter((pair) => pair.size === projection.size!.value).map((pair) => pair.ratio))]
    .map((value) => ({ id: value, label: value }));
}

function sizeChoicesForSelection(projection: ComposerRatioSizeProjection): readonly ComposerParameterChoice[] {
  if (!projection.compositePairs || !projection.ratio) return projection.size?.options ?? [];
  return [...new Set(projection.compositePairs.filter((pair) => pair.ratio === projection.ratio!.value).map((pair) => pair.size))]
    .map((value) => ({ id: value, label: value }));
}

export function composerRatioChoices(projection: ComposerRatioSizeProjection): readonly ComposerParameterChoice[] {
  return ratioChoicesForSelection(projection);
}

export function composerSizeChoices(projection: ComposerRatioSizeProjection): readonly ComposerParameterChoice[] {
  return sizeChoicesForSelection(projection);
}

function choices(parameter: ComposerCatalogParameter | undefined): readonly ComposerParameterChoice[] {
  return parameter?.options.map(({ value, label }) => ({ id: value, label })) ?? [];
}

function sizeLabel(label: string): string | undefined {
  return /(?:^|[, (])(\d+(?:\.\d+)?\s*[kK])(?:\)|$)/u.exec(label)?.[1]?.replace(/\s+/gu, '').toUpperCase();
}

function ratioLabel(label: string): string | undefined {
  return /(?:^|[, (])(\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?)(?:[,)]|$)/u.exec(label)?.[1]?.replace(/\s+/gu, '');
}

/** 将不同 Provider 的画幅/尺寸 catalog 形态投影为统一的 Composer 控件。 */
export function projectComposerRatioSize(
  parameters: Readonly<Record<string, ComposerCatalogParameter>>,
  values: Readonly<Record<string, string>>,
): ComposerRatioSizeProjection {
  const ratio = parameters.aspectRatio;
  const size = parameters.resolution ?? parameters.imageSize;
  const compositeOptions = ratio?.options.filter((option) => ratioLabel(option.label) && sizeLabel(option.label));

  if (ratio && compositeOptions?.length) {
    const pairs = compositeOptions.map((option) => ({
      source: option.value,
      ratio: ratioLabel(option.label)!,
      size: sizeLabel(option.label)!,
    }));
    const selected = pairs.find((pair) => pair.source === (values.aspectRatio ?? ratio.default)) ?? pairs[0]!;
    const ratioValues = [...new Set(pairs.map((pair) => pair.ratio))];
    const sizeValues = [...new Set(pairs.map((pair) => pair.size))];
    return {
      ratio: { value: selected.ratio, options: ratioValues.map((value) => ({ id: value, label: value })) },
      size: { value: selected.size, options: sizeValues.map((value) => ({ id: value, label: value })) },
      sourceName: 'aspectRatio', sourceOptions: choices(ratio), sourceValue: selected.source, sourceDefault: ratio.default,
      ratioSourceName: 'aspectRatio',
      compositePairs: pairs,
    };
  }

  const ratioOptions = choices(ratio);
  const sizeParameter = parameters.resolution ? 'resolution' : parameters.imageSize ? 'imageSize' : undefined;
  const sizeOptions = choices(size);
  return {
    ...(ratioOptions.length ? { ratio: { value: values.aspectRatio ?? ratio!.default, options: ratioOptions } } : {}),
    ...(ratioOptions.length ? { ratioSourceName: 'aspectRatio' } : {}),
    ...(sizeOptions.length && sizeParameter ? { size: { value: values[sizeParameter] ?? size!.default, options: sizeOptions }, sourceName: sizeParameter, sizeSourceName: sizeParameter } : {}),
  };
}

/** 将拆分控件的新画幅/尺寸组合映射回 catalog 原始选项值。 */
export function resolveComposerRatioSizeSource(
  projection: ComposerRatioSizeProjection,
  ratio: string,
  size: string,
): string | undefined {
  return projection.compositePairs?.find((pair) => pair.ratio === ratio && pair.size === size)?.source;
}

/** 生成始终反映请求参数的短摘要；默认高级项不重复占用空间。 */
export function composerConfigurationSummary(input: {
  readonly modelLabel: string;
  readonly ratio?: string;
  readonly size?: string;
  readonly parameters: Readonly<Record<string, ComposerCatalogParameter>>;
  readonly values: Readonly<Record<string, string>>;
}): string {
  const parts = [input.modelLabel];
  if (input.ratio && input.ratio !== 'auto') parts.push(input.ratio);
  if (input.size && input.size !== 'auto') parts.push(input.size.toUpperCase());
  for (const [name, parameter] of Object.entries(input.parameters)) {
    if (name === 'aspectRatio' || name === 'resolution' || name === 'imageSize') continue;
    const value = input.values[name] ?? parameter?.default;
    if (!parameter || !value) continue;
    if (name === 'quality') parts.push(value === 'default' ? 'default' : value[0]!.toUpperCase() + value.slice(1));
  }
  return parts.join(' · ');
}

/** 将短摘要拆成主模型与次级配置，供 Composer 做层级化排版。 */
export function composerConfigurationSummaryParts(input: {
  readonly modelLabel: string;
  readonly ratio?: string;
  readonly size?: string;
  readonly parameters: Readonly<Record<string, ComposerCatalogParameter>>;
  readonly values: Readonly<Record<string, string>>;
}): { readonly model: string; readonly details: readonly { readonly key: string; readonly value: string }[] } {
  const details: { key: string; value: string }[] = [];
  if (input.ratio && input.ratio !== 'auto') details.push({ key: 'ratio', value: input.ratio });
  if (input.size && input.size !== 'auto') details.push({ key: 'size', value: input.size.toUpperCase() });
  const quality = input.parameters.quality;
  const qualityValue = input.values.quality ?? quality?.default;
  if (qualityValue) details.push({ key: 'quality', value: qualityValue === 'default' ? 'default' : qualityValue[0]!.toUpperCase() + qualityValue.slice(1) });
  return { model: input.modelLabel, details };
}
