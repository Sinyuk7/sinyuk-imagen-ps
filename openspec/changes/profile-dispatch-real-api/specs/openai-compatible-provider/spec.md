## MODIFIED Requirements

### Requirement: OpenAI-compatible provider SHALL invoke upstream through a unified HTTP transport
provider MUST 通过 `src/transport/openai-compatible/http.ts` 发起统一封装的 HTTP 调用，禁止在 provider 内部直接调用裸 `fetch`。

#### Scenario: Successful generate invocation
- **WHEN** `invoke()` 被调用并传入有效的 config 和 generate request
- **THEN** transport 层构造 OpenAI-compatible HTTP POST 请求至 `{baseURL}/v1/images/generations`
- **AND** 请求包含标准 `Authorization: Bearer {apiKey}` header
- **AND** 请求 body 包含 `prompt`、`model`、`n`、`size`、`response_format`
- **AND** `extraHeaders` 和 `providerOptions` 被正确注入

#### Scenario: Successful edit invocation
- **WHEN** `invoke()` 被调用并传入有效的 config 和 edit request（`operation='edit'`）
- **THEN** transport 层构造 OpenAI-compatible HTTP POST 请求至 `{baseURL}/v1/images/edits`
- **AND** 请求 Content-Type 为 `application/json`
- **AND** 请求 body 包含 `model`、`prompt`、`images`（从 `inputAssets` 映射）
- **AND** 响应通过 `parseResponse()` 归一化为 `Asset[]`

#### Scenario: HTTP transport respects timeout
- **WHEN** config 中指定了 `timeoutMs`
- **THEN** transport 使用 `AbortSignal.timeout(timeoutMs)` 限制单次请求的最大等待时间

## ADDED Requirements

### Requirement: OpenAI-compatible provider SHALL construct edit request body from canonical request
provider MUST 通过 `buildEditRequestBody()` 将 `CanonicalImageJobRequest` 转换为 OpenAI-compatible `/v1/images/edits` 的 JSON request body。

#### Scenario: Edit request body with URL-based input assets
- **WHEN** `buildEditRequestBody()` 收到包含 `inputAssets: [{ url: 'https://example.com/image.png' }]` 的 request
- **THEN** 返回的 body MUST 包含 `images: [{ image_url: 'https://example.com/image.png' }]`
- **AND** body MUST 包含 `prompt` 和 `model` 字段

#### Scenario: Edit request body with base64 data input assets
- **WHEN** `buildEditRequestBody()` 收到包含 `inputAssets: [{ data: 'iVBORw0KGgo...', mimeType: 'image/png' }]` 的 request
- **THEN** 返回的 body MUST 包含 `images: [{ image_url: 'data:image/png;base64,iVBORw0KGgo...' }]`

#### Scenario: Edit request body with mask asset
- **WHEN** `buildEditRequestBody()` 收到包含 `maskAsset: { url: 'https://example.com/mask.png' }` 的 request
- **THEN** 返回的 body MUST 包含 `mask: { image_url: 'https://example.com/mask.png' }`

#### Scenario: Edit request body with multiple input assets
- **WHEN** `buildEditRequestBody()` 收到包含多个 `inputAssets` 的 request
- **THEN** 返回的 body MUST 包含 `images` 数组，每个元素对应一个 input asset

#### Scenario: Edit request body with providerOptions passthrough
- **WHEN** `buildEditRequestBody()` 收到包含 `providerOptions: { quality: 'high', output_format: 'png' }` 的 request
- **THEN** 返回的 body MUST 包含 `quality: 'high'` 和 `output_format: 'png'`
- **AND** 已显式处理的字段（如 `model`）MUST NOT 被重复透传

#### Scenario: Edit request body with output options
- **WHEN** `buildEditRequestBody()` 收到包含 `output: { count: 2 }` 的 request
- **THEN** 返回的 body MUST 包含 `n: 2`

### Requirement: OpenAI-compatible provider SHALL route invoke by operation type
provider 的 `invoke()` 方法 MUST 根据 `request.operation` 路由到正确的 API 端点，MUST NOT 无条件拒绝 edit 操作。

#### Scenario: Generate operation routes to /v1/images/generations
- **WHEN** `invoke()` 收到 `operation='generate'` 的 request
- **THEN** HTTP 请求 MUST 发送至 `{baseURL}/v1/images/generations`
- **AND** request body MUST 由 `buildRequestBody()` 构造

#### Scenario: Edit operation routes to /v1/images/edits
- **WHEN** `invoke()` 收到 `operation='edit'` 的 request
- **THEN** HTTP 请求 MUST 发送至 `{baseURL}/v1/images/edits`
- **AND** request body MUST 由 `buildEditRequestBody()` 构造

#### Scenario: Unknown operation is rejected
- **WHEN** `invoke()` 收到既不是 `'generate'` 也不是 `'edit'` 的 operation
- **THEN** provider MUST 抛出结构化验证错误
