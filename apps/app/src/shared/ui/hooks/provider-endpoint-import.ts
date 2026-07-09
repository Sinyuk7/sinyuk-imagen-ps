import type { ApiFormat, EndpointClassification, ProviderProfile } from '@imagen-ps/application';
import { apiFormatLabel, sanitizeProviderEndpointUrl, type ApiPathDraft, type ProviderConnectionDraft } from './use-provider-settings';

export interface EndpointModelHint {
  readonly apiFormat: ApiFormat;
  readonly modelId: string;
  readonly wireModelId?: string | null;
}

export interface ModelConfigurationEditorSeed {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly modelId?: string | null;
  readonly wireModelId?: string | null;
}

export interface EndpointDraftInterpretation {
  readonly raw: string;
  readonly baseUrlCandidate?: string;
  readonly classification: EndpointClassification;
  readonly status: 'empty' | 'incomplete' | 'unsupported' | 'supported';
  readonly explicitModelHint?: EndpointModelHint;
}

export type EndpointApplyPolicy = 'add-live' | 'detail-same-format';

export type EndpointApplyDecision =
  | {
      readonly kind: 'apply';
      readonly nextConnection: ProviderConnectionDraft;
      readonly nextPaths: ApiPathDraft;
      readonly nextApiFormat: ApiFormat | null;
      readonly feedback: EndpointFeedback | null;
      readonly hint?: EndpointModelHint;
      readonly suggestedAlias?: string;
      readonly diagnostics: ProviderEndpointImportResult['diagnostics'];
    }
  | {
      readonly kind: 'not-applied';
      readonly reason: 'empty' | 'incomplete' | 'unsupported' | 'cross-format';
      readonly nextConnection: ProviderConnectionDraft;
      readonly nextPaths: ApiPathDraft;
      readonly nextApiFormat: ApiFormat | null;
      readonly feedback: EndpointFeedback | null;
      readonly hint?: EndpointModelHint;
      readonly diagnostics: ProviderEndpointImportResult['diagnostics'];
    };

export type AddNewModelAction =
  | { readonly kind: 'open-models-page'; readonly reason: 'no-hint' | 'matched-existing'; readonly matchedModelId?: string }
  | { readonly kind: 'open-editor'; readonly seed: ModelConfigurationEditorSeed };

export interface EndpointFeedback {
  readonly tone: 'positive' | 'negative' | 'warning';
  readonly message: string;
}

export interface EndpointFeedbackMessages {
  readonly apiFormatNeedsPath: string;
  readonly apiFormatUnsupported: string;
  readonly apiFormatDetected: (label: string) => string;
  readonly apiFormatIncomplete: (label: string) => string;
  readonly apiFormatConflict: (current: string, next: string) => string;
}

function nextAlias(baseName: string, profiles: readonly ProviderProfile[]): string {
  const used = new Set(profiles.map((profile) => profile.displayName.trim()));
  if (!used.has(baseName)) {
    return baseName;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function aliasFromEndpointUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.trim().toLowerCase().replace(/\.+$/, '');
    if (!host) {
      return null;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      return host;
    }
    const labels = host.split('.').filter(Boolean);
    for (const label of labels) {
      if (label === 'www' || label === 'api') {
        continue;
      }
      return label;
    }
    return labels[0] ?? null;
  } catch {
    return null;
  }
}

function replaceEndpointUrl(
  connection: ProviderConnectionDraft,
  endpointId: string,
  url: string,
): ProviderConnectionDraft {
  return {
    ...connection,
    endpoints: connection.endpoints.map((endpoint) => (
      endpoint.id === endpointId ? { ...endpoint, url } : endpoint
    )),
  };
}

function rawLooksLikeFullUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

function unsupportedUrlParts(raw: string): EndpointClassification | null {
  try {
    const url = new URL(raw);
    if (url.search.length > 0 || url.hash.length > 0) {
      return { status: 'unsupported', source: 'full-url', reason: 'unsupported-query' };
    }
  } catch {
    return null;
  }
  return null;
}

function baseUrlCandidateFromRaw(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    const versionRoot = url.pathname.split('/').filter(Boolean).find((segment) => /^v\d+(?:beta)?$/i.test(segment));
    return versionRoot ? `${url.origin}/${versionRoot}` : url.origin;
  } catch {
    return undefined;
  }
}

function isIncompleteBaseCandidate(raw: string, classification: EndpointClassification): boolean {
  if (classification.status !== 'unsupported' || classification.reason !== 'unrecognized-path') {
    return false;
  }
  try {
    const url = new URL(raw);
    return /^\/v\d+(?:beta)?$/i.test(url.pathname.replace(/\/+$/, ''));
  } catch {
    return false;
  }
}

