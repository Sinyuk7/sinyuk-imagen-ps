import { apiFormatForImplementationId, type ApiFormat } from './api-format.js';
import type {
  EffectiveImageOutputSelection,
  ImageAspectRatio,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputImageSize,
  ImageOutputOption,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  PixelDimensions,
} from './image-output-contract.js';
import type {
  ModelOperationCapability,
  ProviderModelCapabilities,
  ProviderModelInfo,
  ProviderModelMatchKind,
} from './model.js';
import type { NormalizedImageInputContext, ProviderModelExecution, ProviderOutputOptions, ProviderResolvedOutput } from './request.js';
import { IMAGE_MODEL_CAPABILITIES } from './image-model-catalog/catalog.js';

export type {
  EffectiveImageOutputSelection,
  ImageAspectRatio,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputGeometrySelection,
  ImageOutputImageSize,
  ImageOutputOption,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  PixelDimensions,
} from './image-output-contract.js';

export type ImageCatalogProviderId = 'image-endpoint' | 'chat-image' | 'gemini-generate-content';
export type ImageSizePreset = Exclude<ImageOutputSizeOptionId, 'auto' | 'use-input-size'>;
/** catalog 输出矩阵 cell 的稳定标识。 */
export type ImageOutputCellId = string;

/** flexible-pixels 真能力约束。 */
export interface FlexiblePixelsGeometryCapability {
  readonly kind: 'flexible-pixels';
  readonly defaultGeometry: { readonly kind: 'provider-default' };
  readonly constraints: {
    readonly minPixels: number;
    readonly maxPixels: number;
    readonly maxSide: number;
    readonly multipleOf: number;
    readonly maxAspectRatio: number;
  };
  readonly recommendedPresets: readonly {
    readonly id: ImageSizePreset;
    readonly pixels: PixelDimensions;
  }[];
  readonly editDerived?: {
    readonly exactSize: true;
  };
}

/** ratio-resolution 原生几何能力。 */
export interface RatioResolutionGeometryCapability {
  readonly kind: 'ratio-resolution';
  readonly defaultGeometry: { readonly kind: 'provider-default' };
  readonly aspectRatios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
  readonly resolutions: readonly ImageSizePreset[];
}

/** 输出几何真能力 discriminated union。 */
export type GeometryCapability = FlexiblePixelsGeometryCapability | RatioResolutionGeometryCapability;

/** edit 输入能力事实。 */
export interface EditInputCapability {
  readonly inputFormats: readonly string[];
  readonly maxImages: number;
  readonly maxBytesPerImage?: number;
  readonly mask?: {
    readonly kind: 'alpha-image';
    readonly target: 'first-input';
    readonly formats: readonly string[];
    readonly maxBytes: number;
    readonly requiresSameDimensions: boolean;
  };
}

/** Provider-owned image output 能力真相。 */
export interface ImageOutputCapability {
  readonly geometry: GeometryCapability;
  readonly outputFormats: readonly ImageOutputFormat[];
  readonly defaultSelection: ImageOutputSelection;
}

/** 产品暴露入口限制。 */
export type UserModelOutputExposure =
  | {
      readonly kind: 'flexible-pixels';
      readonly sizePresetIds: readonly ImageOutputSizeOptionId[];
      readonly outputFormats: readonly ImageOutputFormat[];
      readonly allowInputDerivedExactSize: boolean;
    }
  | {
      readonly kind: 'ratio-resolution';
      readonly aspectRatios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
      readonly resolutions: readonly ImageSizePreset[];
      readonly outputFormats: readonly ImageOutputFormat[];
    };

/** UI archetype 由 capability kind 派生。 */
export type ImageOutputUiArchetype = 'size-format' | 'size-aspect-ratio-format';

/** 用户选择 projection，供 app 渲染固定 archetype。 */
export interface ImageOutputUiModel {
  readonly operation: ImageOperation;
  readonly archetype: ImageOutputUiArchetype;
  readonly geometryKind: GeometryCapability['kind'];
  readonly imageSizes: readonly ImageOutputOption<ImageOutputImageSize>[];
  readonly ratios: readonly ImageOutputOption<ImageAspectRatio>[];
  readonly outputFormats: readonly ImageOutputOption<ImageOutputFormat>[];
  readonly defaultCellId: ImageOutputCellId;
  readonly cells: readonly ImageOutputMatrixCell[];
}

/** catalog projection 中的单个 canonical selection 入口。 */
export interface ImageOutputMatrixCell {
  readonly id: ImageOutputCellId;
  readonly imageSize: ImageOutputImageSize;
  readonly ratio: ImageAspectRatio;
  readonly outputFormat: ImageOutputFormat;
  readonly selection: ImageOutputSelection;
}

/** @deprecated 保留名称供 app 迁移；语义已是 capability projection，不含 provider wire payload。 */
export type ImageOutputMatrix = ImageOutputUiModel;

function isMatrixSizePreset(value: ImageOutputImageSize): value is Exclude<ImageSizePreset, '512'> {
  return value !== 'auto' && value !== 'use-input-size';
}

export type RequestStrategyId =
  | 'image-endpoint-default'
  | 'image-endpoint-variant'
  | 'chat-image-default'
  | 'gemini-generate-content-response-format-image'
  | 'gemini-generate-content-image-config-legacy';

export interface RequestStrategy {
  readonly id: RequestStrategyId;
  readonly apiFormat: ApiFormat;
  readonly outputCodecId: 'image-endpoint' | 'chat-image-label' | 'gemini-response-format-image' | 'gemini-image-config-legacy';
  readonly wireRevisionId?: string;
}

export interface ModelOutputConfig {
  readonly aspectRatios: readonly string[];
  readonly sizes: readonly string[];
  readonly outputFormats: readonly string[];
  readonly matrices?: readonly ImageOutputMatrix[];
}

export interface OfficialModelPreset {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly displayName: string;
  readonly requestStrategyId: RequestStrategyId;
  readonly outputCapability: ImageOutputCapability;
  readonly outputExposure: UserModelOutputExposure;
  readonly outputMatrix: readonly ImageOutputMatrix[];
  readonly output: ModelOutputConfig;
}

