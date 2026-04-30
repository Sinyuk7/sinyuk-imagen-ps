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

`invoke()` MUST 按 `request.operation` 路由到对应端点：

- `operation === 'generate'` → `POST {baseURL}/v1/images/generations`，body 由 `buildRequestBody()` 构造。
- `operation === 'edit'` → `POST {baseURL}/v1/images/edits`，body 由 `buildEditRequestBody()` 构造。

两条路径 MUST 复用相同的 `httpRequest()`、`parseResponse()`、错误映射与 `diagnostics` 汇集链路。

#### Scenario: Successful generate invocation
- **WHEN** `invoke()` 被调用并传入有效的 config 和 generate request
- **THEN** transport 层构造 OpenAI-compatible HTTP POST 请求至 `{baseURL}/v1/images/generations`
- **AND** 请求包含标准 `Authorization: Bearer {apiKey}` header
- **AND** 请求 body 包含 `prompt`、`model`，以及根据 `request.output` 映射后的 `n`、`size`、`quality`、`background`、`output_format`、`output_compression`、`moderation` 等官方字段
- **AND** 非 GPT image 模型时 body 默认包含 `response_format: 'url'`
- **AND** `extraHeaders` 和 `providerOptions` 被正确注入

#### Scenario: HTTP transport respects timeout
- **WHEN** config 中指定了 `timeoutMs`
- **THEN** transport 使用 `AbortSignal.timeout(timeoutMs)` 限制单次请求的最大等待时间

#### Scenario: Successful edit invocation
- **WHEN** `invoke()` 被调用并传入有效的 config 和 `operation: 'edit'` 的 request
- **THEN** transport 层构造 HTTP POST 请求至 `{baseURL}/v1/images/edits`
- **AND** 请求 body 为 JSON 对象，包含 `model`、`prompt`、`images` 数组
- **AND** 根据 `request.output` 映射后的 `n`、`size`、`quality`、`background`、`output_format`、`output_compression`、`moderation`、`input_fidelity` 字段出现在 body 中
- **AND** 可选的 `maskAsset` 被映射到 body 的 `mask` 字段
- **AND** 复用 `httpRequest()` 与 `parseResponse()` 管线

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
provider MUST 将上游响应归一化为 `ProviderInvokeResult`。

- `assets` MUST 为 `Asset[]`；每个 asset 的 `mimeType` 与生成文件名后缀 SHALL 根据响应顶层 `output_format` 字段推断：`png → image/png (.png)`、`jpeg → image/jpeg (.jpg)`、`webp → image/webp (.webp)`；响应未提供 `output_format` 时回退 `image/png (.png)`。
- `created`、`usage`、`metadata` SHALL 按 contract 约定从响应中解析并填充到 `ProviderInvokeResult`；上游未提供对应字段时 MUST 省略该字段（不写 `undefined`）。
- `raw` 字段 MUST 保留为原始响应 `data` 以支持调试。

#### Scenario: Response with URL images
- **WHEN** upstream 返回 JSON 中 `data[].url` 存在，且 `output_format` 缺省
- **THEN** `assets` 中每个元素包含 `type='image'`、`url`、`mimeType='image/png'`、`name='generated-{i+1}.png'`

#### Scenario: Response with base64 images and output_format=webp
- **WHEN** upstream 返回 JSON 中 `data[].b64_json` 存在，且顶层 `output_format === 'webp'`
- **THEN** `assets` 中每个元素包含 `type='image'`、`data`、`mimeType='image/webp'`、`name='generated-{i+1}.webp'`

#### Scenario: Response exposes usage and metadata
- **WHEN** upstream 响应体包含 `usage` 和/或 `output_format` / `quality` / `size` / `background` 字段
- **THEN** `ProviderInvokeResult.usage` MUST 以 camelCase 形态承载 token 统计
- **AND** `ProviderInvokeResult.metadata` MUST 以 camelCase 形态承载上游元数据
- **AND** 上游未返回 `usage` 时 result 省略 `usage` 字段
- **AND** 上游未返回任何元数据字段时 result 省略 `metadata` 字段

