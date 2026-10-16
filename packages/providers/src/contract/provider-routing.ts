/**
 * API format 与 endpoint/path 归一化契约。
 */

export type ProviderId = 'openai' | 'google-gemini' | 'grsai' | 'runninghub';
type EndpointProviderId = Exclude<ProviderId, 'runninghub'>;

export type ProviderAdapterId = 'openai' | 'google-gemini' | 'grsai';

export type AuthMode = 'bearer' | 'x-goog-api-key' | 'none';

export interface OpenAiImagesPaths {
  /** OpenAI Images 生成路径。 */
  readonly generation: string;
  /** OpenAI Images 编辑路径。 */
  readonly edit?: string;
}

export interface GoogleGeminiPaths {
  /** Gemini GenerateContent 调用路径模板。 */
  readonly invokeTemplate: string;
}

/** GRSAI 异步生成与结果查询路径。 */
export interface GrsaiPaths {
  /** GRSAI 异步任务提交路径。 */
  readonly submit: string;
  /** GRSAI 异步任务结果查询路径。 */
  readonly result: string;
}

export type ProviderIdPaths =
  | OpenAiImagesPaths
  | GoogleGeminiPaths
  | GrsaiPaths;

export type EndpointClassificationSource = 'full-url' | 'path';

export type EndpointClassificationReason =
  | 'missing-generation-path'
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'unsupported-query'
  | 'unsupported-fragment'
  | 'unrecognized-path'
  | 'ambiguous-endpoint';

export type EndpointClassification =
  | {
      readonly status: 'supported';
      readonly providerId: ProviderId;
      readonly source: EndpointClassificationSource;
      readonly baseUrl?: string;
      readonly paths: ProviderIdPaths;
      readonly extractedModel?: string;
    }
  | {
      readonly status: 'incomplete';
      readonly providerId: ProviderId;
      readonly source: EndpointClassificationSource;
      readonly baseUrl?: string;
      readonly paths: Partial<OpenAiImagesPaths>;
      readonly reason: Extract<EndpointClassificationReason, 'missing-generation-path'>;
    }
  | {
      readonly status: 'unsupported';
      readonly source?: EndpointClassificationSource;
      readonly reason: Exclude<EndpointClassificationReason, 'missing-generation-path'>;
    };

const PROVIDER_TO_ADAPTER = {
  'openai': 'openai',
  'google-gemini': 'google-gemini',
  grsai: 'grsai',
} as const satisfies Record<EndpointProviderId, ProviderAdapterId>;

const DEFAULT_PATHS = {
  'openai': { generation: '/images/generations', edit: '/images/edits' },
  'google-gemini': { invokeTemplate: '/models/{model}:generateContent' },
  grsai: { submit: '/v1/api/generate', result: '/v1/api/result' },
} as const satisfies Record<EndpointProviderId, ProviderIdPaths>;

function defaultPortForScheme(protocol: string): string | undefined {
  if (protocol === 'http:') {
    return '80';
  }
  if (protocol === 'https:') {
    return '443';
  }
  return undefined;
}

function hasUnsafeDotSegment(pathname: string): boolean {
  return pathname.split('/').some((segment) => segment === '.' || segment === '..');
}

function normalizeBasePath(pathname: string): string {
  if (pathname.length === 0 || pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/+$/, '');
}

/** API format 对应的内部 adapter id。 */
export function adapterIdForProviderId(providerId: EndpointProviderId): ProviderAdapterId {
  return PROVIDER_TO_ADAPTER[providerId];
}

/** 内部 adapter id 对应的 API format。 */
export function providerIdForAdapterId(implementationId: ProviderAdapterId): EndpointProviderId {
  switch (implementationId) {
    case 'openai':
      return 'openai';
    case 'google-gemini':
      return 'google-gemini';
    case 'grsai':
      return 'grsai';
  }
}

/** API format 的默认 path 配置。 */
export function defaultPathsForProviderId(providerId: EndpointProviderId): ProviderIdPaths {
  return DEFAULT_PATHS[providerId];
}

/** 规范化 endpoint base URL。 */
export function canonicalizeProviderBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('\\')) {
    throw new Error('Endpoint base URL must not include backslashes.');
  }
  const url = new URL(trimmed);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endpoint base URL must use http or https.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Endpoint base URL must not include embedded credentials.');
  }
  if (url.search.length > 0) {
    throw new Error('Endpoint base URL must not include query strings.');
  }
  if (url.hash.length > 0) {
    throw new Error('Endpoint base URL must not include fragments.');
  }
  if (hasUnsafeDotSegment(url.pathname)) {
    throw new Error('Endpoint base URL must not include unsafe dot segments.');
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.port === defaultPortForScheme(url.protocol)) {
    url.port = '';
  }
  url.pathname = normalizeBasePath(url.pathname);
  return url.toString();
}

/** 规范化 API path。 */
export function normalizeApiPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('API path must not be empty.');
  }
  if (trimmed.includes('\\')) {
    throw new Error('API path must not include backslashes.');
  }
  if (trimmed.includes('?') || trimmed.includes('#')) {
    throw new Error('API path must not include query strings or fragments.');
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withSlash.replace(/\/+$/, '');
  if (hasUnsafeDotSegment(normalized)) {
    throw new Error('API path must not include unsafe dot segments.');
  }
  return normalized.length > 0 ? normalized : '/';
}

