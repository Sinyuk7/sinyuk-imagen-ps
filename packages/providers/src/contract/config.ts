import type { ProviderFamily } from './capability.js';
import type {
  AuthMode,
  GeminiGenerateContentPaths,
  OpenAiChatCompletionsPaths,
  OpenAiImagesPaths,
} from './api-format.js';
import { canonicalizeProviderBaseUrl } from './api-format.js';

/**
 * Provider config 契约。
 *
 * 当前阶段以“可接入实例”而不是“厂商品牌”建模。
 * `connection.endpoints[].url` 是 relay、proxy 或 gateway base URL；
 * `apiKey` 默认按 Bearer 风格理解，非标准鉴权通过 `extraHeaders` 扩展；
 * `defaultModel` 只提供默认路由，不替代请求时的 model target。
 */

export type ProviderEndpointSelectionMode = 'manual' | 'auto';

/** 单个可选 endpoint 的配置形状。 */
export interface ProviderEndpointConfig {
  /** endpoint 的稳定标识符。 */
  readonly id: string;

  /** endpoint 的规范化 URL。 */
  readonly url: string;

  /** endpoint 是否启用。 */
  readonly enabled: boolean;
}

/** Provider profile 的 endpoint collection 配置。 */
export interface ProviderConnectionConfig {
  /** endpoint 排序来源。 */
  readonly selectionMode: ProviderEndpointSelectionMode;

  /** manual 模式下的当前选中 endpoint。 */
  readonly selectedEndpointId?: string;

  /** 当前 profile 的 endpoint 集合。 */
  readonly endpoints: readonly ProviderEndpointConfig[];
}

/**
 * 规范化 endpoint base URL。
 */
export function canonicalizeProviderEndpointUrl(input: string): string {
  return canonicalizeProviderBaseUrl(input);
}

type ConnectionInput = {
  readonly selectionMode?: unknown;
  readonly selectedEndpointId?: unknown;
  readonly endpoints?: unknown;
};

/**
 * 接受 canonical `connection`，返回规范化 collection。
 */
export function normalizeProviderConnection(input: {
  readonly connection?: unknown;
}): ProviderConnectionConfig {
  if (input.connection === undefined || typeof input.connection !== 'object' || input.connection === null) {
    throw new Error('Provider config requires connection.endpoints.');
  }

  const connection = input.connection as ConnectionInput;
  const selectionMode = connection.selectionMode === 'auto' ? 'auto' : 'manual';
  if (!Array.isArray(connection.endpoints) || connection.endpoints.length === 0) {
    throw new Error('Provider connection requires at least one endpoint.');
  }

  const ids = new Set<string>();
  const urls = new Set<string>();
  const endpoints = connection.endpoints.map((endpoint, index) => {
    if (typeof endpoint !== 'object' || endpoint === null) {
      throw new Error(`Provider endpoint at index ${index} must be an object.`);
    }
    const record = endpoint as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id.length === 0) {
      throw new Error(`Provider endpoint at index ${index} requires id.`);
    }
    if (ids.has(id)) {
      throw new Error(`Provider connection contains duplicate endpoint id "${id}".`);
    }
    const rawUrl = typeof record.url === 'string' ? record.url : '';
    const url = canonicalizeProviderEndpointUrl(rawUrl);
    if (urls.has(url)) {
      throw new Error(`Provider connection contains duplicate endpoint URL "${url}".`);
    }
    const enabled = record.enabled !== false;
    ids.add(id);
    urls.add(url);
    return { id, url, enabled };
  });

  const enabledEndpoints = endpoints.filter((endpoint) => endpoint.enabled);
  if (enabledEndpoints.length === 0) {
    throw new Error('Provider connection requires at least one enabled endpoint.');
  }

  const selectedEndpointId = typeof connection.selectedEndpointId === 'string' && connection.selectedEndpointId.trim().length > 0
    ? connection.selectedEndpointId.trim()
    : undefined;

  if (selectionMode === 'manual') {
    if (!selectedEndpointId) {
      throw new Error('Manual endpoint selection requires selectedEndpointId.');
    }
    if (!enabledEndpoints.some((endpoint) => endpoint.id === selectedEndpointId)) {
      throw new Error(`Manual endpoint selection requires selectedEndpointId "${selectedEndpointId}" to reference an enabled endpoint.`);
    }
  }

  return {
    selectionMode,
    ...(selectionMode === 'manual' && selectedEndpointId ? { selectedEndpointId } : {}),
    endpoints,
  };
}