#### Scenario: Response includes diagnostics
- **WHEN** 调用过程中发生 retry
- **THEN** `ProviderInvokeResult.diagnostics` 包含结构化诊断记录
- **AND** 诊断记录 SHOULD 描述 retry 的 attempt、delayMs、statusCode 或 kind

### Requirement: OpenAI-compatible descriptor SHALL truthfully reflect implementation capabilities
`openaiCompatibleDescriptor` MUST 声明与 provider 当前实现一致的能力集合：

- `capabilities.imageGenerate: true`
- `capabilities.imageEdit: true`
- `capabilities.transparentBackground: true` — GPT image 系列支持 `background: 'transparent'`。
- `operations: ['generate', 'edit']`

Descriptor MUST NOT 声明 provider 实现未提供的能力（如 streaming），亦 MUST NOT 隐藏已实现的能力。

#### Scenario: Descriptor declares both generate and edit operations
- **WHEN** 调用方读取 `createOpenAICompatibleProvider().describe()`
- **THEN** `operations` MUST 等于 `['generate', 'edit']`
- **AND** `capabilities.imageEdit` MUST 为 `true`
- **AND** `capabilities.transparentBackground` MUST 为 `true`

### Requirement: Edit request body SHALL map inputAssets and maskAsset per OpenAPI contract
`buildEditRequestBody()` MUST 按以下规则构造 `/v1/images/edits` 的 JSON body：

- `images: Array<{ file_id?: string; image_url?: string }>`，由 `request.inputAssets[]` 映射而来；每个 asset MUST 恰好映射为一个 `{ file_id }` 或 `{ image_url }` 对象，优先级为：
  1. 若 `asset.fileId` 非空，映射为 `{ file_id: asset.fileId }`。
  2. 否则若 `asset.url` 非空，映射为 `{ image_url: asset.url }`。
  3. 否则若 `asset.data` 非空，映射为 `{ image_url: 'data:{mimeType};base64,{data}' }`。
  4. 三者均空时 MUST 抛出结构化校验错误。
- `mask?: { file_id?: string; image_url?: string }`，由可选 `request.maskAsset` 映射而来，映射规则与上述 `images` 元素一致。
- `mask` 对象构造后 MUST 恰好包含 `file_id` 与 `image_url` 之一；若两者同时出现，MUST 抛出结构化校验错误。
- `request.inputAssets` 为空或不存在时 MUST 抛出结构化校验错误。

#### Scenario: inputAssets with external URLs
- **WHEN** `request.inputAssets = [{ type: 'image', url: 'https://example.com/a.png' }]`
- **THEN** body `images` 等于 `[{ image_url: 'https://example.com/a.png' }]`

#### Scenario: inputAssets with base64 data
- **WHEN** `request.inputAssets = [{ type: 'image', data: 'AAA...', mimeType: 'image/png' }]`
- **THEN** body `images` 等于 `[{ image_url: 'data:image/png;base64,AAA...' }]`

#### Scenario: inputAssets with fileId
- **WHEN** `request.inputAssets = [{ type: 'image', fileId: 'file-abc123' }]`
- **THEN** body `images` 等于 `[{ file_id: 'file-abc123' }]`

#### Scenario: maskAsset maps to mask object
- **WHEN** `request.maskAsset = { type: 'image', fileId: 'file-mask-1' }`
- **THEN** body `mask` 等于 `{ file_id: 'file-mask-1' }`

#### Scenario: mask with both channels is rejected
- **WHEN** asset 同时被要求产出 `file_id` 与 `image_url`（例如 asset 同时有 `fileId` 与 `url` 并且调用方要求二者同时出现在 mask 中）
- **THEN** `buildEditRequestBody()` MUST 抛出结构化校验错误

#### Scenario: Empty inputAssets is rejected
- **WHEN** `request.inputAssets` 为 `undefined` 或空数组
- **THEN** `buildEditRequestBody()` MUST 抛出结构化校验错误

