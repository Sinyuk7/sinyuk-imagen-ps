## ADDED Requirements

### Requirement: UserModelConfig SHALL be a profile-owned child resource
系统 SHALL 把每个 `UserModelConfig` 视为恰好隶属于一个 `ProviderProfile` 的 child resource。一个 `configured model` 的 canonical identity MUST 由 `profileId + modelId` 确定，而不是由 `apiFormat + modelId` 确定。

#### Scenario: 相同 modelId 可在不同 profile 下并存
- **WHEN** profile A 与 profile B 在各自的 `Profile Detail -> Models` 下都保存 `modelId = "gpt-image-1"` 的 `configured model`
- **THEN** 系统将这两个 `configured model` 视为两个独立的 owned record
- **AND** 删除或编辑 profile A 的记录不会影响 profile B 的记录

#### Scenario: profile 维度的读取不会泄漏其他 profile 的记录
- **WHEN** 用户打开 profile A 的 `Profile Detail -> Models`
- **THEN** 系统只读取并展示由 profile A 拥有的 `UserModelConfig`
- **AND** 不会因为 profile B 具有相同 `apiFormat` 而额外展示 profile B 的记录

### Requirement: ProviderProfile SHALL not persist separate model membership state
系统 MUST NOT 再使用独立的 persisted membership state 来决定当前 `profile` 拥有哪些 `model`。保存 `UserModelConfig` 之后，该 `model` SHALL 立即成为当前 `profile` 的 owned `configured model`；删除之后，它 SHALL 立即失去 ownership。

#### Scenario: 保存后立即获得 ownership
- **WHEN** 用户在当前 `profile` 下保存一个新的 `UserModelConfig`
- **THEN** 系统立即把该 `model` 视为当前 `profile` 拥有的 `configured model`
- **AND** 系统不会要求用户执行额外的 membership 操作

#### Scenario: 删除后立即失去 ownership
- **WHEN** 用户删除当前 `profile` 拥有的一个 `UserModelConfig`
- **THEN** 系统立即移除该 `profile` 对这个 `model` 的 ownership
- **AND** 该 `model` 不再出现在当前 `profile` 的 owned `configured model` 列表中

### Requirement: defaultModelId SHALL reference one owned configured model or be empty
每个 `ProviderProfile.defaultModelId` MUST 指向一个由该 `profile` 自身拥有的 `configured model`，或者保持为空。系统 MUST NOT 让 `defaultModelId` 指向其他 `profile` 的 `model`、不存在的 `model`，或已被删除的 `model`。

#### Scenario: 保存合法 defaultModelId
- **WHEN** 当前 `profile` 把 `defaultModelId` 设置为其某个 owned `configured model`
- **THEN** 系统持久化该引用
- **AND** 外部 summary 与 selector 将其识别为当前 `profile` 的默认模型

#### Scenario: 删除当前默认模型时清空 defaultModelId
- **WHEN** 用户删除当前被 `defaultModelId` 引用的 `configured model`
- **THEN** 系统清空当前 `profile` 的 `defaultModelId`
- **AND** 系统进入显式 `no-default-model state`

#### Scenario: 保存首个 configured model 时不自动提升为默认
- **WHEN** 当前 `profile` 尚未设置 `defaultModelId`，且用户保存了第一个 `configured model`
- **THEN** 系统不会自动把该 `model` 设为 `defaultModelId`
- **AND** `profile` 保持显式 `no-default-model state`，直到用户显式设置默认模型

### Requirement: Saving a UserModelConfig SHALL require the parent profile to exist
系统 MUST 在保存 `UserModelConfig` 之前校验其 `profileId` 对应的 `ProviderProfile` 存在。系统 MUST NOT 为非存在 `profile` 创建 `UserModelConfig`。

#### Scenario: 为存在的 profile 保存 config
- **WHEN** 用户为已存在的 `profile` 保存 `UserModelConfig`
- **THEN** 系统校验 `profileId` 存在
- **AND** 保存成功

#### Scenario: 为不存在的 profile 保存 config
- **WHEN** 用户为一个不存在的 `profileId` 保存 `UserModelConfig`
- **THEN** 系统拒绝保存
- **AND** 返回 `profile not found` 错误

### Requirement: Deleting a profile SHALL cascade-delete its owned UserModelConfigs
当 `ProviderProfile` 被删除时，系统 MUST 同时删除所有由该 `profileId` 拥有的 `UserModelConfig`。系统 MUST NOT 在删除 `profile` 后保留 orphan `UserModelConfig`。

#### Scenario: 删除 profile 同时删除其 model configs
- **WHEN** 用户删除某个 `profile`
- **THEN** 系统删除该 `profile`
- **AND** 系统删除该 `profile` 拥有的所有 `UserModelConfig`
- **AND** 其他 `profile` 的 `UserModelConfig` 不受影响

#### Scenario: 删除 profile 时同步清空 defaultModelId 引用
- **WHEN** 系统删除某个 `profile`
- **THEN** 该 `profile` 的 `defaultModelId` 随 `profile` 一起被移除
- **AND** 不存在指向已删除 `profile` 的默认模型引用

### Requirement: Profile-scoped model generation settings SHALL resolve against the owning configured model
当系统为某个 `profile` 解析 `model generation preference`、output matrix 或相关选择校验时，系统 SHALL 使用当前 `profileId + modelId` 对应的 owned `UserModelConfig`。系统 MUST NOT 仅因为 `apiFormat` 与 `modelId` 相同，就读取其他 `profile` 的 `UserModelConfig`。

#### Scenario: 相同 modelId 在不同 profile 下解析各自的 output matrix
- **WHEN** profile A 与 profile B 都拥有 `modelId = "gpt-image-1"` 的 `configured model`，但两者保存了不同的 output exposure / output matrix
- **THEN** 系统在 profile A 下解析 generation settings 时只使用 profile A 的 `UserModelConfig`
- **AND** 系统在 profile B 下解析 generation settings 时只使用 profile B 的 `UserModelConfig`

#### Scenario: 偏好校验不会串用其他 profile 的配置
- **WHEN** profile A 与 profile B 拥有相同 `modelId`，且 profile A 试图保存一个只对 profile B 的 output matrix 合法的选择
- **THEN** 系统按 profile A 自身的 owned `UserModelConfig` 校验该选择
- **AND** 系统不会因为 profile B 存在同名 `model` 而放宽或改变 profile A 的校验结果

### Requirement: official preset SHALL remain a creation template instead of ownership truth
`official preset` SHALL 只作为 `ModelConfigurationPage` 的 capability template 与 editor seed。单独的 `preset` MUST NOT 被视为某个 `profile` 已拥有的 `model`。

#### Scenario: create flow 中显示 preset 作为模板
- **WHEN** 用户从某个 `profile` 进入 `ModelConfigurationPage` 创建新 `model`
- **THEN** 系统把 `official preset` 显示为 editor 模板
- **AND** 这些 `preset` 本身不会出现在该 `profile` 的 owned `configured model` 列表中

#### Scenario: 保存后只有 configured model 进入 ownership
- **WHEN** 用户基于某个 `official preset` 保存一个新的 `UserModelConfig`
- **THEN** 进入 ownership 的对象是保存后的 `configured model`
- **AND** 底层 `official preset` 不会作为第二个独立可用 `model` 暴露出来
