## MODIFIED Requirements

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