### Requirement: Request body SHALL map request.output to documented OpenAPI fields
`buildRequestBody()` 与 `buildEditRequestBody()` MUST 将 `request.output` 的以下字段映射到上游 body：

| `request.output` 字段 | 上游 body 字段 |
|---|---|
| `count` | `n` |
| `width` + `height` | `size` （若命中 `inferSize` 支持的组合） |
| `background` | `background` |
| `quality` | `quality` |
| `outputFormat` | `output_format` |
| `outputCompression` | `output_compression` |
| `moderation` | `moderation` |
| `inputFidelity` | `input_fidelity` （仅 edit） |

未显式映射的字段（如 `aspectRatio`）MUST NOT 被写入 body；它们 MAY 通过 `providerOptions` 透传，但 surface 字段的唯一来源 MUST 为 `request.output`。

`applyProviderOptions()` 的 handled keys 集合 MUST 至少包含：
`['model', 'response_format', 'n', 'size', 'quality', 'background', 'output_format', 'output_compression', 'moderation', 'input_fidelity']`，以禁止 `providerOptions` 覆盖已 surface 的字段。未被 surface 的字段（例如 `user`）MUST 通过 `providerOptions` 原样透传。

#### Scenario: Generate body carries mapped output fields
- **WHEN** `request.output = { count: 2, width: 1024, height: 1024, quality: 'high', outputFormat: 'png', background: 'transparent' }`
- **THEN** body 包含 `n: 2`、`size: '1024x1024'`、`quality: 'high'`、`output_format: 'png'`、`background: 'transparent'`

#### Scenario: Edit body carries input_fidelity mapping
- **WHEN** `operation: 'edit'` 且 `request.output = { inputFidelity: 'high' }`
- **THEN** edit body 包含 `input_fidelity: 'high'`
- **AND** generate body MUST NOT 映射 `inputFidelity`

#### Scenario: providerOptions cannot override surfaced fields
- **WHEN** `request.output = { quality: 'high' }` 且 `request.providerOptions = { quality: 'low' }`
- **THEN** body `quality` 等于 `'high'`
- **AND** providerOptions 中的 `quality` MUST 被 transport 层忽略

### Requirement: Response parser SHALL normalize full ImagesResponse shape
`parseResponse(raw)` MUST 返回结构化对象 `{ assets, created?, usage?, metadata? }`，而不是原来的 `Asset[]`。

- `assets`：按 "Response with URL images" / "Response with base64 images" scenario 解析；`mimeType` 与文件名后缀根据顶层 `output_format` 推断（缺省 fallback `png`）。
- `created`：若上游响应包含数值型 `created` 字段则填充为 number，否则省略。
- `usage`：若上游响应包含 `usage` 对象则映射为 camelCase `ProviderInvokeUsage`，否则省略整个字段。
- `metadata`：若上游响应包含 `background` / `output_format` / `quality` / `size` 中任意字段则构造 `ProviderInvokeMetadata`，否则省略整个字段。

`provider.ts` 的 `invoke()` MUST 将 `parseResponse` 的返回对象展开到 `ProviderInvokeResult`，并附加 `raw` 与 `diagnostics`（若有）。

#### Scenario: parseResponse returns structured object
- **WHEN** 调用 `parseResponse({ created: 1713833628, data: [{ b64_json: '...' }], output_format: 'webp', usage: { input_tokens: 50, output_tokens: 50, total_tokens: 100 } })`
- **THEN** 返回对象 `assets` 长度为 1，单个 asset 的 `mimeType` 为 `'image/webp'`
- **AND** `created` 等于 `1713833628`
- **AND** `usage` 等于 `{ inputTokens: 50, outputTokens: 50, totalTokens: 100 }`
- **AND** `metadata` 包含 `{ outputFormat: 'webp' }`

