import type { ProviderCapabilities, ProviderFamily } from './capability.js';

/**
 * Provider config 契约。
 *
 * 当前阶段以“可接入实例”而不是“厂商品牌”建模。
 * `baseURL` 可以指向 relay、proxy 或 gateway；
 * `apiKey` 默认按 Bearer 风格理解，非标准鉴权通过 `extraHeaders` 扩展；
 * `defaultModel` 只提供默认路由，不替代请求时的 model target。
 */

/** `openai-compatible` provider instance 的配置形状。 */
export interface OpenAICompatibleProviderConfig {
  /** Provider instance 的稳定标识符。 */
  readonly providerId: string;

  /** 用于 UI / 日志展示的可读名称。 */
  readonly displayName: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** OpenAI-compatible relay / proxy / gateway 的基地址。 */
  readonly baseURL: string;

  /** Provider instance 使用的 API key。 */
  readonly apiKey: string;

  /** 缺省 model target。 */
  readonly defaultModel?: string;

  /** 兼容非标准 relay 鉴权或路由所需的附加 headers。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;

  /** 对 capability 的静态 hint，不代表自动探测结果。 */
  readonly capabilityHints?: Partial<ProviderCapabilities>;

  /** 单次 invoke 的默认超时。 */
  readonly timeoutMs?: number;
}

/** 当前阶段稳定公开的 provider config 联合。 */
export type ProviderConfig = OpenAICompatibleProviderConfig;
