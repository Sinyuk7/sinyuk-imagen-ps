<!--
  This file describes delta (ADDED requirements) to the baseline spec at
  openspec/specs/openai-compatible-provider/spec.md.
  The baseline spec remains unchanged; this file only adds new requirements.
-->

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