const REQUEST_STRATEGIES = Object.freeze([
  {
    id: 'image-endpoint-default',
    apiFormat: 'openai-images',
    outputCodecId: 'image-endpoint',
  },
  {
    id: 'image-endpoint-variant',
    apiFormat: 'openai-images',
    outputCodecId: 'image-endpoint',
  },
  {
    id: 'chat-image-default',
    apiFormat: 'openai-chat-completions',
    outputCodecId: 'chat-image-label',
  },
  {
    id: 'gemini-generate-content-response-format-image',
    apiFormat: 'gemini-generate-content',
    outputCodecId: 'gemini-response-format-image',
    wireRevisionId: 'response-format-image',
  },
  {
    id: 'gemini-generate-content-image-config-legacy',
    apiFormat: 'gemini-generate-content',
    outputCodecId: 'gemini-image-config-legacy',
    wireRevisionId: 'image-config-legacy',
  },
] as const satisfies readonly RequestStrategy[]);

/**
 * 模型品牌标识，由 catalog 规则声明，供上层（经 application 命令）映射为 UI 图标。
 *
 * brand 是模型身份属性（与 `displayName`/`ruleId` 同性质），不是 UI 资产；
 * SVG 与图标渲染归属 `apps/app`。`google-gemini` 与 `google-other` 区分 gemini
 * 系与非 gemini 系 google 模型，分别映射不同图标。
 */
export type ModelBrand =
  | 'openai'
  | 'google-gemini'
  | 'google-other'
  | 'xai'
  | 'qwen'
  | 'doubao';

export interface ModelMatcherPattern {
  readonly source: string;
  readonly flags?: string;
  readonly priority: number;
}

export interface ModelMatcher {
  readonly ids?: readonly string[];
  readonly aliases?: readonly string[];
  readonly prefixes?: readonly string[];
  readonly patterns?: readonly ModelMatcherPattern[];
}

export interface ImageOutputVariant {
  readonly operation: ImageOperation;
  readonly preset: ImageSizePreset;
  readonly aspectRatio: ImageAspectRatio;
  readonly wireSize?: string;
  readonly useProviderAuto?: boolean;
}

interface ConstraintOperationSupport {
  readonly presets: readonly ImageSizePreset[];
  readonly aspectRatios: readonly ImageAspectRatio[];
  readonly omitSizeForAspectRatios?: readonly ImageAspectRatio[];
  readonly omitAspectRatioForAspectRatios?: readonly ImageAspectRatio[];
}

interface PixelSideConstraintStrategy {
  readonly kind: 'pixel-side';
  readonly sideByPreset: Readonly<Record<ImageSizePreset, number>>;
  readonly operations: Readonly<Record<ImageOperation, ConstraintOperationSupport>>;
}

interface ChatImageLabelConstraintStrategy {
  readonly kind: 'chat-image-label';
  readonly labelByPreset: Readonly<Record<ImageSizePreset, string>>;
  readonly operations: Readonly<Record<ImageOperation, ConstraintOperationSupport>>;
}

export type ImageOutputConstraintStrategy = PixelSideConstraintStrategy | ChatImageLabelConstraintStrategy;

export interface ImageModelCapability {
  readonly ruleId: string;
  readonly match: ModelMatcher;
  readonly displayName: string;
  readonly requestStrategyId?: RequestStrategyId;
  readonly selection: {
    readonly visibleInPicker: boolean;
    readonly allowAsDefault?: boolean;
  };
  readonly appliesToProviders?: readonly ImageCatalogProviderId[];
  readonly outputCapability?: ImageOutputCapability;
  readonly outputExposure?: UserModelOutputExposure;
  readonly outputMatrix?: readonly ImageOutputMatrix[];
  readonly editInput?: EditInputCapability;
  readonly variants?: readonly ImageOutputVariant[];
  readonly constraintStrategy?: ImageOutputConstraintStrategy;
  readonly discovery?: {
    readonly requireRemotePresence?: boolean;
  };
  /**
   * 模型品牌；picker-visible 非 default 规则必填。default/fallback 规则留空，
   * 解析时 brand 为 `undefined`，上层回落到默认图标。
   */
  readonly brand?: ModelBrand;
}

export interface ResolvedImageModelRule {
  readonly ruleId: string;
  readonly concreteModelId: string;
  readonly capability: ImageModelCapability;
  readonly matchKind: ProviderModelMatchKind;
}

export interface ResolvedImageModelOutput {
  readonly rule: ResolvedImageModelRule;
  readonly cell?: ImageOutputMatrixCell;
  readonly selection?: ImageOutputSelection;
  readonly resolvedOutput?: ProviderResolvedOutput;
  readonly wireSize?: string;
  readonly wireAspectRatio?: Exclude<ImageAspectRatio, 'auto' | 'source'>;
}

export class ImageModelContractError extends Error {
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'ImageModelContractError';
    if (details !== undefined) {
      this.details = details;
    }
  }
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase();
}

function capabilityAppliesToProvider(capability: ImageModelCapability, providerId: ImageCatalogProviderId): boolean {
  return capability.appliesToProviders === undefined || capability.appliesToProviders.includes(providerId);
}

function visibleCapabilitiesForProvider(
  providerId: ImageCatalogProviderId,
  capabilities: readonly ImageModelCapability[],
): readonly ImageModelCapability[] {
  return capabilities.filter(
    (capability) =>
      capabilityAppliesToProvider(capability, providerId) &&
      capability.selection.visibleInPicker,
  );
}

function noMatchError(providerId: ImageCatalogProviderId, modelId: string): ImageModelContractError {
  return new ImageModelContractError(
    `Image model catalog has no explicit rule for "${modelId}" on provider "${providerId}".`,
    { providerId, modelId, matchKind: 'none' },
  );
}

function canonicalModelIdForCapability(capability: ImageModelCapability): string {
  const canonical = capability.match.ids?.[0]?.trim();
  if (!canonical) {
    throw new ImageModelContractError(`Image model rule "${capability.ruleId}" requires at least one canonical id.`, {
      ruleId: capability.ruleId,
    });
  }
  return canonical;
}

function requestStrategyIdForCapability(
  providerId: ImageCatalogProviderId,
  capability: ImageModelCapability,
): RequestStrategyId {
  if (capability.requestStrategyId !== undefined) {
    return capability.requestStrategyId;
  }
  switch (providerId) {
    case 'image-endpoint':
      return 'image-endpoint-default';
    case 'chat-image':
      return 'chat-image-default';
    case 'gemini-generate-content':
      return 'gemini-generate-content-response-format-image';
  }
}

