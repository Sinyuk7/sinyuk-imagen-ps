import type { Logger } from '@imagen-ps/foundation';
import type { ProviderFamily, ProviderOperation } from './capability.js';
import type { ApiFormat, ApiFormatPaths, AuthMode } from './api-format.js';
import type {
  ExactTaskCost,
  ProviderBalanceQueryInput,
  ProviderBalanceQueryResult,
  ProviderBillingCapability,
} from './billing.js';
import type { ProviderConfig } from './config.js';
import type { CanonicalImageJobRequest } from './request.js';
import type { ProviderInvokeResult } from './result.js';

/**
 * Provider 主契约。
 *
 * `Provider` 拥有 provider semantics；backend-neutral execution bridge 位于
 * `bridge/`，避免本契约反向依赖 Core adapter 命名。
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

  /** 用户/profile 面向的 canonical API format。 */
  readonly apiFormat?: ApiFormat;

  /** 展示名称。 */
  readonly displayName: string;

  /** 当前 provider 支持的 operation。任务级 guard 的唯一依据。 */
  readonly operations: readonly ProviderOperation[];

  /** 调用模式；运行时预留，当前无消费者。 */
  readonly invokeMode: 'sync' | 'async';

  /** 创建 Profile 时一次性写入的完整默认模型模板；空数组保留手动配置路径。 */
  readonly defaultModelTemplates: readonly ProviderDefaultModelTemplate[];

  /** 创建 Profile 时使用的固定、无 secret 配置模板。 */
  readonly profileTemplate?: ProviderProfileTemplate;

  /**
   * 传输层能力与付费重试策略（OPTIONAL）。
   *
   * 仅影响付费生成请求的 transport 自动重试边界与 idempotency key 透传；
   * 未声明时 transport 按保守的付费默认策略处理（见
   * `shared/transport/paid-retry.ts`）。
   */
  readonly transport?: ProviderTransportCapability;

  /** provider-specific billing capability declaration（OPTIONAL）。 */
  readonly billing?: ProviderBillingCapability;

  /** 设置页连通性能力声明（OPTIONAL）。 */
  readonly connectivity?: ProviderSettingsConnectivityCapability;
}

/** Provider 为专用 Profile surface 声明的固定、无 secret 配置。 */
export interface ProviderProfileTemplate {
  /** 固定 endpoint base URL。 */
  readonly endpointUrl: string;
  /** 固定 API paths。 */
  readonly paths: ApiFormatPaths;
  /** 固定鉴权模式。 */
  readonly authMode: AuthMode;
  /** 新 Profile 的显式默认模型。 */
  readonly defaultModelId: string;
}

/** Provider 为新 Profile 声明的完整本地默认模型数据。 */
export interface ProviderDefaultModelTemplate {
  /** 模板所属 API format，必须与 Provider descriptor 相同。 */
  readonly apiFormat: ApiFormat;
  /** Profile 内唯一的用户模型标识。 */
  readonly modelId: string;
  /** Provider 请求实际使用的 wire model 标识。 */
  readonly wireModelId: string;
  /** Official Model Preset 的精确 model 标识，也是能力来源。 */
  readonly baseModelId: string;
}

/** 设置页连通性能力声明。 */
export interface ProviderSettingsConnectivityCapability {
  /** 是否支持逐 endpoint 测速。 */
  readonly endpointMeasurement?: 'supported' | 'unsupported';

  /** 是否支持 provider 级连接测试。 */
  readonly connectionTest?: 'supported' | 'unsupported';
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

/** Provider 异步提交的 canonical 结果。 */
export type ProviderAsyncSubmitResult =
  | { readonly status: 'completed'; readonly result: ProviderInvokeResult }
  | {
    readonly status: 'pending';
    /** provider-local、secret-free 的不透明远端任务引用。 */
    readonly remoteRef: string;
    /** provider 建议的下一次查询等待时间。 */
    readonly nextPollAfterMs?: number;
  };

/** Provider 异步查询的 canonical 结果。 */
export type ProviderAsyncPollResult =
  | { readonly status: 'completed'; readonly result: ProviderInvokeResult }
  | {
    readonly status: 'pending';
    /** provider 建议的下一次查询等待时间。 */
    readonly nextPollAfterMs?: number;
    /** 非权威进度事实；当前不进入跨包状态机。 */
    readonly progress?: number;
  }
  | { readonly status: 'failed'; readonly error: Error };

/** Provider-owned async submit/query protocol。 */
export interface ProviderAsyncLifecycle<TConfig, TRequest> {
  /** 单次 logical execution 的唯一提交入口。 */
  submit(args: ProviderInvokeArgs<TConfig, TRequest>): Promise<ProviderAsyncSubmitResult>;