#### Scenario: parseResponse omits absent fields
- **WHEN** 调用 `parseResponse({ data: [{ url: 'https://example.com/a.png' }] })`
- **THEN** 返回对象包含 `assets`，长度为 1
- **AND** 返回对象 MUST 省略 `created`、`usage`、`metadata` 字段

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
## ADDED Requirements

### Requirement: OpenAI-compatible provider SHALL implement model discovery via /v1/models endpoint

`openai-compatible` provider MUST 实现 `discoverModels(config)` 方法，通过 `GET {baseURL}/v1/models` 获取上游模型列表，解析并过滤出 image generation 相关模型，返回 `ProviderModelInfo[]`。

#### Scenario: Successful model discovery with image models

- **WHEN** `discoverModels(config)` 被调用且上游返回包含 `dall-e-3` 和 `dall-e-2` 的 `/v1/models` 响应
- **THEN** 返回的 `ProviderModelInfo[]` MUST 包含 `{ id: 'dall-e-3', displayName: 'Dall E 3' }` 和 `{ id: 'dall-e-2', displayName: 'Dall E 2' }`
- **AND** 非 image generation 模型（如 `gpt-4`、`text-embedding-ada-002`）MUST NOT 出现在结果中

#### Scenario: Successful model discovery with community image models

- **WHEN** `discoverModels(config)` 被调用且上游返回包含 `stable-diffusion-image` 和 `flux-image-pro` 的 `/v1/models` 响应
- **THEN** 返回的 `ProviderModelInfo[]` MUST 包含这些模型（ID 包含 `image` 子串，大小写不敏感）
- **AND** 每个模型的 `displayName` MUST 为格式化后的展示名

#### Scenario: Successful model discovery with relay/proxy中转站 models

- **WHEN** `discoverModels(config)` 被调用且上游返回包含 `gpt-image-1`、`grok-2-image`、`qwen-image-max` 的 `/v1/models` 响应
- **THEN** 返回的 `ProviderModelInfo[]` MUST 包含 `{ id: 'gpt-image-1', displayName: 'Gpt Image 1' }`、`{ id: 'grok-2-image', displayName: 'Grok 2 Image' }`、`{ id: 'qwen-image-max', displayName: 'Qwen Image Max' }`
- **AND** 非 image 模型（如 `gpt-4`、`grok-2`、`qwen-max`）MUST NOT 出现在结果中

#### Scenario: Empty result when no image models match

- **WHEN** `discoverModels(config)` 被调用且上游返回成功但所有模型的 ID 均不匹配 image generation 过滤规则
- **THEN** 返回的 `ProviderModelInfo[]` MUST 为空数组 `[]`
- **AND** MUST NOT 抛出错误

#### Scenario: Auth failure during discovery

- **WHEN** `discoverModels(config)` 被调用且上游返回 HTTP 401
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'auth_failed' }`
- **AND** 错误 MUST 可被 `shared-commands` 的 `refreshProfileModels` 映射为 `provider` error

#### Scenario: Network error during discovery

- **WHEN** `discoverModels(config)` 被调用且发生网络断开（如 ECONNRESET）
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'network_error' }`
- **AND** 错误 MUST 可被 `shared-commands` 的 `refreshProfileModels` 映射为 `provider` error

#### Scenario: Timeout during discovery

- **WHEN** `discoverModels(config)` 被调用且请求因 `timeoutMs` 超时
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'timeout' }`
- **AND** 错误 MUST 可被 `shared-commands` 的 `refreshProfileModels` 映射为 `provider` error

#### Scenario: Invalid response format

- **WHEN** `discoverModels(config)` 被调用且上游返回 HTTP 200 但响应体缺少 `data` 字段或 `data` 不是数组
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'invalid_response' }`
- **AND** 错误 MUST 可被 `shared-commands` 的 `refreshProfileModels` 映射为 `provider` error

### Requirement: Model response parser SHALL validate and filter upstream response

`parseModelsResponse(raw: unknown)` MUST 对上游 `/v1/models` 响应执行基础结构验证、模型过滤和 displayName 格式化。

#### Scenario: Valid response with mixed models

