## ADDED Requirements

### Requirement: Mock provider SHALL implement the full Provider contract
Mock provider MUST 实现 `Provider` 接口的全部方法：`describe()`、`validateConfig()`、`validateRequest()`、`invoke()`，并暴露稳定的 `id` 与 `family`。

#### Scenario: Mock provider describes itself
- **WHEN** 调用方调用 `mockProvider.describe()`
- **THEN** 它 MUST 返回 `ProviderDescriptor`，其中 `id` 为 `"mock"`、`family` 为 `"openai-compatible"`
- **AND** `capabilities.syncInvoke` MUST 为 `true`
- **AND** `operations` MUST 包含 `"generate"` 与 `"edit"`

### Requirement: Mock provider SHALL validate config using a Zod schema
Mock provider 的 `validateConfig()` MUST 使用 Zod schema 对输入进行校验，失败时抛出结构化错误，与真实 provider 保持同一校验模式。

#### Scenario: Valid mock config passes validation
- **WHEN** 调用方传入包含 `providerId`、`baseURL`、`apiKey` 的 mock config
- **THEN** `validateConfig()` MUST 返回收敛后的 config 对象
- **AND** 返回对象 MUST 包含 mock 特有的可选字段（如 `delayMs`、`failMode`）的默认值

#### Scenario: Invalid mock config fails validation
- **WHEN** 调用方传入缺少 `baseURL` 或 `apiKey` 的 config
- **THEN** `validateConfig()` MUST 抛出包含 `message` 与 `details` 的结构化错误
- **AND** 该错误 MUST 可被映射为 `JobError { category: 'validation' }`

### Requirement: Mock provider SHALL validate request using a Zod schema
Mock provider 的 `validateRequest()` MUST 使用 Zod schema 校验 canonical image request，确保 caller 按契约传入参数。

#### Scenario: Valid request passes validation
- **WHEN** 调用方传入包含 `operation` 与 `prompt` 的 canonical request
- **THEN** `validateRequest()` MUST 返回收敛后的 request 对象

#### Scenario: Invalid request fails validation
- **WHEN** 调用方传入缺少 `operation` 或 `prompt` 的请求
- **THEN** `validateRequest()` MUST 抛出包含 `message` 与 `details` 的结构化错误
- **AND** 该错误 MUST 可被映射为 `JobError { category: 'validation' }`

### Requirement: Mock provider SHALL support configurable delay simulation
Mock provider MUST 允许通过 config 控制 `invoke()` 的模拟延迟，以验证 runtime 对异步调用的处理。

#### Scenario: Invoke with default delay
- **WHEN** 调用方未在 config 中指定 `delayMs`
- **THEN** `invoke()` MUST 在默认短暂延迟后返回结果

#### Scenario: Invoke with custom delay
- **WHEN** 调用方在 config 中指定 `delayMs: 500`
- **THEN** `invoke()` MUST 在约 500ms 后返回结果
- **AND** 若 `signal` 在延迟期间被 abort，则 MUST 抛出 abort 错误

### Requirement: Mock provider SHALL support configurable failure modes
Mock provider MUST 支持通过 config 配置失败模式，包括固定失败与概率失败，以验证 runtime 的错误处理路径。

#### Scenario: Invoke with forced failure
- **WHEN** 调用方在 config 中指定 `failMode: { type: 'always' }`
- **THEN** `invoke()` MUST 抛出包含 `message` 的结构化错误
- **AND** 该错误 MUST 可被映射为 `JobError { category: 'provider' }`

#### Scenario: Invoke with probability failure
- **WHEN** 调用方在 config 中指定 `failMode: { type: 'probability', rate: 0.5 }`
- **THEN** `invoke()` 有 50% 概率抛出错误，50% 概率返回正常结果
- **AND** 错误 MUST 包含 `message` 与表明其为模拟失败的 `details`

### Requirement: Mock provider invoke SHALL return normalized synthetic assets
Mock provider 的 `invoke()` 在成功时 MUST 返回符合 `ProviderInvokeResult` 的归一化结果，其中 `assets` 为合成 `Asset[]`，不依赖外部文件系统或网络。Mock provider 的 `invoke()` SHALL 使用三级 fallback chain 解析 effective model：(1) `request.providerOptions.model`，(2) `config.defaultModel`，(3) 硬编码 fallback 默认值 `mock-image-v1`。Effective model SHALL 包含在 invoke result 的 `raw` 字段中。