function shouldExposeBaseCandidate(classification: EndpointClassification): boolean {
  return classification.status !== 'unsupported' || classification.reason !== 'unsupported-query';
}

export function interpretEndpointDraft(
  rawUrl: string,
  classifyEndpoint: (input: string) => EndpointClassification,
): EndpointDraftInterpretation {
  const raw = sanitizeProviderEndpointUrl(rawUrl);
  const classification = unsupportedUrlParts(raw) ?? classifyEndpoint(raw);
  const status = raw.length === 0
    ? 'empty'
    : classification.status === 'supported'
      ? 'supported'
      : classification.status === 'incomplete' || isIncompleteBaseCandidate(raw, classification)
        ? 'incomplete'
        : 'unsupported';
  const baseUrlCandidate = shouldExposeBaseCandidate(classification) ? baseUrlCandidateFromRaw(raw) : undefined;
  const explicitModelHint = classification.status === 'supported' && classification.extractedModel
    ? {
        apiFormat: classification.apiFormat,
        modelId: classification.extractedModel,
        wireModelId: classification.extractedModel,
      }
    : undefined;
  return {
    raw,
    ...(baseUrlCandidate ? { baseUrlCandidate } : {}),
    classification,
    status,
    ...(explicitModelHint ? { explicitModelHint } : {}),
  };
}

export interface ProviderEndpointImportResult {
  readonly classification: EndpointClassification;
  readonly nextConnection: ProviderConnectionDraft;
  readonly nextPaths: ApiPathDraft;
  readonly nextApiFormat: ApiFormat | null;
  readonly suggestedAlias?: string;
  readonly importedModel?: string;
  readonly shouldUseCustomModel: boolean;
  readonly diagnostics: {
    readonly aliasApplied: boolean;
    readonly aliasCandidate?: string;
    readonly aliasSkippedReason?: 'user-touched' | 'no-base-url' | 'no-candidate' | 'format-conflict';
    readonly importedModel?: string;
  };
}

export function importProviderEndpointInput(args: {
  readonly rawValue?: string;
  readonly interpretation?: EndpointDraftInterpretation;
  readonly apiFormat: ApiFormat | null;
  readonly currentPaths: ApiPathDraft;
  readonly currentConnection: ProviderConnectionDraft;
  readonly endpointId?: string;
  readonly previousConnection?: ProviderConnectionDraft;
  readonly profiles: readonly ProviderProfile[];
  readonly nameTouched: boolean;
  readonly selectedModelId: string;
  readonly defaultPathsForApiFormat: (apiFormat: ApiFormat | null) => ApiPathDraft;
  readonly mergeApiPathDraft: (current: ApiPathDraft, next: unknown, apiFormat: ApiFormat) => ApiPathDraft;
  readonly classifyEndpoint: (input: string) => EndpointClassification;
  readonly normalizeBaseUrlIntoConnection?: boolean;
}): ProviderEndpointImportResult {
  const interpretation = args.interpretation ?? interpretEndpointDraft(args.rawValue ?? '', args.classifyEndpoint);
  const classification = interpretation.classification;
  let nextConnection = args.currentConnection;
  let nextPaths = args.currentPaths;
  let nextApiFormat = args.apiFormat;
  let suggestedAlias: string | undefined;
  let aliasSkippedReason: ProviderEndpointImportResult['diagnostics']['aliasSkippedReason'];

  if (classification.status !== 'unsupported') {
    if (!args.apiFormat) {
      nextApiFormat = classification.apiFormat;
      nextPaths = args.mergeApiPathDraft(
        args.defaultPathsForApiFormat(classification.apiFormat),
        classification.paths,
        classification.apiFormat,
      );
    } else if (args.apiFormat === classification.apiFormat) {
      nextPaths = args.mergeApiPathDraft(args.currentPaths, classification.paths, classification.apiFormat);
    } else {
      aliasSkippedReason = 'format-conflict';
    }

    if (args.endpointId) {
      if (classification.source === 'full-url' && classification.baseUrl && args.normalizeBaseUrlIntoConnection !== false) {
        nextConnection = replaceEndpointUrl(args.currentConnection, args.endpointId, classification.baseUrl);
      } else if (classification.source === 'path') {
        const previousUrl = args.previousConnection?.endpoints.find((endpoint) => endpoint.id === args.endpointId)?.url ?? '';
        nextConnection = replaceEndpointUrl(args.currentConnection, args.endpointId, previousUrl);
      }
    }

    if (classification.source === 'full-url' && classification.baseUrl && !aliasSkippedReason) {
      const candidate = aliasFromEndpointUrl(classification.baseUrl);
      if (!args.nameTouched && candidate) {
        suggestedAlias = nextAlias(candidate, args.profiles);
      } else if (args.nameTouched) {
        aliasSkippedReason = 'user-touched';
      } else if (!candidate) {
        aliasSkippedReason = 'no-candidate';
      }
    } else if (!classification.baseUrl && !aliasSkippedReason) {
      aliasSkippedReason = 'no-base-url';
    }
  }

  const importedModel = classification.status === 'supported' ? classification.extractedModel : undefined;
  return {
    classification,
    nextConnection,
    nextPaths,
    nextApiFormat,
    ...(suggestedAlias ? { suggestedAlias } : {}),
    ...(importedModel ? { importedModel } : {}),
    shouldUseCustomModel: Boolean(importedModel && !args.selectedModelId.trim()),
    diagnostics: {
      aliasApplied: Boolean(suggestedAlias),
      ...(classification.status !== 'unsupported' && classification.source === 'full-url' && classification.baseUrl
        ? { aliasCandidate: aliasFromEndpointUrl(classification.baseUrl) ?? undefined }
        : {}),
      ...(aliasSkippedReason ? { aliasSkippedReason } : {}),
      ...(importedModel ? { importedModel } : {}),
    },
  };
}