  /** 只查询先前 submit 返回的同一个 remote reference。 */
  poll(args: {
    readonly remoteRef: string;
    readonly signal?: AbortSignal;
    readonly logger?: Logger;
  }): Promise<ProviderAsyncPollResult>;
}

/** Application composition 注入 provider bridge 的异步执行参数。 */
export interface ProviderAsyncExecutionArgs {
  readonly jobId: string;
  readonly lifecycle: ProviderAsyncLifecycle<ProviderConfig, CanonicalImageJobRequest>;
  readonly invokeArgs: ProviderInvokeArgs<ProviderConfig, CanonicalImageJobRequest>;
}

/** Application composition 注入 provider bridge 的异步执行端口。 */
export interface ProviderAsyncExecutionExecutor {
  execute(args: ProviderAsyncExecutionArgs): Promise<ProviderInvokeResult>;
}

/** endpoint 测速失败分类。 */
export type ProviderEndpointMeasurementFailureKind =
  | 'dns'
  | 'connect'
  | 'timeout'
  | 'auth'
  | 'rate-limit'
  | 'invalid-response'
  | 'unsupported'
  | 'unknown';

/** 单个 endpoint 的测速结果。 */
export interface ProviderEndpointMeasurement {
  /** 被测 endpoint 标识。 */
  readonly endpointId: string;

  /** 测速完成时间。 */
  readonly checkedAt: number;

  /** 是否测通。 */
  readonly reachable: boolean;

  /** 成功或失败前的耗时。 */
  readonly latencyMs?: number;

  /** 失败分类。 */
  readonly failureKind?: ProviderEndpointMeasurementFailureKind;

  /** 安全错误摘要。 */
  readonly errorMessage?: string;

  /** 可选 HTTP 状态码。 */
  readonly httpStatus?: number;
}

/** endpoint 测速调用选项。 */
export interface ProviderEndpointMeasurementOptions {
  /** 可选取消信号。 */
  readonly signal?: AbortSignal;

  /** 可选单 endpoint 超时。 */
  readonly timeoutMs?: number;

  /** 可选并发度。 */
  readonly maxConcurrency?: number;

  /** 可选 Logger。 */
  readonly logger?: Logger;
}

/** endpoint 测速返回值。 */
export interface ProviderEndpointMeasurementResult {
  /** provider 是否支持测速。 */
  readonly supported: boolean;

  /** 测速结果列表。 */
  readonly results: readonly ProviderEndpointMeasurement[];

  /** 不支持或整体失败时的安全提示。 */
  readonly message?: string;
}

/** provider 级连通性测试结果。 */
export type ProviderSafeProbeStatus = 'verified' | 'partial' | 'failed';

export type ProviderSafeProbeReason =
  | 'verified'
  | 'safe_probe_unsupported'
  | 'local_validation_failed'
  | 'model_id_required'
  | 'auth_rejected'
  | 'service_rate_limited'
  | 'service_unavailable'
  | 'endpoint_unreachable'
  | 'protocol_mismatch'
  | 'unknown_failure';

export interface ProviderSafeProbeContext {
  /** application 层解析出的待验证 modelId。 */
  readonly modelId?: string;
}

export interface ProviderSafeProbeResult {
  /** 三态结果。 */
  readonly status: ProviderSafeProbeStatus;

  /** 归一化原因码。 */
  readonly reason: ProviderSafeProbeReason;

  /** provider 级摘要消息。 */
  readonly message?: string;

  /** 可选 HTTP 状态码。 */
  readonly httpStatus?: number;
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
   * Provider 专属的异步 submit/query 协议（OPTIONAL）。
   * 声明后必须与 descriptor `invokeMode: 'async'` 一致。
   */
  readonly asyncLifecycle?: ProviderAsyncLifecycle<TConfig, TRequest>;

  /**
   * Implementation 的 endpoint 测速能力（OPTIONAL）。
   *
   * 用于设置页逐个 endpoint 的非持久化测速。返回值必须是安全摘要，不得泄露
   * secret-bearing config、原始 header 或敏感 payload。
   */
  measureEndpoints?(config: TConfig, options?: ProviderEndpointMeasurementOptions): Promise<ProviderEndpointMeasurementResult>;

  /**
   * Implementation 的 provider 级无生成安全探针（OPTIONAL）。
   *
   * 该能力只负责命中 provider 自己最接近真实调用面的无副作用验证接口，
   * 不负责 application 层的本地校验、状态文案或保存策略。
   */
  safeProbe?(config: TConfig, context: ProviderSafeProbeContext, logger?: Logger): Promise<ProviderSafeProbeResult>;

  /**
   * Provider-specific billing query（OPTIONAL）。
   *
   * 与 model invocation 兼容性分离；失败不得被调用方解释为 provider 不可生成。
   */
  queryBalance?(config: TConfig, input: ProviderBalanceQueryInput): Promise<ProviderBalanceQueryResult>;

  /**
   * 从 provider invoke result 提取精确或部分精确的单次远端请求成本（OPTIONAL）。
   */
  extractTaskCost?(result: ProviderInvokeResult): ExactTaskCost | undefined;
}
