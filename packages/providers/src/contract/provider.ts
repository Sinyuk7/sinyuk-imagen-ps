import type { ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import type {
  ProviderCapabilities,
  ProviderFamily,
  ProviderOperation,
} from './capability.js';
import type { ProviderConfig } from './config.js';
import type { CanonicalImageJobRequest } from './request.js';
import type { ProviderInvokeResult } from './result.js';

/**
 * Provider 主契约与 bridge 契约。
 *
 * `Provider` 拥有 provider semantics；
 * `ProviderDispatchAdapter` 属于 `core-engine` 的最小调用边界；
 * 两者之间通过显式 bridge 连接，避免 engine 反向理解 provider 内部语义。
 */

/** `describe()` 返回的 provider 元数据。 */
export interface ProviderDescriptor {
  /** provider 的稳定标识符。 */
  readonly id: string;

  /** 当前 provider family。 */
  readonly family: ProviderFamily;

  /** 展示名称。 */
  readonly displayName: string;

  /** 能力声明。 */
  readonly capabilities: ProviderCapabilities;

  /** 当前 provider 支持的 operation。 */
  readonly operations: readonly ProviderOperation[];

  /** 可选的配置摘要，供 list / describe 场景使用。 */
  readonly configSummary?: Readonly<Record<string, string | number | boolean>>;
}

/** `invoke()` 的调用参数。 */
export interface ProviderInvokeArgs<TConfig, TRequest> {
  /** 已校验的 provider config。 */
  readonly config: TConfig;

  /** 已校验的 provider request。 */
  readonly request: TRequest;

  /** 可选的取消信号。 */
  readonly signal?: AbortSignal;
}

/** provider 实例需要遵循的最小公开契约。 */
export interface Provider<
  TConfig = ProviderConfig,
  TRequest = CanonicalImageJobRequest,
> {
  /** 当前 provider 的稳定标识符。 */
  readonly id: string;

  /** 当前 provider 所属 family。 */
  readonly family: ProviderFamily;

  /** 返回静态 descriptor。 */
  describe(): ProviderDescriptor;

  /**
   * 校验并收敛 config 输入。
   *
   * 失败时必须抛出可被映射为 `JobError { category: 'validation' }` 的结构化错误。
   */
  validateConfig(input: unknown): TConfig;

  /**
   * 校验并收敛 request 输入。
   *
   * 失败时必须抛出可被映射为 `JobError { category: 'validation' }` 的结构化错误。
   */
  validateRequest(input: unknown): TRequest;

  /**
   * 执行一次 provider 调用并返回归一化结果。
   *
   * 失败时必须抛出可被映射为 `JobError { category: 'provider' }` 的结构化错误。
   */
  invoke(args: ProviderInvokeArgs<TConfig, TRequest>): Promise<ProviderInvokeResult>;
}

/** bridge 创建 `ProviderDispatchAdapter` 所需的输入。 */
export interface ProviderDispatchBridgeArgs<
  TConfig = ProviderConfig,
  TRequest = CanonicalImageJobRequest,
> {
  /** 待适配的 provider 实例。 */
  readonly provider: Provider<TConfig, TRequest>;

  /** 已校验的 provider config。 */
  readonly config: TConfig;
}

/** 从 `Provider` 到 `ProviderDispatchAdapter` 的显式桥接契约。 */
export interface ProviderDispatchBridge<
  TConfig = ProviderConfig,
  TRequest = CanonicalImageJobRequest,
> {
  /**
   * 创建 `core-engine` 可消费的 dispatch adapter。
   *
   * 该 bridge 只负责收敛 provider 语义，不负责 registry、runtime lifecycle
   * 或 transport retry 等实现细节。
   */
  createDispatchAdapter(
    args: ProviderDispatchBridgeArgs<TConfig, TRequest>,
  ): ProviderDispatchAdapter;
}