/** 当前连接是否由系统自动选择 endpoint。 */
export function providerConnectionUsesAutomaticSelection(connection: ProviderConnectionConfig): boolean {
  return connection.selectionMode === 'auto';
}

/** 当前连接是否允许在 endpoint 之间自动切换。 */
export function providerConnectionAllowsFailover(connection: ProviderConnectionConfig): boolean {
  return providerConnectionUsesAutomaticSelection(connection) && connection.endpoints.filter((endpoint) => endpoint.enabled).length > 1;
}

/** 解析本次 provider 调用的首选 endpoint。 */
export function getPrimaryProviderEndpoint(connection: ProviderConnectionConfig): ProviderEndpointConfig {
  const enabledEndpoints = connection.endpoints.filter((endpoint) => endpoint.enabled);
  if (connection.selectionMode === 'manual') {
    const selected = enabledEndpoints.find((endpoint) => endpoint.id === connection.selectedEndpointId);
    if (!selected) {
      throw new Error('Manual endpoint selection requires a valid enabled selected endpoint.');
    }
    return selected;
  }
  return enabledEndpoints[0]!;
}

/** `/v1/images/*` endpoint provider instance 的配置形状。 */
export interface ImageEndpointProviderConfig {
  /** Provider instance 的稳定标识符。 */
  readonly providerId: string;

  /** 用于 UI / 日志展示的可读名称。 */
  readonly displayName: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** 当前 profile 使用的 API format。 */
  readonly apiFormat: 'openai-images';

  /** Images endpoint relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

  /** OpenAI Images API path 配置。 */
  readonly paths: OpenAiImagesPaths;

  /** Provider instance 使用的 API key。 */
  readonly apiKey: string;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 兼容非标准 relay 鉴权或路由所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

/** Chat/multimodal image provider instance 的配置形状。 */
export interface ChatImageProviderConfig {
  /** Provider instance 的稳定标识符。 */
  readonly providerId: string;

  /** 用于 UI / 日志展示的可读名称。 */
  readonly displayName: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** 当前 profile 使用的 API format。 */
  readonly apiFormat: 'openai-chat-completions';

  /** Chat-compatible relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

  /** Chat Completions API path 配置。 */
  readonly paths: OpenAiChatCompletionsPaths;

  /** Provider instance 使用的 API key。 */
  readonly apiKey: string;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 兼容非标准 relay 鉴权或路由所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

/** Gemini Generate Content provider instance 的鉴权模式。 */
export type GeminiGenerateContentAuthMode = Extract<AuthMode, 'x-goog-api-key' | 'bearer' | 'none'>;

/** Gemini Generate Content provider instance 的配置形状。 */
export interface GeminiGenerateContentProviderConfig {
  /** Provider instance 的稳定标识符。 */
  readonly providerId: string;

  /** 用于 UI / 日志展示的可读名称。 */
  readonly displayName: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** 当前 profile 使用的 API format。 */
  readonly apiFormat: 'gemini-generate-content';

  /** Gemini-compatible relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

  /** Gemini GenerateContent API path template 配置。 */
  readonly paths: GeminiGenerateContentPaths;

  /** Gemini Generate Content 使用的鉴权 secret。 */
  readonly apiKey?: string;

  /** Provider instance 使用的显式鉴权模式。 */
  readonly authMode: GeminiGenerateContentAuthMode;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 兼容非标准 gateway 所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

export type ProviderBillingMode =
  | { readonly mode: 'none' }
  | { readonly mode: 'official' }
  | {
      readonly mode: 'new-api';
      readonly userId: string;
      readonly accessTokenSecretRef: string;
    };

export interface BillingEnabledProviderConfig {
  /** Provider profile 级 billing 配置。 */
  readonly billing?: ProviderBillingMode;
}

/** 当前阶段稳定公开的 provider config 联合。 */
export type ProviderConfig =
  | (ImageEndpointProviderConfig & BillingEnabledProviderConfig)
  | (ChatImageProviderConfig & BillingEnabledProviderConfig)
  | GeminiGenerateContentProviderConfig;
