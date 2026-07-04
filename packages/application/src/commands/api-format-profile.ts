import {
  classifyEndpoint,
  defaultPathsForApiFormat,
  implementationIdForApiFormat,
  normalizeApiFormatPaths,
  type ApiFormat,
  type ApiFormatPaths,
  type ProviderImplementationId,
} from '@imagen-ps/providers';
import type { ProviderProfile, ProviderProfileConfig } from './types.js';

const CATALOG_PROVIDER_BY_API_FORMAT = {
  'openai-images': 'image-endpoint',
  'openai-chat-completions': 'chat-image',
  'gemini-generate-content': 'gemini-generate-content',
} as const satisfies Record<ApiFormat, ProviderImplementationId>;

export function providerImplementationIdForApiFormat(apiFormat: ApiFormat): ProviderImplementationId {
  return implementationIdForApiFormat(apiFormat);
}

export function catalogProviderIdForApiFormat(apiFormat: ApiFormat): ProviderImplementationId {
  return CATALOG_PROVIDER_BY_API_FORMAT[apiFormat];
}

export function isApiFormat(value: unknown): value is ApiFormat {
  return value === 'openai-images'
    || value === 'openai-chat-completions'
    || value === 'gemini-generate-content';
}

export function apiFormatFromProfile(profile: ProviderProfile): ApiFormat {
  return profile.apiFormat;
}

function firstEndpointUrl(config: ProviderProfileConfig): string | undefined {
  const connection = config.connection;
  if (typeof connection !== 'object' || connection === null || Array.isArray(connection)) {
    return undefined;
  }
  const endpoints = (connection as { readonly endpoints?: unknown }).endpoints;
  if (!Array.isArray(endpoints)) {
    return undefined;
  }
  const first = endpoints.find((endpoint) => typeof endpoint === 'object' && endpoint !== null) as
    | { readonly url?: unknown }
    | undefined;
  return typeof first?.url === 'string' ? first.url : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePaths(apiFormat: ApiFormat, existing: unknown, incoming: unknown): ApiFormatPaths {
  return normalizeApiFormatPaths(apiFormat, {
    ...(defaultPathsForApiFormat(apiFormat) as unknown as Record<string, unknown>),
    ...(isRecord(existing) ? existing : {}),
    ...(isRecord(incoming) ? incoming : {}),
  });
}

export function resolveProfileApiFormat(args: {
  readonly profileId: string;
  readonly existing?: ProviderProfile;
  readonly incomingApiFormat?: ApiFormat;
  readonly config: ProviderProfileConfig;
}): ApiFormat {
  const classifiedEndpoint = firstEndpointUrl(args.config);
  const classification = classifiedEndpoint ? classifyEndpoint(classifiedEndpoint) : undefined;
  const classifiedApiFormat = classification?.status === 'supported' ? classification.apiFormat : undefined;
  const apiFormat = args.incomingApiFormat ?? args.existing?.apiFormat ?? classifiedApiFormat;
  if (!apiFormat) {
    throw new Error(`Provider profile "${args.profileId}" requires apiFormat or a recognized endpoint URL.`);
  }
  if (classifiedApiFormat !== undefined && classifiedApiFormat !== apiFormat) {
    throw new Error(`Provider profile "${args.profileId}" endpoint API format "${classifiedApiFormat}" does not match apiFormat "${apiFormat}".`);
  }
  return apiFormat;
}

export function normalizeProfileApiPaths(apiFormat: ApiFormat, config: ProviderProfileConfig): ApiFormatPaths {
  return normalizeApiFormatPaths(apiFormat, config.paths);
}

export function normalizeProfileApiConfig(apiFormat: ApiFormat, config: ProviderProfileConfig): ProviderProfileConfig {
  const connection = isRecord(config.connection) ? config.connection : undefined;
  const endpoints = Array.isArray(connection?.endpoints) ? connection.endpoints : undefined;
  let paths: ApiFormatPaths = normalizeApiFormatPaths(apiFormat, config.paths);
  const nextEndpoints = endpoints?.map((endpoint) => {
    if (!isRecord(endpoint) || typeof endpoint.url !== 'string') {
      return endpoint;
    }
    const classification = classifyEndpoint(endpoint.url);
    if (classification.status === 'unsupported') {
      return endpoint;
    }
    if (classification.apiFormat !== apiFormat) {
      throw new Error(`Endpoint URL API format "${classification.apiFormat}" does not match profile apiFormat "${apiFormat}".`);
    }
    if (classification.baseUrl === undefined) {
      paths = mergePaths(apiFormat, paths, classification.paths);
      return endpoint;
    }
    paths = mergePaths(apiFormat, paths, classification.paths);
    return { ...endpoint, url: classification.baseUrl };
  });

  return {
    ...config,
    paths: paths as unknown as ProviderProfileConfig[string],
    ...(connection && nextEndpoints
      ? {
          connection: {
            ...connection,
            endpoints: nextEndpoints,
          } as unknown as ProviderProfileConfig[string],
        }
      : {}),
  };
}