function outputConfigForCapability(capability: ImageModelCapability): ModelOutputConfig {
  if (capability.outputMatrix !== undefined) {
    return {
      aspectRatios: Array.from(new Set(capability.outputMatrix.flatMap((matrix) => matrix.ratios.map((option) => option.id)))),
      sizes: Array.from(new Set(capability.outputMatrix.flatMap((matrix) => matrix.imageSizes.map((option) => option.id)))),
      outputFormats: Array.from(new Set(capability.outputMatrix.flatMap((matrix) => matrix.outputFormats.map((option) => option.id)))),
      matrices: capability.outputMatrix,
    };
  }
  if (capability.variants !== undefined) {
    return {
      aspectRatios: Array.from(new Set(capability.variants.map((variant) => variant.aspectRatio))),
      sizes: Array.from(new Set(capability.variants.map((variant) => variant.preset))),
      outputFormats: ['auto', 'png', 'jpeg', 'webp'],
    };
  }
  if (capability.constraintStrategy !== undefined) {
    const support = Object.values(capability.constraintStrategy.operations);
    return {
      aspectRatios: Array.from(new Set(support.flatMap((entry) => entry.aspectRatios))),
      sizes: Array.from(new Set(support.flatMap((entry) => entry.presets))),
      outputFormats: ['auto', 'png', 'jpeg', 'webp'],
    };
  }
  return {
    aspectRatios: ['auto'],
    sizes: ['auto'],
    outputFormats: ['auto'],
  };
}

function outputMatricesForCapability(capability: ImageModelCapability): readonly ImageOutputMatrix[] {
  return capability.outputMatrix ?? [];
}

function outputMatrixForOperation(rule: ResolvedImageModelRule, operation: ImageOperation): ImageOutputMatrix | undefined {
  return outputMatricesForCapability(rule.capability).find((matrix) => matrix.operation === operation);
}

function buildOfficialModelPreset(
  providerId: ImageCatalogProviderId,
  capability: ImageModelCapability,
): OfficialModelPreset {
  const output = outputConfigForCapability(capability);
  if (capability.outputCapability === undefined || capability.outputExposure === undefined) {
    throw new ImageModelContractError(`Image model rule "${capability.ruleId}" requires outputCapability and outputExposure.`, {
      ruleId: capability.ruleId,
    });
  }
  return {
    apiFormat: apiFormatForImplementationId(providerId),
    modelId: canonicalModelIdForCapability(capability),
    displayName: capability.displayName,
    requestStrategyId: requestStrategyIdForCapability(providerId, capability),
    outputCapability: capability.outputCapability,
    outputExposure: capability.outputExposure,
    outputMatrix: capability.outputMatrix ?? [],
    output,
  };
}

function buildProviderModelInfo(
  capability: ImageModelCapability,
  overrides?: Pick<ProviderModelInfo, 'id' | 'displayName'>,
): ProviderModelInfo {
  const id = overrides?.id ?? canonicalModelIdForCapability(capability);
  return {
    id,
    displayName: overrides?.displayName ?? capability.displayName,
  };
}

function operationSupportFromStrategy(
  strategy: ImageOutputConstraintStrategy,
  operation: ImageOperation,
): ConstraintOperationSupport {
  return strategy.operations[operation];
}

function assertOperationSupported(
  rule: ResolvedImageModelRule,
  operation: ImageOperation,
): void {
  if (rule.capability.outputMatrix?.some((matrix) => matrix.operation === operation)) {
    return;
  }
  if (rule.capability.variants?.some((variant) => variant.operation === operation)) {
    return;
  }
  if (rule.capability.constraintStrategy !== undefined) {
    return;
  }
  throw new ImageModelContractError(
    `Model "${rule.concreteModelId}" does not support operation "${operation}".`,
    {
      modelId: rule.concreteModelId,
      operation,
      ruleId: rule.ruleId,
    },
  );
}

function exactMatchCandidates(
  providerId: ImageCatalogProviderId,
  modelId: string,
  capabilities: readonly ImageModelCapability[],
): readonly ImageModelCapability[] {
  const normalized = normalizeModelId(modelId);
  return capabilities.filter(
    (capability) =>
      capabilityAppliesToProvider(capability, providerId) &&
      capability.match.ids?.some((id) => normalizeModelId(id) === normalized),
  );
}

function aliasMatchCandidates(
  providerId: ImageCatalogProviderId,
  modelId: string,
  capabilities: readonly ImageModelCapability[],
): readonly ImageModelCapability[] {
  const normalized = normalizeModelId(modelId);
  return capabilities.filter(
    (capability) =>
      capabilityAppliesToProvider(capability, providerId) &&
      capability.match.aliases?.some((id) => normalizeModelId(id) === normalized),
  );
}

function prefixMatchCandidates(
  providerId: ImageCatalogProviderId,
  modelId: string,
  capabilities: readonly ImageModelCapability[],
): ReadonlyArray<{ readonly capability: ImageModelCapability; readonly prefix: string }> {
  const normalized = normalizeModelId(modelId);
  return capabilities.flatMap((capability) => {
    if (!capabilityAppliesToProvider(capability, providerId)) {
      return [];
    }
    return (capability.match.prefixes ?? [])
      .filter((prefix) => normalized.startsWith(normalizeModelId(prefix)))
      .map((prefix) => ({ capability, prefix }));
  });
}

function patternMatchCandidates(
  providerId: ImageCatalogProviderId,
  modelId: string,
  capabilities: readonly ImageModelCapability[],
): ReadonlyArray<{ readonly capability: ImageModelCapability; readonly pattern: ModelMatcherPattern }> {
  return capabilities.flatMap((capability) => {
    if (!capabilityAppliesToProvider(capability, providerId)) {
      return [];
    }
    return (capability.match.patterns ?? [])
      .filter((pattern) => new RegExp(pattern.source, pattern.flags).test(modelId))
      .map((pattern) => ({ capability, pattern }));
  });
}

function assertSingleCapability(
  matches: readonly ImageModelCapability[],
  errorMessage: string,
  details: Readonly<Record<string, unknown>>,
): ImageModelCapability | undefined {
  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length > 1) {
    throw new ImageModelContractError(errorMessage, details);
  }
  return matches[0];
}

export function providerUsesImageModelCatalog(providerId: string): providerId is ImageCatalogProviderId {
  return providerId === 'image-endpoint' || providerId === 'chat-image' || providerId === 'gemini-generate-content';
}

