## ADDED Requirements

### Requirement: OpenAI-compatible provider SHALL perform config and request validation using Zod
`openai-compatible` provider MUST 使用 Zod schema 验证 config 和 request 输入，失败时 MUST 抛出可映射为 `JobError { category: 'validation' }` 的结构化错误。

#### Scenario: Config validation succeeds
- **WHEN** 传入一个包含 `providerId`、`displayName`、`family='openai-compatible'`、`baseURL`、`apiKey` 的 config 对象
- **THEN** `validateConfig()` 返回收敛后的 `OpenAICompatibleProviderConfig`
- **AND** 可选字段 `defaultModel`、`extraHeaders`、`capabilityHints`、`timeoutMs` 被正确保留或赋予默认值

#### Scenario: Config validation fails on missing required fields
- **WHEN** 传入缺少 `baseURL` 或 `apiKey` 的 config 对象
- **THEN** `validateConfig()` 抛出一个包含 `message` 和 `details.issues` 的错误
- **AND** 该错误 MUST 可被 bridge 层映射为 `JobError { category: 'validation' }`

#### Scenario: Request validation succeeds
- **WHEN** 传入一个包含 `operation='generate'` 和 `prompt` 的 canonical request 对象
- **THEN** `validateRequest()` 返回收敛后的 `CanonicalImageJobRequest`
- **AND** 可选字段 `inputAssets`、`maskAsset`、`output`、`providerOptions` 被正确保留

### Requirement: OpenAI-compatible provider SHALL invoke upstream through a unified HTTP transport
provider MUST 通过 `src/transport/openai-compatible/http.ts` 发起统一封装的 HTTP 调用，禁止在 provider 内部直接调用裸 `fetch`。

#### Scenario: Successful generate invocation
- **WHEN** `invoke()` 被调用并传入有效的 config 和 generate request
- **THEN** transport 层构造 OpenAI-compatible HTTP POST 请求至 `{baseURL}/v1/images/generations`
- **AND** 请求包含标准 `Authorization: Bearer {apiKey}` header
- **AND** 请求 body 包含 `prompt`、`model`、`n`、`size`、`response_format`
- **AND** `extraHeaders` 和 `providerOptions` 被正确注入

#### Scenario: HTTP transport respects timeout
- **WHEN** config 中指定了 `timeoutMs`
- **THEN** transport 使用 `AbortSignal.timeout(timeoutMs)` 限制单次请求的最大等待时间

#### Scenario: Edit invocation is rejected in this phase
- **WHEN** `invoke()` 收到 `operation='edit'` 的 request
- **THEN** provider MUST 在发送 HTTP 请求前拒绝该调用
- **AND** 该拒绝 MUST 以结构化错误形式返回给 bridge 层

### Requirement: OpenAI-compatible transport SHALL retry on transient failures with exponential backoff
transport 层 MUST 对网络错误、429、502/503/504 执行有限重试，使用指数退避策略，并支持 `AbortSignal` 取消。

#### Scenario: Retry on 429 rate limit
- **WHEN** upstream 返回 HTTP 429
- **THEN** transport 在等待指数退避延迟后自动重试
- **AND** 最多重试 3 次
- **AND** 若 signal 已 abort，则立即停止重试并抛出 timeout / abort 错误

#### Scenario: Retry on 503 service unavailable
- **WHEN** upstream 返回 HTTP 503
- **THEN** transport 在等待指数退避延迟后自动重试
- **AND** 最多重试 3 次

#### Scenario: No retry on 4xx client errors
- **WHEN** upstream 返回 HTTP 400 或 401
- **THEN** transport 不执行重试，直接抛出对应错误

### Requirement: OpenAI-compatible provider SHALL map errors to standard failure taxonomy
所有 provider 层错误 MUST 被映射为统一分类，禁止将原始 HTTP 错误直接抛给 runtime。

#### Scenario: Auth failure mapping
- **WHEN** upstream 返回 HTTP 401 或 403
- **THEN** 错误被映射为 `auth_failed`

#### Scenario: Rate limit mapping
- **WHEN** upstream 返回 HTTP 429
- **THEN** 错误被映射为 `rate_limited`

#### Scenario: Upstream unavailable mapping
- **WHEN** upstream 返回 HTTP 502、503、504 或 5xx
- **THEN** 错误被映射为 `upstream_unavailable`

#### Scenario: Network error mapping
- **WHEN** fetch 抛出网络级异常，例如 ECONNRESET 或 DNS 失败
- **THEN** 错误被映射为 `network_error`

#### Scenario: Invalid response mapping
- **WHEN** upstream 返回非 JSON 或缺少预期的 `data` 字段
- **THEN** 错误被映射为 `invalid_response`

#### Scenario: Timeout mapping
- **WHEN** 请求因 `timeoutMs` 或 `AbortSignal` 而中断
- **THEN** 错误被映射为 `timeout`

### Requirement: OpenAI-compatible provider SHALL normalize responses to standard Asset[]
provider MUST 将上游响应归一化为 `ProviderInvokeResult`，其中 `assets` MUST 为 `Asset[]`。

#### Scenario: Response with URL images
- **WHEN** upstream 返回 JSON 中 `data[].url` 存在
- **THEN** `assets` 中每个元素包含 `type='image'`、`url`、以及可选的 `mimeType='image/png'`

#### Scenario: Response with base64 images
- **WHEN** upstream 返回 JSON 中 `data[].b64_json` 存在
- **THEN** `assets` 中每个元素包含 `type='image'`、`data`、以及可选的 `mimeType='image/png'`

#### Scenario: Response includes diagnostics
- **WHEN** 调用过程中发生 retry
- **THEN** `ProviderInvokeResult.diagnostics` 包含结构化诊断记录
- **AND** 诊断记录 SHOULD 描述 retry 的 attempt、delayMs、statusCode 或 kind

### Requirement: OpenAI-compatible provider SHALL be registerable in the provider registry
`openai-compatible` provider 实例 MUST 可通过 `ProviderRegistry.register()` 注册，并可通过 `list()` / `get()` 查询。

#### Scenario: Registry registration and lookup
- **WHEN** 调用 `registerBuiltins(registry)`
- **THEN** registry 中包含 `id='openai-compatible'` 的 provider
- **AND** `registry.get('openai-compatible')` 返回该 provider 实例
- **AND** `registry.list()` 返回的 descriptor 包含正确的 capabilities 和 operations

### Requirement: OpenAI-compatible provider SHALL be adaptable to ProviderDispatchAdapter
`openai-compatible` provider 实例 MUST 可通过 `createDispatchAdapter()` 桥接为 `core-engine` 可消费的 `ProviderDispatchAdapter`。

#### Scenario: Dispatch adapter creation
- **WHEN** 使用 `createDispatchAdapter({ provider, config })` 传入 openai-compatible provider 实例与已校验 config
- **THEN** 返回的 `ProviderDispatchAdapter` 的 `provider` 字段等于 provider 的 `id`
- **AND** 调用 `dispatch()` 时正确执行 request 校验、invoke、结果归一化
- **AND** invoke 失败时抛出 `JobError { category: 'provider' }`
