## ADDED Requirements

### Requirement: No compatibility or migration paths
系统 MUST 以 clean break 替换旧 generation output settings 与旧 user model output config schema；实现中 MUST NOT 保留旧 schema compatibility branch、migration path、best-effort old-data reader 或旧 output fallback。

#### Scenario: Old output settings are not read
- **WHEN** storage 中存在旧 `outputSizePreset`、`aspectRatio` 或 `outputFormat` 全局输出设置
- **THEN** 系统 MUST NOT 使用这些旧字段推导新 model generation preference

#### Scenario: Old user model config schema is rejected
- **WHEN** storage 或 command input 提供旧 `aspectRatios/sizes/outputFormats` 聚合 output config
- **THEN** 系统 MUST 拒绝该旧结构或将其视为无效数据，并且 MUST NOT 自动迁移为 output matrix

### Requirement: Official catalog fail-closed execution
系统 SHALL 只允许命中官方 image model catalog 或已配置用户模型的模型执行 generation request；官方 catalog 不得通过 hidden default fallback 为未知模型提供可执行能力。

#### Scenario: Unknown model is discovered but not executable
- **WHEN** provider discovery 返回一个不在官方 catalog 且没有用户模型配置的 model id
- **THEN** 系统 MUST 将该模型展示为未配置或不可选，并且 MUST NOT 允许它成为 Send 的执行模型

#### Scenario: Unknown selected model fails before provider dispatch
- **WHEN** Submit 请求引用不在官方 catalog 且没有用户模型配置的 model id
- **THEN** 系统 MUST 在 provider dispatch 前返回 validation failure，并且 MUST NOT 发送 provider HTTP request

### Requirement: Catalog declares model output matrix
系统 SHALL 在 provider catalog 中按 `apiFormat`、`modelId`、`operation` 声明 output matrix，matrix MUST 包含 UI 使用的 `imageSize`、`ratio`、`outputFormat` 选项以及每个可选组合对应的 exact `requestOutput`。

#### Scenario: GPT matrix resolves UI selection to pixel size
- **WHEN** selected model 是 GPT 类 image endpoint 模型且用户选择 `imageSize=4K`、`ratio=16:9`
- **THEN** resolved `requestOutput` MUST 包含 exact pixel `size`，例如 `size: "3840x2160"`，并且 MUST NOT 依赖 transport 根据 `4K` 与 `16:9` 推导尺寸

#### Scenario: GPT auto resolves to size auto
- **WHEN** selected model 是 GPT 类 image endpoint 模型且用户选择 `ratio=auto`
- **THEN** resolved `requestOutput` MUST 使用 `size: "auto"`

#### Scenario: Gemini matrix resolves UI selection to native fields
- **WHEN** selected model 是 Gemini 类模型且用户选择 `imageSize=4K`、`ratio=16:9`
- **THEN** resolved `requestOutput` MUST 包含 Gemini API format 对应的 `imageSize` 与 `aspectRatio` 字段

### Requirement: UI options come from selected model matrix
MainPage 与 Settings 页 SHALL 只展示当前 selected model matrix 声明的 `imageSize`、`ratio`、`outputFormat` 选项，并且两个入口 MUST 使用同一公共 resolver / controller。

#### Scenario: MainPage and Settings expose same options
- **WHEN** 用户在同一 profile/model/operation 下打开 MainPage output control 和 Settings generation panel
- **THEN** 两个入口 MUST 展示同一组 `imageSize`、`ratio`、`outputFormat` 选项，并且选择任一入口 MUST 更新同一份模型偏好

#### Scenario: Settings follows selected profile and model
- **WHEN** 用户从 profile A 的 model A 切换到 profile B 的 model B，并打开 Settings generation panel
- **THEN** Settings generation panel MUST 显示 profile B / model B / current operation 对应的 matrix 与 saved preference

#### Scenario: Settings change affects next request
- **WHEN** 用户在 Settings generation panel 选择任意有效的 `imageSize`、`ratio` 或 `outputFormat` 后返回 MainPage 并点击 Send
- **THEN** provider request MUST 使用该 Settings selection 对应的 exact `requestOutput`

#### Scenario: Ratio options follow selected imageSize
- **WHEN** 当前 selected `imageSize` 改变
- **THEN** ratio control MUST 只展示该 `imageSize` 在 matrix 中存在 cell 的 ratio 选项