function sizePresetsForOperation(
  capability: ImageModelCapability,
  operation: ImageOperation,
): readonly ImageSizePreset[] | 'unknown' {
  const matrix = capability.outputMatrix?.find((candidate) => candidate.operation === operation);
  if (matrix !== undefined) {
    return Array.from(
      new Set(matrix.cells.map((cell) => cell.imageSize).filter(isMatrixSizePreset)),
    );
  }
  if (capability.variants !== undefined) {
    return Array.from(
      new Set(
        capability.variants
          .filter((variant) => variant.operation === operation)
          .map((variant) => variant.preset),
      ),
    );
  }

  if (capability.constraintStrategy === undefined) {
    return 'unknown';
  }

  return operationSupportFromStrategy(capability.constraintStrategy, operation).presets;
}

function operationCapability(
  capability: ImageModelCapability,
  operation: ImageOperation,
  matchKind?: ProviderModelMatchKind,
): ModelOperationCapability {
  if (matchKind === 'default') {
    return {
      support: 'unknown',
      sizePresets: 'unknown',
      reason: 'not-in-local-catalog',
    };
  }

  const sizePresets = sizePresetsForOperation(capability, operation);
  if (sizePresets === 'unknown') {
    return {
      support: 'unknown',
      sizePresets: 'unknown',
      reason: 'insufficient-catalog-evidence',
    };
  }

  if (sizePresets.length === 0) {
    return {
      support: 'unsupported',
      sizePresets,
      reason: 'operation-unsupported',
    };
  }

  return {
    support: 'supported',
    sizePresets,
  };
}

function summarizeCapabilityForRule(args: {
  readonly capability: ImageModelCapability;
  readonly matchKind?: ProviderModelMatchKind;
}): ProviderModelCapabilities {
  return {
    operations: {
      textToImage: operationCapability(args.capability, 'text_to_image', args.matchKind),
      imageEdit: operationCapability(args.capability, 'image_edit', args.matchKind),
    },
    inputImages: {
      mask: 'unknown',
    },
  };
}

/**
 * 汇总 catalog 对 model 能力的可证明证据；未命中 curated rule 时保持 unknown。
 */
export function summarizeImageModelCapabilities(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
}): ProviderModelCapabilities {
  const resolved = tryResolveImageModelRule(args);
  if (resolved === undefined) {
    return {
      operations: {
        textToImage: {
          support: 'unknown',
          sizePresets: 'unknown',
          reason: 'not-in-local-catalog',
        },
        imageEdit: {
          support: 'unknown',
          sizePresets: 'unknown',
          reason: 'not-in-local-catalog',
        },
      },
      inputImages: {
        mask: 'unknown',
      },
    };
  }
  return summarizeCapabilityForRule({
    capability: resolved.capability,
    matchKind: resolved.matchKind,
  });
}

export function tryResolveImageModelRule(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly capabilities?: readonly ImageModelCapability[];
}): ResolvedImageModelRule | undefined {
  const modelId = args.modelId.trim();
  const capabilities = args.capabilities ?? IMAGE_MODEL_CAPABILITIES;

  const exact = assertSingleCapability(
    exactMatchCandidates(args.providerId, modelId, capabilities),
    `Image model catalog exact match is ambiguous for "${modelId}".`,
    { providerId: args.providerId, modelId, matchKind: 'exact' },
  );
  if (exact) {
    return {
      ruleId: exact.ruleId,
      concreteModelId: modelId,
      capability: exact,
      matchKind: 'exact',
    };
  }

  const alias = assertSingleCapability(
    aliasMatchCandidates(args.providerId, modelId, capabilities),
    `Image model catalog alias match is ambiguous for "${modelId}".`,
    { providerId: args.providerId, modelId, matchKind: 'alias' },
  );
  if (alias) {
    return {
      ruleId: alias.ruleId,
      concreteModelId: canonicalModelIdForCapability(alias),
      capability: alias,
      matchKind: 'alias',
    };
  }

  const prefixMatches = prefixMatchCandidates(args.providerId, modelId, capabilities);
  if (prefixMatches.length > 0) {
    const longest = Math.max(...prefixMatches.map((match) => normalizeModelId(match.prefix).length));
    const topMatches = prefixMatches.filter((match) => normalizeModelId(match.prefix).length === longest);
    const unique = Array.from(new Map(topMatches.map((match) => [match.capability.ruleId, match.capability])).values());
    if (unique.length > 1) {
      throw new ImageModelContractError(
        `Image model catalog prefix match is ambiguous for "${modelId}".`,
        {
          providerId: args.providerId,
          modelId,
          matchKind: 'prefix',
          ruleIds: unique.map((capability) => capability.ruleId),
        },
      );
    }
    const capability = unique[0]!;
    return {
      ruleId: capability.ruleId,
      concreteModelId: modelId,
      capability,
      matchKind: 'prefix',
    };
  }

  const patternMatches = patternMatchCandidates(args.providerId, modelId, capabilities);
  if (patternMatches.length > 0) {
    const highestPriority = Math.max(...patternMatches.map((match) => match.pattern.priority));
    const topMatches = patternMatches.filter((match) => match.pattern.priority === highestPriority);
    const unique = Array.from(new Map(topMatches.map((match) => [match.capability.ruleId, match.capability])).values());
    if (unique.length > 1) {
      throw new ImageModelContractError(
        `Image model catalog pattern match is ambiguous for "${modelId}".`,
        {
          providerId: args.providerId,
          modelId,
          matchKind: 'pattern',
          priority: highestPriority,
          ruleIds: unique.map((capability) => capability.ruleId),
        },
      );
    }
    const capability = unique[0]!;
    return {
      ruleId: capability.ruleId,
      concreteModelId: modelId,
      capability,
      matchKind: 'pattern',
    };
  }

  return undefined;
}

export function resolveImageModelRule(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly capabilities?: readonly ImageModelCapability[];
}): ResolvedImageModelRule {
  const resolved = tryResolveImageModelRule(args);
  if (resolved === undefined) {
    throw noMatchError(args.providerId, args.modelId.trim());
  }
  return resolved;
}

export function hasExplicitImageModelRule(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly capabilities?: readonly ImageModelCapability[];
}): boolean {
  return tryResolveImageModelRule(args) !== undefined;
}

export function listLocalCatalogModels(providerId: ImageCatalogProviderId): readonly ProviderModelInfo[] {
  return visibleCapabilitiesForProvider(providerId, IMAGE_MODEL_CAPABILITIES).map((capability) =>
    buildProviderModelInfo(capability),
  );
}

