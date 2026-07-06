## ADDED Requirements

### Requirement: User model configs SHALL persist independent config, capability, and wire model identities
系统 MUST 将 model config 的 config identity、capability anchor 与最终上游 wire model 分离持久化，并至少保存 `modelId`、`baseModelId`、`wireModelId` 三个字段。

#### Scenario: Save new config with aligned identity and wire model
- **WHEN** 用户新建一个 `baseModelId = gpt-image-2` 的 model config，且未显式修改高级“请求模型 ID”
- **THEN** 系统 MUST 保存稳定 `modelId`
- **THEN** 系统 MUST 保存 `wireModelId`
- **THEN** 系统 MUST 允许 `modelId` 与 `wireModelId` 初始值相同，但两者语义 MUST 保持分离

#### Scenario: Save config with relay-specific wire model
- **WHEN** 用户为 `baseModelId = gpt-image-2` 的 model config 保存 `wireModelId = gpt-image-2-vip`
- **THEN** 系统 MUST 保持该 config 的 `baseModelId` 仍为 `gpt-image-2`
- **THEN** 系统 MUST 不要求 `wireModelId` 成为官方 preset `modelId`

### Requirement: Capability resolution SHALL use capability anchor and execution SHALL use wire model
系统 MUST 使用 `baseModelId` 作为 capability anchor 解析能力、输出矩阵与请求策略归属，并且 MUST 使用 `wireModelId` 作为最终上游请求 `model`。

#### Scenario: Dispatch request with relay wire model
- **WHEN** 一个 model config 的 `baseModelId` 为 `gpt-image-2` 且 `wireModelId` 为 `gpt-image-2-vip`
- **THEN** 系统 MUST 按 `gpt-image-2` 的能力矩阵验证输出格式、尺寸与操作支持
- **THEN** 系统 MUST 在最终 provider request payload 中发送 `model = "gpt-image-2-vip"`

#### Scenario: Capability helper receives explicit capability model
- **WHEN** runtime 为一个带 relay wire model 的 config 解析输出能力
- **THEN** 系统 MUST 向 capability resolver 显式传入 `capabilityModelId`
- **THEN** 系统 MUST NOT 让 capability resolver 隐式读取或推断 `wireModelId`

### Requirement: Effective capability SHALL be bounded by preset and user narrowing
系统 MUST 将 effective capability 视为官方 preset 能力上限与 `outputExposure/outputMatrix` 收窄结果的交集，并且 MUST NOT 因 `wireModelId` 自动扩展能力。

#### Scenario: Relay route offers fewer capabilities than preset
- **WHEN** 一个 relay `wireModelId` 仅支持官方 preset 的部分尺寸或输出格式
- **THEN** 系统 MUST 允许用户通过 `outputExposure/outputMatrix` 收窄能力
- **THEN** 系统 MUST NOT 仅因 `wireModelId` 名称变化自动扩大 capability

#### Scenario: Relay route advertises extra capability beyond preset
- **WHEN** 一个 relay `wireModelId` 声称支持官方 preset 不具备的额外能力
- **THEN** 系统 MUST NOT 直接把这些能力注入当前 preset
- **THEN** 系统 MUST 要求通过新的独立 capability 类型表达该能力

### Requirement: Stable config identity SHALL survive wire model changes
系统 MUST 保持 profile model 选择与 generation preference 继续绑定稳定 config identity，而不是绑定可变的 `wireModelId`。

#### Scenario: Preference key remains stable after wire model change
- **WHEN** 用户仅修改一个已保存 model config 的 `wireModelId`
- **THEN** 系统 MUST 保持该 config 对应的 generation preference key 不变
- **THEN** 系统 MUST 继续读取并应用该 config 已保存的输出偏好

#### Scenario: Profile selection remains stable after wire model change
- **WHEN** 一个 profile 已将某个 model config 设为 selected/default，随后该 config 的 `wireModelId` 被修改
- **THEN** 系统 MUST 不要求 profile `selectedModelIds/defaultModelId` 迁移到新的 wire model string
- **THEN** 系统 MUST 继续按原稳定 config identity 解析并执行该配置

### Requirement: New schema SHALL require wire model persistence
系统 MUST 要求新建或重新保存的 model config 写入 `wireModelId`，并且本次变更不要求兼容旧 schema 的已保存 config。

#### Scenario: Old config missing wire model is dropped as invalid
- **WHEN** 系统读取一个缺少 `wireModelId` 的旧 schema model config
- **THEN** 系统 MUST 将该 config 视为非法数据
- **THEN** 系统 MUST NOT 将该 config 返回给上层读取结果
- **THEN** 系统 MUST NOT 为该 config 生成半兼容默认值

### Requirement: Dispatch logs SHALL expose three model identities
系统 MUST 在关键 dispatch 日志中区分 config identity、capability anchor 与最终 wire model。

#### Scenario: Dispatch start records three model identities
- **WHEN** 系统发起一次 provider dispatch
- **THEN** `dispatch.provider.start` 或等价日志 MUST 记录 `configModelId`
- **THEN** 日志 MUST 记录 `capabilityModelId`
- **THEN** 日志 MUST 记录 `wireModelId`
