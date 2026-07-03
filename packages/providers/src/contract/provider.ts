import type { ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import type { Logger } from '@imagen-ps/foundation';
import type { ProviderFamily, ProviderOperation } from './capability.js';
import type {
  ExactTaskCost,
  ProviderBalanceQueryInput,
  ProviderBalanceSnapshot,
} from './billing.js';
import type { ProviderConfig } from './config.js';
import type { ProviderModelInfo } from './model.js';
import type { CanonicalImageJobRequest, ProviderRequest } from './request.js';
import type { ProviderInvokeResult } from './result.js';

/**
 * Provider 主契约与 bridge 契约。
 *
 * `Provider` 拥有 provider semantics；
 * `ProviderDispatchAdapter` 属于 `core-engine` 的最小调用边界；
 * 两者之间通过显式 bridge 连接，避免 engine 反向理解 provider 内部语义。
 */

/**
 * `describe()` 返回的 provider 元数据。
 *
 * 关于历史 `configSummary` 字段（OPEN_ITEMS providers#1 决策结果）：
 * 已移除。`describe()` 是**纯静态** descriptor，不承担"针对某份运行时 config 的
 * 动态摘要"职责。如未来需要展示已配置参数，应另起独立 API（例如
 * `provider.summarizeConfig(config)`），把静态描述与运行时摘要分离，避免在
 * 静态结构上挂动态语义。
 */
export interface ProviderDescriptor {
  /** provider 的稳定标识符。 */
  readonly id: string;

  /** 当前 provider family。仅作分类/展示标签（如 profile UI 分组），不参与调用、校验或兜底。 */
  readonly family: ProviderFamily;

  /** 展示名称。 */
  readonly displayName: string;

  /** 当前 provider 支持的 operation。任务级 guard 的唯一依据。 */
  readonly operations: readonly ProviderOperation[];

  /** 调用模式；运行时预留，当前无消费者。 */
  readonly invokeMode: 'sync' | 'async';

  /**
   * Implementation 自带的 fallback model 候选清单（OPTIONAL）。
   *
   * 语义为"当 profile 没有任何 discovery 缓存时，作为该 implementation 的兜底候选"。
   * 该字段 MUST NOT 参与 `provider.invoke()` 的 model 解析（model 解析仍由
   * `model-selection` 三级优先级负责，不得耦合到本字段）。
   *
   * 是否声明 `defaultModels` 由 implementation 自由决定；空数组与未声明在
   * `listProfileModels` 行为上等价（均视为"无 implementation 兜底"）。
   */
  readonly defaultModels?: readonly ProviderModelInfo[];

  /**
   * 传输层能力与付费重试策略（OPTIONAL）。
   *
   * 仅影响付费生成请求的 transport 自动重试边界与 idempotency key 透传；
   * 未声明时 transport 按保守的付费默认策略处理（见
   * `transport/image-endpoint/paid-retry.ts`）。
   */
  readonly transport?: ProviderTransportCapability;

  /** provider-specific billing capability declaration（OPTIONAL）。 */
  readonly billing?: ProviderBillingCapability;
}

/**
 * Provider 传输层能力声明。
 *
 * 用于把「provider 是否支持可靠 idempotency key」与「付费重试数值策略」显式表达，
 * 而不是隐式假设所有 provider 行为一致。
 */
export interface ProviderTransportCapability {
  /**
   * Provider 后端是否对付费生成请求支持可靠的 idempotency key。
   *
   * - `'supported'`：transport 会为每次逻辑请求生成稳定的 `Idempotency-Key` header
   *   透传给后端，并对 502/504/`network_error` 这类模糊失败恢复自动重试（重试安全）。
   * - `'unsupported'` 或未声明：transport 对模糊失败不自动重试，避免重复扣费。
   */
  readonly idempotency?: 'supported' | 'unsupported';

  /**
   * 付费生成请求的 retry 数值策略覆盖（OPTIONAL）。
   *
   * 未声明时使用 `defaultPaidRetryPolicy`。「哪些错误可重试」的分类由 transport
   * 内部决定，与此数值无关。此处用结构化类型而非直接引用 transport 的
   * `RetryPolicy`，避免 contract 反向依赖 transport 层。
   */
  readonly retryPolicy?: { readonly maxRetries: number; readonly baseDelayMs: number; readonly factor: number };

  /**
   * provider 声明的 wire 兼容能力（OPTIONAL）。
   *
   * 当前仅用于 image-edit 请求方言与响应 codec 的静态声明；
   * 具体解析、缓存与 fallback 仍由 `packages/providers` transport 内部拥有。
   */
  readonly wire?: ProviderWireCapability;
}

/** Image edit 请求体方言。 */
export type ImageEditCodec = 'multipart-bracket' | 'multipart-plain' | 'json-reference';

/** 当前 provider 响应解析 codec。 */
export type ProviderResponseCodec = 'json';

/** Provider 的 wire 兼容能力声明。 */
export interface ProviderWireCapability {
  /** provider 声明支持的 image-edit 请求方言。 */
  readonly supportedEditCodecs?: readonly ImageEditCodec[];

  /** provider 声明的 image-edit 默认尝试顺序。 */
  readonly defaultEditCodecOrder?: readonly ImageEditCodec[];

  /** provider 声明的响应 codec。 */
  readonly responseCodecs?: readonly ProviderResponseCodec[];
}

export interface ProviderBillingCapability {
  /** 支持的余额查询模式。 */
  readonly supportedModes: readonly ('none' | 'official' | 'new-api')[];

  /** 已知 preset 的缺省模式。 */
  readonly defaultMode?: 'official' | 'new-api' | 'none';
}

/** `invoke()` 的调用参数。 */
export interface ProviderInvokeArgs<TConfig, TRequest> {
  /** 已校验的 provider config。 */
  readonly config: TConfig;

  /** 已校验的 provider request。 */
  readonly request: TRequest;

  /** 可选的取消信号。 */
  readonly signal?: AbortSignal;

  /** 可选 Logger；未提供时 provider 内部不发送日志。 */
  readonly logger?: Logger;
}

/** provider 实例需要遵循的最小公开契约。 */
export interface Provider<TConfig = ProviderConfig, TRequest = CanonicalImageJobRequest> {
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

  /**
   * Implementation 的运行时 model discovery 能力（OPTIONAL）。
   *
   * 语义为"向上游或 implementation 内部数据源询问当前可用的 model 候选清单"。
   * 该方法 MUST 是无状态查询：不得修改 `config`、不得写入任何 host 持久化状态。
   * 可选 `logger` 仅用于记录 discovery 诊断信息，不得改变返回语义。
   *
   * 是否实现 `discoverModels` 由 implementation 自由决定；未实现时调用方
   * （`refreshProfileModels`）MUST 视为"该 implementation 不支持 discovery"
   * 并返回 validation error。实现可能抛错以表示 discovery 失败，调用方
   * SHALL 按 `refreshProfileModels` 失败语义处理。
   */
  discoverModels?(config: TConfig, logger?: Logger): Promise<readonly ProviderModelInfo[]>;

  /**
   * Provider-specific billing query（OPTIONAL）。
   *
   * 与 model invocation 兼容性分离；失败不得被调用方解释为 provider 不可生成。
   */
  queryBalance?(config: TConfig, input: ProviderBalanceQueryInput): Promise<ProviderBalanceSnapshot>;

  /**
   * 从 provider invoke result 提取精确或部分精确的单次远端请求成本（OPTIONAL）。
   */
  extractTaskCost?(result: ProviderInvokeResult): ExactTaskCost | undefined;
}

/** bridge 创建 `ProviderDispatchAdapter` 所需的输入。 */
export interface ProviderDispatchBridgeArgs<TConfig = ProviderConfig, TRequest extends ProviderRequest = ProviderRequest> {
  /** 待适配的 provider 实例。 */
  readonly provider: Provider<TConfig, TRequest>;

  /** 已校验的 provider config。 */
  readonly config: TConfig;

  /** 可选 Logger；会传递给 provider.invoke()。 */
  readonly logger?: Logger;
}

/** 从 `Provider` 到 `ProviderDispatchAdapter` 的显式桥接契约。 */
export interface ProviderDispatchBridge<TConfig = ProviderConfig, TRequest extends ProviderRequest = ProviderRequest> {
  /**
   * 创建 `core-engine` 可消费的 dispatch adapter。
   *
   * 该 bridge 只负责收敛 provider 语义，不负责 registry、runtime lifecycle
   * 或 transport retry 等实现细节。
   */
  createDispatchAdapter(args: ProviderDispatchBridgeArgs<TConfig, TRequest>): ProviderDispatchAdapter;
}