- **WHEN** `parseModelsResponse()` 收到 `{ object: 'list', data: [{ id: 'dall-e-3', object: 'model', created: 1699809600, owned_by: 'openai-dev' }, { id: 'gpt-4', object: 'model', created: 1687882411, owned_by: 'openai' }] }`
- **THEN** 返回 `[{ id: 'dall-e-3', displayName: 'Dall E 3' }]`
- **AND** `gpt-4` MUST NOT 出现在结果中

#### Scenario: Valid response with中转站 mixed models

- **WHEN** `parseModelsResponse()` 收到 `{ object: 'list', data: [{ id: 'gpt-image-1', object: 'model' }, { id: 'gpt-4', object: 'model' }, { id: 'grok-2-image', object: 'model' }, { id: 'grok-2', object: 'model' }, { id: 'qwen-image-max', object: 'model' }, { id: 'qwen-max', object: 'model' }] }`
- **THEN** 返回 `[{ id: 'gpt-image-1', displayName: 'Gpt Image 1' }, { id: 'grok-2-image', displayName: 'Grok 2 Image' }, { id: 'qwen-image-max', displayName: 'Qwen Image Max' }]`
- **AND** `gpt-4`、`grok-2`、`qwen-max` MUST NOT 出现在结果中

#### Scenario: Response missing object field

- **WHEN** `parseModelsResponse()` 收到 `{ data: [...] }`（缺少 `object` 字段）
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'invalid_response' }`

#### Scenario: Response with non-array data field

- **WHEN** `parseModelsResponse()` 收到 `{ object: 'list', data: 'not-an-array' }`
- **THEN** MUST 抛出 `ProviderInvokeError { kind: 'invalid_response' }`

#### Scenario: Response with empty data array

- **WHEN** `parseModelsResponse()` 收到 `{ object: 'list', data: [] }`
- **THEN** 返回 `[]`（空数组）
- **AND** MUST NOT 抛出错误

#### Scenario: Response with non-object data items

- **WHEN** `parseModelsResponse()` 收到 `{ object: 'list', data: ['string-item'] }`
- **THEN** 跳过非 object 的 data 项
- **AND** 若过滤后无有效模型，返回 `[]`

### Requirement: Model displayName SHALL be formatted from model ID

`formatDisplayName(id: string)` MUST 将 model ID 转换为用户友好的展示名：将 `-` 和 `_` 替换为空格，每个词首字母大写。

#### Scenario: Format dall-e-3

- **WHEN** `formatDisplayName('dall-e-3')` 被调用
- **THEN** 返回 `'Dall E 3'`

#### Scenario: Format with underscores

- **WHEN** `formatDisplayName('flux_image_pro')` 被调用
- **THEN** 返回 `'Flux Image Pro'`

#### Scenario: Format single word

- **WHEN** `formatDisplayName('dalle3')` 被调用
- **THEN** 返回 `'Dalle3'`

### Requirement: Model discovery SHALL reuse existing HTTP transport

`discoverModels()` MUST 通过 `httpRequest()` 发起 HTTP 调用，MUST NOT 直接使用裸 `fetch`。请求 MUST 使用 `GET` 方法，URL 为 `{baseURL}/v1/models`，携带 `Authorization: Bearer {apiKey}` header 和 `extraHeaders`。

#### Scenario: HTTP request construction

- **WHEN** `discoverModels(config)` 被调用且 config 包含 `baseURL='https://api.openai.com'`、`apiKey='sk-xxx'`、`extraHeaders: { 'X-Custom': 'value' }`
- **THEN** `httpRequest()` MUST 被调用，参数包含 `url='https://api.openai.com/v1/models'`、`method='GET'`
- **AND** headers MUST 包含 `Authorization: Bearer sk-xxx` 和 `X-Custom: value`

#### Scenario: Timeout propagation

- **WHEN** `discoverModels(config)` 被调用且 config 包含 `timeoutMs: 5000`
- **THEN** `httpRequest()` MUST 被调用，参数包含 `timeoutMs: 5000`