#### Scenario: Invalid saved preference falls back to catalog default
- **WHEN** 已保存模型偏好引用的 `imageSize`、`ratio` 或 `outputFormat` 不再存在于当前 matrix
- **THEN** 系统 MUST 使用该模型 catalog 默认值，并且 MUST NOT 发送失效偏好

### Requirement: Generation preference is model-scoped
系统 SHALL 按当前 profile、API format、model、operation 保存 generation preference；切换模型或 operation 时 MUST 加载对应偏好或使用 catalog 默认值。

#### Scenario: Switching models loads model preference
- **WHEN** 用户从 model A 切换到 model B
- **THEN** Generation Settings MUST 显示 model B 已保存偏好；若不存在，MUST 显示 model B catalog 默认值

#### Scenario: Switching back restores previous model preference
- **WHEN** 用户在 model A 保存 `imageSize=4K` 后切换到 model B，再切回 model A
- **THEN** Generation Settings MUST 恢复 model A 的 `imageSize=4K` 偏好，只要该偏好仍被当前 matrix 支持

#### Scenario: Same model in different profiles has independent preference
- **WHEN** profile A 和 profile B 都选择同一 `apiFormat/modelId`，且用户在两个 profile 中保存不同 generation preference
- **THEN** 切换 profile 时 Generation Settings MUST 显示各自 profile 保存的 preference，而不是共享同一份 model-only preference

### Requirement: User model config can only narrow official preset matrix
系统 SHALL 只允许 `UserModelConfig` 基于同 `apiFormat` 下的 official preset output matrix 做子集收窄；用户配置 MUST NOT 增加 official preset 未声明的 matrix cell、ratio、imageSize、outputFormat、requestStrategyId 或 provider output field。

#### Scenario: User config removes supported cells
- **WHEN** 用户在 `ModelConfigurationPage` 基于 official preset 保存只包含部分 matrix cells 的配置
- **THEN** 系统 MUST 保存该子集配置，并且该模型后续 UI 与 Send MUST 只使用保存后的子集

#### Scenario: User config cannot add unsupported capability
- **WHEN** 用户或 storage 输入尝试保存 official preset 未声明的 ratio、imageSize、outputFormat 或 request output field
- **THEN** 系统 MUST 拒绝保存并返回 validation failure

#### Scenario: ModelConfigurationPage does not expose free aggregate editing
- **WHEN** 用户打开 `ModelConfigurationPage` 编辑模型配置
- **THEN** 页面 MUST 从 official preset matrix 派生可选项，并且 MUST NOT 允许通过旧 `aspectRatios/sizes/outputFormats` 聚合多选来增加能力

### Requirement: Submit sends resolved exact output
Send SHALL 使用当前 model output matrix resolved `requestOutput` 构造 provider request；provider transport MUST 只做字段序列化，不得再次根据 UI `imageSize` 与 `ratio` 做语义映射或降级。

#### Scenario: GPT send uses resolved pixel size
- **WHEN** 用户选择 GPT 模型的 `imageSize=4K` 与 `ratio=16:9` 并点击 Send
- **THEN** provider request MUST 包含 matrix resolved `size` 值，并且 HTTP body MUST 使用同一个 `size` 值

#### Scenario: Every Settings selection resolves to request output
- **WHEN** 用户在当前 selected model matrix 中选择任意有效 `imageSize`、`ratio`、`outputFormat` 组合
- **THEN** 系统 MUST 能解析出 exact `requestOutput`，并且 Send MUST 使用该 exact `requestOutput`

#### Scenario: Gemini send uses resolved native fields
- **WHEN** 用户选择 Gemini 模型的 `imageSize=4K` 与 `ratio=16:9` 并点击 Send
- **THEN** provider request 与 HTTP body MUST 使用 matrix resolved Gemini fields

### Requirement: Provider input resize remains app-local
`providerInputSizePreset` SHALL 继续作为 app-local 输入图片预处理设置保存和使用，并且 MUST NOT 进入 provider catalog output matrix。

#### Scenario: Image edit uses provider input resize separately
- **WHEN** 用户提交 image edit 且附带输入图片
- **THEN** app MUST 使用 `providerInputSizePreset` 处理输入图片 resize，同时 output 参数 MUST 仍来自 selected model output matrix