/** 安全拼接 base URL 与 API path，保留 base path prefix。 */
export function assembleApiUrl(baseUrl: string, path: string): string {
  const base = canonicalizeProviderBaseUrl(baseUrl).replace(/\/+$/, '');
  const normalizedPath = normalizeApiPath(path).replace(/^\/+/, '');
  return `${base}/${normalizedPath}`;
}

/** 按 API format 归一化 path config。 */
export function normalizeProviderIdPaths(providerId: EndpointProviderId, paths: unknown): ProviderIdPaths {
  const defaults = defaultPathsForProviderId(providerId);
  const record = typeof paths === 'object' && paths !== null && !Array.isArray(paths)
    ? paths as Record<string, unknown>
    : {};

  if (providerId === 'openai') {
    const generation = typeof record.generation === 'string' ? record.generation : (defaults as OpenAiImagesPaths).generation;
    const edit = typeof record.edit === 'string' ? record.edit : (defaults as OpenAiImagesPaths).edit;
    return {
      generation: normalizeApiPath(generation),
      ...(edit !== undefined && edit.trim().length > 0 ? { edit: normalizeApiPath(edit) } : {}),
    };
  }

  if (providerId === 'grsai') {
    const submit = typeof record.submit === 'string' ? record.submit : (defaults as GrsaiPaths).submit;
    const result = typeof record.result === 'string' ? record.result : (defaults as GrsaiPaths).result;
    return { submit: normalizeApiPath(submit), result: normalizeApiPath(result) };
  }

  const invokeTemplate = typeof record.invokeTemplate === 'string'
    ? record.invokeTemplate
    : (defaults as GoogleGeminiPaths).invokeTemplate;
  if (!invokeTemplate.includes('{model}')) {
    throw new Error('Gemini GenerateContent invokeTemplate must include {model}.');
  }
  return { invokeTemplate: normalizeApiPath(invokeTemplate) };
}

function baseUrlForMatchedPath(url: URL, prefixPath: string): string {
  const clone = new URL(url.toString());
  clone.search = '';
  clone.hash = '';
  clone.pathname = prefixPath.length > 0 ? prefixPath : '/';
  return canonicalizeProviderBaseUrl(clone.toString());
}

function sourceForInput(trimmed: string): EndpointClassificationSource {
  return /^https?:\/\//i.test(trimmed) ? 'full-url' : 'path';
}

function classifyPathname(
  pathname: string,
  source: EndpointClassificationSource,
  url?: URL,
): EndpointClassification {
  const generation = pathname.match(/^(.*)\/images\/generations\/?$/);
  if (generation) {
    return {
      status: 'supported',
      providerId: 'openai',
      source,
      ...(url ? { baseUrl: baseUrlForMatchedPath(url, generation[1] ?? '') } : {}),
      paths: { generation: '/images/generations' },
    };
  }

  const edit = pathname.match(/^(.*)\/images\/edits\/?$/);
  if (edit) {
    return {
      status: 'incomplete',
      providerId: 'openai',
      source,
      ...(url ? { baseUrl: baseUrlForMatchedPath(url, edit[1] ?? '') } : {}),
      paths: { edit: '/images/edits' },
      reason: 'missing-generation-path',
    };
  }

  const gemini = pathname.match(/^(.*)\/models\/([^/]+):generateContent\/?$/);
  if (gemini) {
    const rawModel = gemini[2] ?? '';
    const decodedModel = decodeURIComponent(rawModel);
    const isTemplate = decodedModel === '{model}';
    return {
      status: 'supported',
      providerId: 'google-gemini',
      source,
      ...(url ? { baseUrl: baseUrlForMatchedPath(url, gemini[1] ?? '') } : {}),
      paths: { invokeTemplate: '/models/{model}:generateContent' },
      ...(!isTemplate ? { extractedModel: decodedModel } : {}),
    };
  }

  const grsai = pathname.match(/^(.*)\/v1\/api\/generate\/?$/);
  if (grsai) {
    return {
      status: 'supported',
      providerId: 'grsai',
      source,
      ...(url ? { baseUrl: baseUrlForMatchedPath(url, grsai[1] ?? '') } : {}),
      paths: { submit: '/v1/api/generate', result: '/v1/api/result' },
    };
  }

  return { status: 'unsupported', source, reason: 'unrecognized-path' };
}

/** 将 full endpoint URL 或 path 分类成受支持的 API format。 */
export function classifyEndpoint(input: string): EndpointClassification {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { status: 'unsupported', reason: 'invalid-url' };
  }
  if (trimmed.includes('\\')) {
    return { status: 'unsupported', reason: 'invalid-url' };
  }

  const source = sourceForInput(trimmed);
  if (source === 'path') {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return { status: 'unsupported', reason: 'unsupported-scheme' };
    }
    if (!trimmed.startsWith('/')) {
      return { status: 'unsupported', source, reason: 'invalid-url' };
    }
    return classifyPathname(trimmed, source);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { status: 'unsupported', source, reason: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { status: 'unsupported', source, reason: 'unsupported-scheme' };
  }
  if (url.search.length > 0) {
    return { status: 'unsupported', source, reason: 'unsupported-query' };
  }
  if (url.hash.length > 0) {
    return { status: 'unsupported', source, reason: 'unsupported-fragment' };
  }
  return classifyPathname(url.pathname, source, url);
}