#### Scenario: 成功调用返回合成 assets 并回显 model
- **WHEN** `invoke()` 在无失败模式的配置下被调用
- **THEN** 它 MUST 返回 `ProviderInvokeResult`
- **AND** `assets` MUST 为非空数组，每个元素符合 `Asset` 形状
- **AND** `assets` 中每个 `Asset` 的 `type` MUST 为 `"image"`
- **AND** `assets` 中每个 `Asset` 的 `name` 或 `mimeType` SHOULD 包含可识别的 mock 标记
- **AND** `raw` MUST 包含 `model` 字段，值为 effective model
- **AND** `raw` MUST 包含 `mock: true`、`operation`、`prompt`、`assetCount` 字段
- **AND** `diagnostics` MAY 包含延迟、模式等结构化诊断信息

#### Scenario: 使用显式 providerOptions.model
- **WHEN** `invoke()` 被调用时 `request.providerOptions.model` 设为 `"custom-model"`
- **AND** `config.defaultModel` 设为 `"config-default"`
- **THEN** `raw.model` MUST 为 `"custom-model"`

#### Scenario: Fallback 到 config.defaultModel
- **WHEN** `invoke()` 被调用时未提供 `request.providerOptions.model`
- **AND** `config.defaultModel` 设为 `"config-default"`
- **THEN** `raw.model` MUST 为 `"config-default"`

#### Scenario: Fallback 到硬编码默认值
- **WHEN** `invoke()` 被调用时未提供 `request.providerOptions.model`
- **AND** `config.defaultModel` 未设置
- **THEN** `raw.model` MUST 为 `"mock-image-v1"`

### Requirement: Mock provider SHALL respect AbortSignal
Mock provider 的 `invoke()` MUST 在延迟期间响应 `AbortSignal`，支持取消语义。

#### Scenario: Invoke is aborted during delay
- **WHEN** `invoke()` 被调用且 `signal` 在结果返回前触发 abort
- **THEN** `invoke()` MUST 抛出 abort 错误
- **AND** 该错误 MUST 可被桥接层识别并映射为 `JobError { category: 'provider' }`

### Requirement: Mock provider SHALL declare defaultModels and omit discoverModels

Mock provider MUST 在 `describe()` 返回的 `ProviderDescriptor` 中声明 `defaultModels: [{ id: 'mock-image-v1' }]`，作为 implementation 自带的 fallback model 候选清单。

Mock provider MUST NOT 实现 `discoverModels` 方法；其 `discoverModels` 字段 MUST 为 `undefined`。这反映 mock 没有可询问的远端来源，将 discovery 失败语义留给 `refreshProfileModels` 验证场景。

`defaultModels` 与 mock provider 的 `invoke()` model fallback 互不耦合：`invoke()` 仍按 `model-selection` 三级优先级解析 effective model（`request.providerOptions.model` → `config.defaultModel` → 硬编码默认值 `mock-image-v1`），不读取 `descriptor.defaultModels`。

#### Scenario: Mock describes defaultModels
- **WHEN** 调用方读取 `mockProvider.describe().defaultModels`
- **THEN** 它 MUST 返回 `[{ id: 'mock-image-v1' }]`
- **AND** 该值 MUST NOT 影响 `invoke()` 的 effective model 解析

#### Scenario: Mock omits discoverModels
- **WHEN** 调用方读取 `mockProvider.discoverModels`
- **THEN** 该字段 MUST 为 `undefined`

#### Scenario: refreshProfileModels against mock fails with validation error
- **WHEN** `refreshProfileModels(profileId)` 被调用，且 `profile.providerId === 'mock'`
- **THEN** 它 MUST 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** persisted `profile.models` MUST 保持调用前的值

#### Scenario: listProfileModels falls back to mock defaultModels
- **WHEN** `listProfileModels(profileId)` 被调用，`profile.providerId === 'mock'`，且 `profile.models` 为空或未定义
- **THEN** 它 MUST 返回 `{ ok: true, value: [{ id: 'mock-image-v1' }] }`
