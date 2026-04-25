## Context

`packages/providers` 已经完成 contract、registry、mock provider 和 bridge，当前 change 的目标是补齐 `openai-compatible` 真正可用的 provider family 链路。

## Goals / Non-Goals

**Goals**
- 实现 `openai-compatible` provider 的完整链路：config/request validation、HTTP 调用、response normalization、error mapping、有限 retry
- 让 provider 可以通过 registry 注册，并以 `ProviderDispatchAdapter` 的形式被 `core-engine` 消费
- 使用 Node 原生 `fetch`，不引入额外 HTTP client
- 保持 transport / provider 边界清晰，避免把 vendor 细节泄漏到 engine

**Non-Goals**
- 不接入厂商原生 SDK
- 不实现 streaming、callback、webhook、websocket
- 不实现 cross-provider 参数统一
- 不实现 settings persistence / secret storage
- 不做端到端 runtime 集成测试

## Decisions

### 1. HTTP 层使用 Node 原生 fetch，并通过统一 transport 模块封装
- **Rationale**: 当前阶段需要最轻量的 HTTP 基础能力，Node 原生 `fetch` 已足够覆盖 images/generations 的同步调用。
- **Alternatives considered**: `axios` / `got` / 厂商 SDK。都拒绝，因为会增加依赖面，并把 vendor 行为带入 provider 层。

### 2. Retry 策略放在 transport 层，并保留可覆盖的 policy 入口
- **Rationale**: retry 是 transport 细节，不应扩散到 provider 或 engine。`httpRequest(..., policy)` 保持最小可覆盖面。
- **Alternatives considered**: 独立 retry package。拒绝，因为当前只需要有限指数退避，拆包收益不高。
- **Externalization strategy**: `defaultRetryPolicy` 提供默认值，调用方可通过 `RetryPolicy` 覆盖 `maxRetries` / `baseDelayMs` / `factor`，不必把这些值硬编码进 provider config。

### 3. 错误映射集中在 `error-map.ts`
- **Rationale**: 所有 HTTP 状态码、网络异常和解析异常都应映射到统一 failure taxonomy，避免 provider 实现分散处理。
- **Alternatives considered**: 在 `provider.ts` 中分支处理或将原始 HTTP error 直接抛给 runtime。都拒绝，因为会重复逻辑并泄漏 transport 细节。

### 4. 响应解析集中在 `parse-response.ts`
- **Rationale**: vendor payload 的解析应该停留在 transport 末端，再向上归一化为 `Asset[]`。
- **Alternatives considered**: 在 provider 中直接解析响应。拒绝，因为会让 provider 同时承担 orchestration 和 vendor parsing。

### 5. 请求构造集中在 `build-request.ts`
- **Rationale**: canonical request 到 OpenAI-compatible body 的映射属于 transport 边界逻辑，provider 只负责调度。
- **Alternatives considered**: 在 provider 中内联拼 body。拒绝，因为会让 provider 同时承担 request mapping 和 invocation。

### 6. Model policy 保持为运行时参数，而不是 provider 类型常量
- **Rationale**: `openai-compatible` 是 family，不是品牌。不同 runtime 可能需要不同 model target，`defaultModel` 只应作为默认值。
- **Alternatives considered**: 在 descriptor 中固化默认 model。拒绝，因为会把运行时策略写死到静态元数据里。

### 7. Provider 实例注册到 builtins，与 mock 并列
- **Rationale**: registry 已经支持静态 builtin registration，最小实现就是把真实 provider 直接加入 `registerBuiltins()`。
- **Alternatives considered**: 动态 discovery / plugin loading。拒绝，因为当前阶段不需要自动发现，也不想扩大 registry 边界。

### 8. Diagnostics 保持可选、结构化，并由 transport 向上游传递
- **Rationale**: `ProviderInvokeResult.diagnostics` 是观察性信息，不是 success contract 的一部分。retry 信息应在 transport 层收集，再由 provider 透传。
- **Alternatives considered**: 返回 raw transport trace，或把 diagnostics 做成强制字段。都拒绝，因为会把 runtime 绑定到 HTTP 细节并制造噪声。
- **Diagnostics shape**: 至少包含 `code='retry'` 的结构化记录；`details` SHOULD 包括 `attempt`、`delayMs`、`statusCode`、`kind`。无 retry 时可省略 diagnostics。

## Risks / Trade-offs

- **[Risk]** 不同 relay 对 OpenAI-compatible 字段支持存在差异
  - **Mitigation**: 用 `extraHeaders` 和 `providerOptions` 提供扩展点，错误映射保持宽容。
- **[Risk]** 真正的 relay URL、apiKey、model name 仍未绑定到具体实例
  - **Mitigation**: 本 change 只实现链路，不绑定具体 deployment；配置由 `OpenAICompatibleProviderConfig` 注入。
- **[Risk]** `ProviderInvokeResult.raw` 的长期稳定性未定
  - **Mitigation**: 按现有 contract 保留 `raw` 作为调试开口，不把 engine 绑定到它。
- **[Trade-off]** 当前阶段不处理 edit 的 multipart/form-data 上传
  - **Mitigation**: 先保证 generate happy path，edit 留给后续 change 处理。

## Migration Plan

- 无迁移。该 change 只新增实现，不改变现有 contract、mock provider、bridge 或 registry 的公开接口。

## Open Questions

- relay URL 和 apiKey 的注入位置仍留给后续 facade / adapter change 决定
- `ProviderInvokeResult.raw` 是否长期保留为稳定公开字段，留给后续 change 决定