export function listOfficialModelPresets(apiFormat?: ApiFormat): readonly OfficialModelPreset[] {
  const presets = (['image-endpoint', 'chat-image', 'gemini-generate-content'] as const satisfies readonly ImageCatalogProviderId[])
    .flatMap((providerId) =>
      visibleCapabilitiesForProvider(providerId, IMAGE_MODEL_CAPABILITIES).map((capability) =>
        buildOfficialModelPreset(providerId, capability),
      ),
    );
  return apiFormat === undefined ? presets : presets.filter((preset) => preset.apiFormat === apiFormat);
}

export function getOfficialModelPreset(apiFormat: ApiFormat, modelId: string): OfficialModelPreset | undefined {
  return listOfficialModelPresets(apiFormat).find((preset) => preset.modelId === modelId);
}

export function listRequestStrategies(apiFormat?: ApiFormat): readonly RequestStrategy[] {
  return apiFormat === undefined
    ? REQUEST_STRATEGIES
    : REQUEST_STRATEGIES.filter((strategy) => strategy.apiFormat === apiFormat);
}

export function getRequestStrategy(requestStrategyId: string): RequestStrategy | undefined {
  return REQUEST_STRATEGIES.find((strategy) => strategy.id === requestStrategyId);
}

export function assertProviderModelExecution(args: {
  readonly execution: ProviderModelExecution | undefined;
  readonly apiFormat: ApiFormat;
}): ProviderModelExecution {
  if (args.execution === undefined) {
    throw new ImageModelContractError('Provider request requires resolved model execution.');
  }
  const strategy = getRequestStrategy(args.execution.requestStrategyId);
  if (strategy === undefined) {
    throw new ImageModelContractError(`Unknown requestStrategyId "${args.execution.requestStrategyId}".`, {
      requestStrategyId: args.execution.requestStrategyId,
    });
  }
  if (strategy.apiFormat !== args.apiFormat || args.execution.apiFormat !== args.apiFormat) {
    throw new ImageModelContractError(
      `requestStrategyId "${args.execution.requestStrategyId}" is not valid for apiFormat "${args.apiFormat}".`,
      {
        requestStrategyId: args.execution.requestStrategyId,
        strategyApiFormat: strategy.apiFormat,
        executionApiFormat: args.execution.apiFormat,
        apiFormat: args.apiFormat,
      },
    );
  }
  return args.execution;
}

function resolveVariantOutput(args: {
  readonly rule: ResolvedImageModelRule;
  readonly operation: ImageOperation;
  readonly preset: ImageSizePreset;
  readonly aspectRatio: ImageAspectRatio;
}): ResolvedImageModelOutput {
  const variant = args.rule.capability.variants?.find(
    (candidate) =>
      candidate.operation === args.operation &&
      candidate.preset === args.preset &&
      candidate.aspectRatio === args.aspectRatio,
  );
  if (!variant) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support preset "${args.preset}" with aspect ratio "${args.aspectRatio}" for "${args.operation}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        operation: args.operation,
        preset: args.preset,
        aspectRatio: args.aspectRatio,
      },
    );
  }
  return {
    rule: args.rule,
    ...(variant.wireSize !== undefined ? { wireSize: variant.wireSize } : {}),
  };
}

function assertOutputFormatSupported(args: {
  readonly rule: ResolvedImageModelRule;
  readonly outputFormat: ImageOutputFormat;
}): void {
  const formats = args.rule.capability.outputCapability?.outputFormats ?? [];
  if (!formats.includes(args.outputFormat)) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support output format "${args.outputFormat}".`,
      { modelId: args.rule.concreteModelId, ruleId: args.rule.ruleId, outputFormat: args.outputFormat },
    );
  }
}

function effectiveSelectionForOperation(args: {
  readonly selection: ImageOutputSelection;
  readonly operation: ImageOperation;
}): EffectiveImageOutputSelection {
  if (args.selection.geometry.kind === 'input-derived' && args.operation === 'text_to_image') {
    return {
      storedSelection: args.selection,
      effectiveSelection: {
        geometry: { kind: 'provider-default' },
        outputFormat: args.selection.outputFormat,
      },
      visibleSizeId: 'auto',
      normalized: true,
    };
  }
  return {
    storedSelection: args.selection,
    effectiveSelection: args.selection,
    visibleSizeId: sizeIdForSelection(args.selection),
    normalized: false,
  };
}

function sizeIdForSelection(selection: ImageOutputSelection): ImageOutputSizeOptionId {
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

function validateFlexiblePixels(args: {
  readonly rule: ResolvedImageModelRule;
  readonly width: number;
  readonly height: number;
}): void {
  const geometry = args.rule.capability.outputCapability?.geometry;
  if (geometry?.kind !== 'flexible-pixels') {
    throw new ImageModelContractError(`Model "${args.rule.concreteModelId}" does not support pixel geometry.`, {
      modelId: args.rule.concreteModelId,
      ruleId: args.rule.ruleId,
    });
  }
  const { width, height } = args;
  const pixels = width * height;
  const aspect = Math.max(width / height, height / width);
  const invalid =
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width % geometry.constraints.multipleOf !== 0 ||
    height % geometry.constraints.multipleOf !== 0 ||
    Math.max(width, height) > geometry.constraints.maxSide ||
    pixels < geometry.constraints.minPixels ||
    pixels > geometry.constraints.maxPixels ||
    aspect > geometry.constraints.maxAspectRatio;
  if (invalid) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" cannot resolve exact output size "${width}x${height}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        width,
        height,
        constraints: geometry.constraints,
      },
    );
  }
}

function exactSizeFromInput(args: {
  readonly rule: ResolvedImageModelRule;
  readonly inputContext?: NormalizedImageInputContext;
}): PixelDimensions {
  const primary = args.inputContext?.primaryEditInput;
  if (primary === undefined) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" requires normalized primary edit input geometry for Use Input Size.`,
      { modelId: args.rule.concreteModelId, ruleId: args.rule.ruleId },
    );
  }
  validateFlexiblePixels({ rule: args.rule, width: primary.width, height: primary.height });
  return primary;
}

function assertRatioResolutionSupported(args: {
  readonly rule: ResolvedImageModelRule;
  readonly aspectRatio: Exclude<ImageAspectRatio, 'auto' | 'source'>;
  readonly resolution: ImageSizePreset;
}): void {
  const geometry = args.rule.capability.outputCapability?.geometry;
  if (geometry?.kind !== 'ratio-resolution') {
    throw new ImageModelContractError(`Model "${args.rule.concreteModelId}" does not support ratio-resolution geometry.`, {
      modelId: args.rule.concreteModelId,
      ruleId: args.rule.ruleId,
    });
  }
  if (!geometry.aspectRatios.includes(args.aspectRatio) || !geometry.resolutions.includes(args.resolution)) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support ratio-resolution "${args.resolution}/${args.aspectRatio}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
      },
    );
  }
}

