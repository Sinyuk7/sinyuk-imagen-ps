import type { ProviderFamily } from './capability.js';

/**
 * Provider config 契约。
 *
 * 当前阶段以“可接入实例”而不是“厂商品牌”建模。
 * `connection.endpoints[].url` 可以指向 relay、proxy 或 gateway；
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

  /** 是否允许在 endpoint 之间切换。 */
  readonly failoverEnabled: boolean;

  /** manual 模式下的首选 endpoint。 */
  readonly preferredEndpointId?: string;

  /** 当前 profile 的 endpoint 集合。 */
  readonly endpoints: readonly ProviderEndpointConfig[];
}

function defaultPortForScheme(protocol: string): string | undefined {
  if (protocol === 'http:') {
    return '80';
  }
  if (protocol === 'https:') {
    return '443';
  }
  return undefined;
}

/**
 * 规范化 endpoint URL。
 *
 * 规则：
 * - trim 首尾空白；
 * - scheme / hostname 转小写；
 * - 保留 path 与 query；
 * - path 为空时补 `/`；
 * - path 非根路径时去掉尾随 `/`；
 * - 禁止 fragment；
 * - 禁止内嵌用户名密码。
 */
export function canonicalizeProviderEndpointUrl(input: string): string {
  const trimmed = input.trim();
  const url = new URL(trimmed);
  if (url.hash.length > 0) {
    throw new Error('Endpoint URL must not include fragments.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Endpoint URL must not include embedded credentials.');
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.port === defaultPortForScheme(url.protocol)) {
    url.port = '';
  }
  if (url.pathname.length === 0) {
    url.pathname = '/';
  }
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

type ConnectionInput = {
  readonly selectionMode?: unknown;
  readonly failoverEnabled?: unknown;
  readonly preferredEndpointId?: unknown;
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
  const failoverEnabled = connection.failoverEnabled === true;
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

  const preferredEndpointId =
    typeof connection.preferredEndpointId === 'string' && connection.preferredEndpointId.trim().length > 0
      ? connection.preferredEndpointId.trim()
      : undefined;

  if (selectionMode === 'manual') {
    if (!preferredEndpointId) {
      throw new Error('Manual endpoint selection requires preferredEndpointId.');
    }
    if (!enabledEndpoints.some((endpoint) => endpoint.id === preferredEndpointId)) {
      throw new Error(`Manual endpoint selection requires preferredEndpointId "${preferredEndpointId}" to reference an enabled endpoint.`);
    }
  }

  return {
    selectionMode,
    failoverEnabled,
    ...(preferredEndpointId ? { preferredEndpointId } : {}),
    endpoints,
  };
}

/** 解析本次 provider 调用的首选 endpoint。 */
export function getPrimaryProviderEndpoint(connection: ProviderConnectionConfig): ProviderEndpointConfig {
  const enabledEndpoints = connection.endpoints.filter((endpoint) => endpoint.enabled);
  if (connection.selectionMode === 'manual') {
    const preferred = enabledEndpoints.find((endpoint) => endpoint.id === connection.preferredEndpointId);
    if (!preferred) {
      throw new Error('Manual endpoint selection requires a valid enabled preferred endpoint.');
    }
    return preferred;
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

  /** Images endpoint relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

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

  /** Chat-compatible relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

  /** Provider instance 使用的 API key。 */
  readonly apiKey: string;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 兼容非标准 relay 鉴权或路由所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

/** Prompt optimization provider instance 的配置形状。 */
export interface PromptOptimizeProviderConfig {
  /** Provider instance 的稳定标识符。 */
  readonly providerId: string;

  /** 用于 UI / 日志展示的可读名称。 */
  readonly displayName: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** Chat-compatible relay / proxy / gateway 的连接集合。 */
  readonly connection: ProviderConnectionConfig;

  /** Provider instance 使用的 API key。 */
  readonly apiKey: string;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 优化提示词时注入 system message 的指令文本，必填。 */
  readonly instruction: string;

  /** 验证连通性时使用的测试 prompt，缺省为 `'test'`。 */
  readonly testPrompt?: string;

  /** 兼容非标准 relay 鉴权或路由所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

/** 当前阶段稳定公开的 provider config 联合。 */
export type ProviderConfig =
  | ImageEndpointProviderConfig
  | ChatImageProviderConfig
  | PromptOptimizeProviderConfig;