function feedbackForInterpretation(args: {
  readonly interpretation: EndpointDraftInterpretation;
  readonly currentApiFormat: ApiFormat | null;
  readonly messages: EndpointFeedbackMessages;
}): EndpointFeedback | null {
  const { interpretation, currentApiFormat, messages } = args;
  const { classification } = interpretation;
  if (interpretation.status === 'empty') {
    return null;
  }
  if (classification.status === 'unsupported') {
    if (rawLooksLikeFullUrl(interpretation.raw)) {
      return { tone: 'warning', message: messages.apiFormatNeedsPath };
    }
    return { tone: 'negative', message: messages.apiFormatUnsupported };
  }
  if (currentApiFormat && currentApiFormat !== classification.apiFormat) {
    return {
      tone: 'negative',
      message: messages.apiFormatConflict(apiFormatLabel(currentApiFormat), apiFormatLabel(classification.apiFormat)),
    };
  }
  if (classification.status === 'supported') {
    return {
      tone: 'positive',
      message: messages.apiFormatDetected(apiFormatLabel(classification.apiFormat)),
    };
  }
  return {
    tone: 'warning',
    message: messages.apiFormatIncomplete(apiFormatLabel(classification.apiFormat)),
  };
}

export function resolveEndpointApply(args: {
  readonly interpretation: EndpointDraftInterpretation;
  readonly policy: EndpointApplyPolicy;
  readonly currentApiFormat: ApiFormat | null;
  readonly currentPaths: ApiPathDraft;
  readonly currentConnection: ProviderConnectionDraft;
  readonly endpointId?: string;
  readonly previousConnection?: ProviderConnectionDraft;
  readonly profiles: readonly ProviderProfile[];
  readonly nameTouched: boolean;
  readonly selectedModelId: string;
  readonly defaultPathsForApiFormat: (apiFormat: ApiFormat | null) => ApiPathDraft;
  readonly mergeApiPathDraft: (current: ApiPathDraft, next: unknown, apiFormat: ApiFormat) => ApiPathDraft;
  readonly classifyEndpoint: (input: string) => EndpointClassification;
  readonly messages: EndpointFeedbackMessages;
  readonly normalizeBaseUrlIntoConnection?: boolean;
}): EndpointApplyDecision {
  const imported = importProviderEndpointInput({
    interpretation: args.interpretation,
    apiFormat: args.policy === 'add-live' ? null : args.currentApiFormat,
    currentPaths: args.currentPaths,
    currentConnection: args.currentConnection,
    endpointId: args.endpointId,
    previousConnection: args.previousConnection,
    profiles: args.profiles,
    nameTouched: args.nameTouched,
    selectedModelId: args.selectedModelId,
    defaultPathsForApiFormat: args.defaultPathsForApiFormat,
    mergeApiPathDraft: args.mergeApiPathDraft,
    classifyEndpoint: args.classifyEndpoint,
    normalizeBaseUrlIntoConnection: args.normalizeBaseUrlIntoConnection,
  });
  const feedback = feedbackForInterpretation({
    interpretation: args.interpretation,
    currentApiFormat: args.policy === 'add-live' ? null : args.currentApiFormat,
    messages: args.messages,
  });
  const fallbackConnection = args.endpointId && args.interpretation.baseUrlCandidate
    ? replaceEndpointUrl(args.currentConnection, args.endpointId, args.interpretation.baseUrlCandidate)
    : args.currentConnection;

  if (args.policy === 'add-live') {
    if (args.interpretation.status !== 'supported') {
      return {
        kind: 'not-applied',
        reason: args.interpretation.status === 'empty' ? 'empty' : args.interpretation.status === 'incomplete' ? 'incomplete' : 'unsupported',
        nextConnection: fallbackConnection,
        nextPaths: args.defaultPathsForApiFormat(null),
        nextApiFormat: null,
        feedback,
        ...(args.interpretation.explicitModelHint ? { hint: args.interpretation.explicitModelHint } : {}),
        diagnostics: imported.diagnostics,
      };
    }
    return {
      kind: 'apply',
      nextConnection: imported.nextConnection,
      nextPaths: imported.nextPaths,
      nextApiFormat: imported.nextApiFormat,
      feedback,
      ...(args.interpretation.explicitModelHint ? { hint: args.interpretation.explicitModelHint } : {}),
      ...(imported.suggestedAlias ? { suggestedAlias: imported.suggestedAlias } : {}),
      diagnostics: imported.diagnostics,
    };
  }

  if (args.interpretation.status !== 'supported') {
    return {
      kind: 'not-applied',
      reason: args.interpretation.status === 'empty' ? 'empty' : args.interpretation.status === 'incomplete' ? 'incomplete' : 'unsupported',
      nextConnection: args.previousConnection ?? args.currentConnection,
      nextPaths: args.currentPaths,
      nextApiFormat: args.currentApiFormat,
      feedback,
      ...(args.interpretation.explicitModelHint ? { hint: args.interpretation.explicitModelHint } : {}),
      diagnostics: imported.diagnostics,
    };
  }
  if (args.currentApiFormat && args.interpretation.classification.status === 'supported' && args.interpretation.classification.apiFormat !== args.currentApiFormat) {
    return {
      kind: 'not-applied',
      reason: 'cross-format',
      nextConnection: args.previousConnection ?? args.currentConnection,
      nextPaths: args.currentPaths,
      nextApiFormat: args.currentApiFormat,
      feedback,
      ...(args.interpretation.explicitModelHint ? { hint: args.interpretation.explicitModelHint } : {}),
      diagnostics: imported.diagnostics,
    };
  }
  return {
    kind: 'apply',
    nextConnection: imported.nextConnection,
    nextPaths: imported.nextPaths,
    nextApiFormat: imported.nextApiFormat,
    feedback,
    ...(args.interpretation.explicitModelHint ? { hint: args.interpretation.explicitModelHint } : {}),
    diagnostics: imported.diagnostics,
  };
}