function responseFormatAspectRatio(ratio: Exclude<ImageAspectRatio, 'auto' | 'source'>): string {
  switch (ratio) {
    case '1:1':
      return 'ASPECT_RATIO_ONE_BY_ONE';
    case '16:9':
      return 'ASPECT_RATIO_SIXTEEN_NINE';
    case '9:16':
      return 'ASPECT_RATIO_NINE_SIXTEEN';
  }
}

function responseFormatImageSize(size: ImageSizePreset): string {
  switch (size) {
    case '1k':
      return 'IMAGE_SIZE_ONE_K';
    case '2k':
      return 'IMAGE_SIZE_TWO_K';
    case '4k':
      return 'IMAGE_SIZE_FOUR_K';
  }
}

function imageConfigSize(size: ImageSizePreset): string {
  switch (size) {
    case '1k':
      return '1K';
    case '2k':
      return '2K';
    case '4k':
      return '4K';
  }
}

function geminiMimeFields(outputFormat: ImageOutputFormat): Readonly<Record<string, unknown>> {
  return outputFormat === 'jpeg' ? { mimeType: 'IMAGE_JPEG' } : {};
}

function selectionForOutput(rule: ResolvedImageModelRule, output: ProviderOutputOptions | undefined): ImageOutputSelection {
  const selection = output?.selection ?? rule.capability.outputCapability?.defaultSelection;
  if (selection === undefined) {
    throw new ImageModelContractError(`Model "${rule.concreteModelId}" has no default output selection.`, {
      modelId: rule.concreteModelId,
      ruleId: rule.ruleId,
    });
  }
  return selection;
}

function buildResolvedOutputFromSelection(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly rule: ResolvedImageModelRule;
  readonly operation: ImageOperation;
  readonly selection: ImageOutputSelection;
  readonly inputContext?: NormalizedImageInputContext;
}): ProviderResolvedOutput {
  const projection = effectiveSelectionForOperation({
    selection: args.selection,
    operation: args.operation,
  });
  const selection = projection.effectiveSelection;
  assertOutputFormatSupported({ rule: args.rule, outputFormat: selection.outputFormat });

  if (args.providerId === 'image-endpoint') {
    switch (selection.geometry.kind) {
      case 'provider-default':
        return { kind: 'image-endpoint', size: 'auto', outputFormat: selection.outputFormat };
      case 'pixels':
        validateFlexiblePixels({ rule: args.rule, width: selection.geometry.width, height: selection.geometry.height });
        return { kind: 'image-endpoint', size: `${selection.geometry.width}x${selection.geometry.height}`, outputFormat: selection.outputFormat };
      case 'input-derived': {
        const size = exactSizeFromInput({ rule: args.rule, inputContext: args.inputContext });
        return { kind: 'image-endpoint', size: `${size.width}x${size.height}`, outputFormat: selection.outputFormat };
      }
      case 'ratio-resolution':
        throw new ImageModelContractError('Image endpoint builder cannot consume ratio-resolution selection.', {
          modelId: args.rule.concreteModelId,
          ruleId: args.rule.ruleId,
        });
    }
  }

  if (args.providerId === 'chat-image') {
    switch (selection.geometry.kind) {
      case 'provider-default':
        return { kind: 'chat-image', imageConfig: { output_format: selection.outputFormat } };
      case 'pixels':
        validateFlexiblePixels({ rule: args.rule, width: selection.geometry.width, height: selection.geometry.height });
        return {
          kind: 'chat-image',
          imageConfig: {
            size: `${selection.geometry.width}x${selection.geometry.height}`,
            output_format: selection.outputFormat,
          },
        };
      case 'input-derived': {
        const size = exactSizeFromInput({ rule: args.rule, inputContext: args.inputContext });
        return {
          kind: 'chat-image',
          imageConfig: {
            size: `${size.width}x${size.height}`,
            output_format: selection.outputFormat,
          },
        };
      }
      case 'ratio-resolution':
        assertRatioResolutionSupported({
          rule: args.rule,
          aspectRatio: selection.geometry.aspectRatio,
          resolution: selection.geometry.resolution,
        });
        return {
          kind: 'chat-image',
          imageConfig: {
            size: imageConfigSize(selection.geometry.resolution),
            aspect_ratio: selection.geometry.aspectRatio,
            output_format: selection.outputFormat,
          },
        };
    }
  }

  switch (selection.geometry.kind) {
    case 'provider-default':
      return {
        kind: 'gemini-generate-content',
        responseFormatImage: geminiMimeFields(selection.outputFormat),
        imageConfig: {},
      };
    case 'ratio-resolution':
      assertRatioResolutionSupported({
        rule: args.rule,
        aspectRatio: selection.geometry.aspectRatio,
        resolution: selection.geometry.resolution,
      });
      return {
        kind: 'gemini-generate-content',
        responseFormatImage: {
          imageSize: responseFormatImageSize(selection.geometry.resolution),
          aspectRatio: responseFormatAspectRatio(selection.geometry.aspectRatio),
          ...geminiMimeFields(selection.outputFormat),
        },
        imageConfig: {
          imageSize: imageConfigSize(selection.geometry.resolution),
          aspectRatio: selection.geometry.aspectRatio,
        },
      };
    case 'pixels':
    case 'input-derived':
      throw new ImageModelContractError('Gemini builder cannot consume pixel or input-derived output selection.', {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        geometryKind: selection.geometry.kind,
      });
  }
}

