import type { ApiFormat, EndpointClassification, ProviderProfile } from '@imagen-ps/application';
import { apiFormatLabel, sanitizeProviderEndpointUrl, type ApiPathDraft, type ProviderConnectionDraft } from './use-provider-settings';

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
  readonly rawValue: string;
  readonly apiFormat: ApiFormat | null;
  readonly currentPaths: ApiPathDraft;
  readonly currentConnection: ProviderConnectionDraft;
  readonly endpointId?: string;
  readonly previousConnection?: ProviderConnectionDraft;
  readonly profiles: readonly ProviderProfile[];
  readonly nameTouched: boolean;
  readonly defaultModel: string;
  readonly defaultPathsForApiFormat: (apiFormat: ApiFormat | null) => ApiPathDraft;
  readonly mergeApiPathDraft: (current: ApiPathDraft, next: unknown, apiFormat: ApiFormat) => ApiPathDraft;
  readonly classifyEndpoint: (input: string) => EndpointClassification;
  readonly normalizeBaseUrlIntoConnection?: boolean;
}): ProviderEndpointImportResult {
  const sanitized = sanitizeProviderEndpointUrl(args.rawValue);
  const classification = args.classifyEndpoint(sanitized);
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
    shouldUseCustomModel: Boolean(importedModel && !args.defaultModel.trim()),
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

export function importDetectionFallbackMessage(args: {
  readonly classification: EndpointClassification;
  readonly rawValue: string;
  readonly currentApiFormat: ApiFormat | null;
  readonly messages: {
    readonly apiFormatNeedsPath: string;
    readonly apiFormatUnsupported: string;
    readonly apiFormatDetected: (label: string) => string;
    readonly apiFormatIncomplete: (label: string) => string;
    readonly apiFormatConflict: (current: string, next: string) => string;
  };
}): { readonly tone: 'positive' | 'negative' | 'warning'; readonly message: string } | null {
  const { classification, rawValue, currentApiFormat, messages } = args;
  if (classification.status === 'unsupported') {
    const trimmed = rawValue.trim();
    if (/^https?:\/\//i.test(trimmed) && !currentApiFormat) {
      return { tone: 'warning', message: messages.apiFormatNeedsPath };
    }
    if (trimmed.length > 0 && !currentApiFormat) {
      return { tone: 'negative', message: messages.apiFormatUnsupported };
    }
    return null;
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