export function resolveAddNewModelAction(
  profile: Pick<ProviderProfile, 'profileId' | 'apiFormat'>,
  hint: EndpointModelHint | null | undefined,
  ownedModels: readonly ({ readonly modelId: string } | { readonly id: string })[],
): AddNewModelAction {
  if (!hint || hint.apiFormat !== profile.apiFormat) {
    return { kind: 'open-models-page', reason: 'no-hint' };
  }
  const matched = ownedModels.some((model) => {
    const modelId = 'modelId' in model ? model.modelId : model.id;
    return modelId === hint.modelId;
  });
  if (matched) {
    return { kind: 'open-models-page', reason: 'matched-existing', matchedModelId: hint.modelId };
  }
  return {
    kind: 'open-editor',
    seed: {
      profileId: profile.profileId,
      apiFormat: hint.apiFormat,
      modelId: hint.modelId,
      wireModelId: hint.wireModelId ?? hint.modelId,
    },
  };
}

export function importDetectionFallbackMessage(args: {
  readonly classification: EndpointClassification;
  readonly rawValue: string;
  readonly currentApiFormat: ApiFormat | null;
  readonly messages: EndpointFeedbackMessages;
}): EndpointFeedback | null {
  return feedbackForInterpretation({
    interpretation: {
      raw: sanitizeProviderEndpointUrl(args.rawValue),
      classification: args.classification,
      status: args.classification.status === 'supported'
        ? 'supported'
        : args.classification.status === 'incomplete'
          ? 'incomplete'
          : 'unsupported',
    },
    currentApiFormat: args.currentApiFormat,
    messages: args.messages,
  });
}