function resolveMatrixOutput(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly rule: ResolvedImageModelRule;
  readonly operation: ImageOperation;
  readonly output?: ProviderOutputOptions;
  readonly inputContext?: NormalizedImageInputContext;
}): ResolvedImageModelOutput | undefined {
  const matrix = outputMatrixForOperation(args.rule, args.operation);
  if (matrix === undefined) {
    return undefined;
  }

  const selected = selectionForOutput(args.rule, args.output);
  const effective = effectiveSelectionForOperation({ selection: selected, operation: args.operation });
  const imageSize = effective.visibleSizeId;
  const ratio = effective.effectiveSelection.geometry.kind === 'ratio-resolution'
    ? effective.effectiveSelection.geometry.aspectRatio
    : effective.effectiveSelection.geometry.kind === 'input-derived'
      ? 'source'
      : 'auto';
  const outputFormat = effective.effectiveSelection.outputFormat;
  const cell = matrix.cells.find(
    (candidate) =>
      candidate.imageSize === imageSize &&
      candidate.ratio === ratio &&
      candidate.outputFormat === outputFormat,
  );
  if (cell === undefined) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support output selection "${imageSize}/${ratio}/${outputFormat}" for "${args.operation}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        operation: args.operation,
        imageSize,
        ratio,
        outputFormat,
      },
    );
  }
  const resolvedOutput = buildResolvedOutputFromSelection({
    providerId: args.providerId,
    rule: args.rule,
    operation: args.operation,
    selection: selected,
    inputContext: args.inputContext,
  });
  return {
    rule: args.rule,
    cell,
    selection: selected,
    resolvedOutput,
  };
}

function ratioSize(side: number, aspectRatio: ImageAspectRatio): string {
  switch (aspectRatio) {
    case '16:9':
      return `${side}x${Math.round(side * 9 / 16)}`;
    case '9:16':
      return `${Math.round(side * 9 / 16)}x${side}`;
    case 'auto':
    case 'source':
    case '1:1':
    default:
      return `${side}x${side}`;
  }
}

function resolveConstraintOutput(args: {
  readonly rule: ResolvedImageModelRule;
  readonly operation: ImageOperation;
  readonly preset: ImageSizePreset;
  readonly aspectRatio: ImageAspectRatio;
}): ResolvedImageModelOutput {
  const strategy = args.rule.capability.constraintStrategy;
  if (!strategy) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" is missing a constraint strategy.`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
      },
    );
  }

  const support = operationSupportFromStrategy(strategy, args.operation);
  if (!support.presets.includes(args.preset)) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support preset "${args.preset}" for "${args.operation}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        operation: args.operation,
        preset: args.preset,
      },
    );
  }
  if (!support.aspectRatios.includes(args.aspectRatio)) {
    throw new ImageModelContractError(
      `Model "${args.rule.concreteModelId}" does not support aspect ratio "${args.aspectRatio}" for "${args.operation}".`,
      {
        modelId: args.rule.concreteModelId,
        ruleId: args.rule.ruleId,
        operation: args.operation,
        aspectRatio: args.aspectRatio,
      },
    );
  }

  if (strategy.kind === 'pixel-side') {
    const omitSize = support.omitSizeForAspectRatios?.includes(args.aspectRatio) === true;
    return {
      rule: args.rule,
      ...(omitSize ? {} : { wireSize: ratioSize(strategy.sideByPreset[args.preset], args.aspectRatio) }),
    };
  }

  const omitAspectRatio = support.omitAspectRatioForAspectRatios?.includes(args.aspectRatio) === true;
  return {
    rule: args.rule,
    wireSize: strategy.labelByPreset[args.preset],
    ...(omitAspectRatio || args.aspectRatio === 'auto' || args.aspectRatio === 'source'
      ? {}
      : { wireAspectRatio: args.aspectRatio }),
  };
}

export function resolveImageModelOutput(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly output?: ProviderOutputOptions;
  readonly inputContext?: NormalizedImageInputContext;
}): ResolvedImageModelOutput {
  const rule = resolveImageModelRule({
    providerId: args.providerId,
    modelId: args.modelId,
  });
  assertOperationSupported(rule, args.operation);

  const matrixOutput = resolveMatrixOutput({
    providerId: args.providerId,
    rule,
    operation: args.operation,
    output: args.output,
    inputContext: args.inputContext,
  });
  if (matrixOutput !== undefined) {
    return matrixOutput;
  }

  const preset = args.output?.sizePreset === '512' ? undefined : args.output?.sizePreset;
  if (preset === undefined) {
    return { rule };
  }

  const aspectRatio = (args.output?.aspectRatio ?? 'auto') as ImageAspectRatio;
  if (rule.capability.variants !== undefined) {
    return resolveVariantOutput({
      rule,
      operation: args.operation,
      preset,
      aspectRatio,
    });
  }
  return resolveConstraintOutput({
    rule,
    operation: args.operation,
    preset,
    aspectRatio,
  });
}

/** Builder 用 canonical selection + normalized input context 解析 provider payload。 */
export function resolveProviderResolvedOutput(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly output?: ProviderOutputOptions;
  readonly inputContext?: NormalizedImageInputContext;
}): ProviderResolvedOutput {
  const rule = resolveImageModelRule({
    providerId: args.providerId,
    modelId: args.modelId,
  });
  assertOperationSupported(rule, args.operation);
  const selection = selectionForOutput(rule, args.output);
  return buildResolvedOutputFromSelection({
    providerId: args.providerId,
    rule,
    operation: args.operation,
    selection,
    inputContext: args.inputContext,
  });
}

export function isSupportedImageModelOutput(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly output?: ProviderOutputOptions;
}): boolean {
  try {
    resolveImageModelOutput(args);
    return true;
  } catch {
    return false;
  }
}

export function getSupportedImageOutputSizePresets(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly aspectRatio?: ProviderOutputOptions['aspectRatio'];
}): readonly ImageSizePreset[] {
  const rule = resolveImageModelRule({
    providerId: args.providerId,
    modelId: args.modelId,
  });
  const aspectRatio = (args.aspectRatio ?? 'auto') as ImageAspectRatio;
  const matrix = outputMatrixForOperation(rule, args.operation);
  if (matrix !== undefined) {
    return Array.from(
      new Set(
        matrix.cells
          .filter((cell) => cell.ratio === aspectRatio)
          .map((cell) => cell.imageSize)
          .filter(isMatrixSizePreset),
      ),
    );
  }

  if (rule.capability.variants !== undefined) {
    return Array.from(
      new Set(
        rule.capability.variants
          .filter(
            (variant) =>
              variant.operation === args.operation && variant.aspectRatio === aspectRatio,
          )
          .map((variant) => variant.preset),
      ),
    );
  }

  const strategy = rule.capability.constraintStrategy;
  if (!strategy) {
    return [];
  }
  const support = operationSupportFromStrategy(strategy, args.operation);
  return support.aspectRatios.includes(aspectRatio) ? support.presets : [];
}

