## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Edit invocation is rejected in this phase
**Reason**: provider 已实现 edit 支持（`/v1/images/edits` JSON body），descriptor 对齐后 `operations` 包含 `'edit'`；该 requirement 与当前实现和 OpenAPI 文档均不符。
**Migration**: 无迁移路径。新的 edit 行为由 "Successful edit invocation" scenario 与下方 ADDED "Edit request body construction" / "Input asset mapping" 等 requirement 描述。

## ADDED Requirements

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
