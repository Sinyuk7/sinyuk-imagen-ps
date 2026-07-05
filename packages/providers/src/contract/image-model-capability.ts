import type { ProviderOperation } from './capability.js';
import type {
  ModelOperationCapability,
  ProviderModelAvailabilityReason,
  ProviderModelCapabilities,
  ProviderModelInfo,
  ProviderModelMatchKind,
  ProviderModelSupportStatus,
} from './model.js';
import type { ProviderOutputOptions } from './request.js';
import { IMAGE_MODEL_CAPABILITIES } from './image-model-catalog/catalog.js';

export type ImageCatalogProviderId = 'image-endpoint' | 'chat-image' | 'gemini-generate-content';
export type ImageOperation = Extract<ProviderOperation, 'text_to_image' | 'image_edit'>;
export type ImageSizePreset = NonNullable<ProviderOutputOptions['sizePreset']>;
export type ImageAspectRatio = 'auto' | 'source' | '1:1' | '16:9' | '9:16';

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
  readonly selection: {
    readonly visibleInPicker: boolean;
    readonly allowAsDefault?: boolean;
  };
  readonly appliesToProviders?: readonly ImageCatalogProviderId[];
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

function defaultCapabilityForProvider(
  providerId: ImageCatalogProviderId,
  capabilities: readonly ImageModelCapability[],
): ImageModelCapability {
  const defaultCapability = capabilities.find(
    (capability) =>
      capability.ruleId.endsWith('-default') && capabilityAppliesToProvider(capability, providerId),
  );
  if (!defaultCapability) {
    throw new ImageModelContractError(`Provider "${providerId}" is missing a default image model rule.`);
  }
  return defaultCapability;
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

function supportStatusForConfiguredModel(args: {
  readonly locallySupported: boolean;
  readonly remotelyAvailable: boolean;
}): ProviderModelSupportStatus {
  if (!args.locallySupported) {
    throw new ImageModelContractError('Configured model must be locally supported.', {
      locallySupported: args.locallySupported,
      remotelyAvailable: args.remotelyAvailable,
    });
  }
  return args.remotelyAvailable ? 'selectable' : 'saved-undiscovered';
}

function availabilityReasonForStatus(status: ProviderModelSupportStatus): ProviderModelAvailabilityReason | undefined {
  switch (status) {
    case 'saved-undiscovered':
      return 'not-remotely-available';
    case 'selectable':
    default:
      return undefined;
  }
}

function buildProviderModelInfo(
  capability: ImageModelCapability,
  overrides?: Partial<ProviderModelInfo>,
): ProviderModelInfo {
  const id = overrides?.id ?? canonicalModelIdForCapability(capability);
  const locallySupported = overrides?.locallySupported ?? true;
  const remotelyAvailable = overrides?.remotelyAvailable;
  const supportStatus = overrides?.supportStatus ??
    supportStatusForConfiguredModel({
      locallySupported,
      remotelyAvailable: remotelyAvailable ?? capability.discovery?.requireRemotePresence !== true,
    });
  const availabilityReason = availabilityReasonForStatus(supportStatus);
  return {
    id,
    displayName: overrides?.displayName ?? capability.displayName,
    ruleId: overrides?.ruleId ?? capability.ruleId,
    matchKind: overrides?.matchKind,
    pickerVisible: overrides?.pickerVisible ?? capability.selection.visibleInPicker,
    locallySupported,
    ...(remotelyAvailable !== undefined ? { remotelyAvailable } : {}),
    supportStatus,
    availability: overrides?.availability ?? {
      status: supportStatus,
      ...(availabilityReason !== undefined ? { reason: availabilityReason } : {}),
    },
    capabilities: overrides?.capabilities ?? summarizeCapabilityForRule({
      capability,
      matchKind: overrides?.matchKind,
    }),
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
  const resolved = resolveImageModelRule(args);
  return summarizeCapabilityForRule({
    capability: resolved.capability,
    matchKind: resolved.matchKind,
  });
}

export function resolveImageModelRule(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly capabilities?: readonly ImageModelCapability[];
}): ResolvedImageModelRule {
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

  const fallback = defaultCapabilityForProvider(args.providerId, capabilities);
  return {
    ruleId: fallback.ruleId,
    concreteModelId: modelId,
    capability: fallback,
    matchKind: 'default',
  };
}

export function listLocalCatalogModels(providerId: ImageCatalogProviderId): readonly ProviderModelInfo[] {
  return visibleCapabilitiesForProvider(providerId, IMAGE_MODEL_CAPABILITIES).map((capability) =>
    buildProviderModelInfo(capability, {
      matchKind: 'exact',
      supportStatus: 'selectable',
    }),
  );
}

export function reconcileDiscoveredCatalogModels(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly discoveredModels: readonly ProviderModelInfo[];
}): readonly ProviderModelInfo[] {
  const discoveredRuleIds = new Set<string>();
  for (const model of args.discoveredModels) {
    const resolved = resolveImageModelRule({
      providerId: args.providerId,
      modelId: model.id,
    });
    if (
      resolved.matchKind !== 'default' &&
      resolved.capability.selection.visibleInPicker &&
      resolved.capability.discovery?.requireRemotePresence !== false
    ) {
      discoveredRuleIds.add(resolved.ruleId);
    }
  }

  return visibleCapabilitiesForProvider(args.providerId, IMAGE_MODEL_CAPABILITIES)
    .filter((capability) => discoveredRuleIds.has(capability.ruleId))
    .map((capability) =>
      buildProviderModelInfo(capability, {
        matchKind: 'exact',
        remotelyAvailable: true,
        supportStatus: 'selectable',
      }),
    );
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
}): ResolvedImageModelOutput {
  const rule = resolveImageModelRule({
    providerId: args.providerId,
    modelId: args.modelId,
  });
  assertOperationSupported(rule, args.operation);

  const preset = args.output?.sizePreset;
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
    if (capability.variants === undefined && capability.constraintStrategy === undefined) {
      errors.push(`Rule "${capability.ruleId}" is missing variants or constraintStrategy.`);
    }
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