export function validateImageModelCatalog(
  capabilities: readonly ImageModelCapability[] = IMAGE_MODEL_CAPABILITIES,
): readonly string[] {
  const errors: string[] = [];

  for (const capability of capabilities) {
    if (capability.selection.visibleInPicker && (capability.match.ids?.[0]?.trim() ?? '').length === 0) {
      errors.push(`Rule "${capability.ruleId}" is picker-visible but has no canonical id.`);
    }
    if (capability.selection.visibleInPicker && capability.brand === undefined) {
      errors.push(`Rule "${capability.ruleId}" is picker-visible but has no brand.`);
    }
    if (capability.ruleId.endsWith('-default')) {
      errors.push(`Rule "${capability.ruleId}" is a hidden default fallback rule.`);
    }
    if (capability.outputCapability === undefined) {
      errors.push(`Rule "${capability.ruleId}" is missing outputCapability.`);
    }
    if (capability.outputExposure === undefined) {
      errors.push(`Rule "${capability.ruleId}" is missing outputExposure.`);
    }
    if (capability.outputMatrix === undefined && capability.variants === undefined && capability.constraintStrategy === undefined) {
      errors.push(`Rule "${capability.ruleId}" is missing output projection.`);
    }
    validateOutputMatrices(capability, errors);
    const variantKeys = new Set<string>();
    for (const variant of capability.variants ?? []) {
      const key = `${variant.operation}:${variant.preset}:${variant.aspectRatio}`;
      if (variantKeys.has(key)) {
        errors.push(`Rule "${capability.ruleId}" contains duplicate variant "${key}".`);
      }
      variantKeys.add(key);
    }
  }

  for (const providerId of ['image-endpoint', 'chat-image', 'gemini-generate-content'] as const satisfies readonly ImageCatalogProviderId[]) {
    const capabilitiesForProvider = capabilities.filter((capability) => capabilityAppliesToProvider(capability, providerId));
    const exactIds = new Map<string, string>();
    const aliases = new Map<string, string>();
    const prefixes = new Map<string, string>();

    for (const capability of capabilitiesForProvider) {
      for (const id of capability.match.ids ?? []) {
        const key = normalizeModelId(id);
        const owner = exactIds.get(key);
        if (owner && owner !== capability.ruleId) {
          errors.push(`Provider "${providerId}" exact id "${id}" is owned by both "${owner}" and "${capability.ruleId}".`);
        }
        exactIds.set(key, capability.ruleId);
      }
      for (const alias of capability.match.aliases ?? []) {
        const key = normalizeModelId(alias);
        const owner = aliases.get(key);
        if (owner && owner !== capability.ruleId) {
          errors.push(`Provider "${providerId}" alias "${alias}" is owned by both "${owner}" and "${capability.ruleId}".`);
        }
        aliases.set(key, capability.ruleId);
      }
      for (const prefix of capability.match.prefixes ?? []) {
        const key = normalizeModelId(prefix);
        const owner = prefixes.get(key);
        if (owner && owner !== capability.ruleId) {
          errors.push(`Provider "${providerId}" prefix "${prefix}" is owned by both "${owner}" and "${capability.ruleId}".`);
        }
        prefixes.set(key, capability.ruleId);
      }
    }
  }

  return errors;
}

function validateOutputMatrices(capability: ImageModelCapability, errors: string[]): void {
  const operations = new Set<ImageOperation>();
  for (const matrix of capability.outputMatrix ?? []) {
    const geometryKind = capability.outputCapability?.geometry.kind;
    const expectedArchetype = geometryKind === 'flexible-pixels' ? 'size-format' : 'size-aspect-ratio-format';
    if (geometryKind !== undefined && matrix.geometryKind !== geometryKind) {
      errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" geometryKind must match outputCapability geometry.`);
    }
    if (geometryKind !== undefined && matrix.archetype !== expectedArchetype) {
      errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" archetype must match outputCapability geometry.`);
    }
    if (operations.has(matrix.operation)) {
      errors.push(`Rule "${capability.ruleId}" contains duplicate output matrix for operation "${matrix.operation}".`);
    }
    operations.add(matrix.operation);

    const imageSizes = new Set(matrix.imageSizes.map((option) => option.id));
    const ratios = new Set(matrix.ratios.map((option) => option.id));
    const outputFormats = new Set(matrix.outputFormats.map((option) => option.id));
    const cellIds = new Set<string>();
    let defaultCount = 0;

    if (imageSizes.has('512' as ImageOutputImageSize)) {
      errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" exposes legacy imageSize option "512".`);
    }

    for (const cell of matrix.cells) {
      if (cellIds.has(cell.id)) {
        errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" contains duplicate cell "${cell.id}".`);
      }
      cellIds.add(cell.id);
      if (cell.id === matrix.defaultCellId) {
        defaultCount += 1;
      }
      if (!imageSizes.has(cell.imageSize)) {
        errors.push(`Rule "${capability.ruleId}" cell "${cell.id}" references missing imageSize option "${cell.imageSize}".`);
      }
      if (cell.imageSize === ('512' as ImageOutputImageSize)) {
        errors.push(`Rule "${capability.ruleId}" cell "${cell.id}" exposes legacy imageSize "512".`);
      }
      if (!ratios.has(cell.ratio)) {
        errors.push(`Rule "${capability.ruleId}" cell "${cell.id}" references missing ratio option "${cell.ratio}".`);
      }
      if (!outputFormats.has(cell.outputFormat)) {
        errors.push(`Rule "${capability.ruleId}" cell "${cell.id}" references missing outputFormat option "${cell.outputFormat}".`);
      }
      if (cell.selection.outputFormat !== cell.outputFormat) {
        errors.push(`Rule "${capability.ruleId}" cell "${cell.id}" outputFormat must match canonical selection.`);
      }
    }

    if (defaultCount !== 1) {
      errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" defaultCellId "${matrix.defaultCellId}" must reference exactly one cell.`);
    }
    for (const option of imageSizes) {
      if (!matrix.cells.some((cell) => cell.imageSize === option)) {
        errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" imageSize option "${option}" is unused.`);
      }
    }
    for (const option of ratios) {
      if (!matrix.cells.some((cell) => cell.ratio === option)) {
        errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" ratio option "${option}" is unused.`);
      }
    }
    for (const option of outputFormats) {
      if (!matrix.cells.some((cell) => cell.outputFormat === option)) {
        errors.push(`Rule "${capability.ruleId}" matrix "${matrix.operation}" outputFormat option "${option}" is unused.`);
      }
    }
  }
}
