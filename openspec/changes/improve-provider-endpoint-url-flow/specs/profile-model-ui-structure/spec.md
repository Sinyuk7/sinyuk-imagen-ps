## MODIFIED Requirements

### Requirement: Profile Detail model selector SHALL provide Add New Model navigation
`Profile Detail` 的 `model` selector SHALL 承载当前/effective model selection，同时 MUST 在顶部提供固定动作项 `添加新模型`。默认情况下该动作用于导航到当前 `profile` 的 `Profile Detail -> Models` 页面；当当前页面 endpoint 可派生 `EndpointModelHint` 且当前 `profile` 尚无 matching `configured model` 时，该动作 SHALL 直接生成一次性的 `ModelConfigurationEditorSeed`，并打开为当前 `profile` 预填的 `ModelConfigurationPage`；当 hint 已匹配当前 `profile` 现有 `configured model` 时，该动作 SHALL 回到 canonical `ProfileModelsPage`，而不是重复打开 create editor。

#### Scenario: selector 顶部存在添加新模型动作
- **WHEN** 用户展开 `Profile Detail` 的 `model` selector
- **THEN** selector 顶部显示固定动作项 `添加新模型`
- **AND** 该动作项不与已拥有 `configured model` 混淆

#### Scenario: 无 endpoint hint 时进入当前 profile 的 Models 页面
- **WHEN** 用户点击 `添加新模型`
- **AND** 当前页面不存在可用的 `EndpointModelHint`
- **THEN** 系统导航到当前 `profile` 的 `Profile Detail -> Models`
- **AND** 不会跳到全局 `model ownership` 页面

#### Scenario: unresolved explicit model hint 直达预填 editor
- **WHEN** 用户点击 `添加新模型`
- **AND** 当前页面存在 valid unresolved `EndpointModelHint`
- **AND** 当前 `profile` 没有 matching `configured model`
- **THEN** 系统直接打开当前 `profile` 的 `ModelConfigurationPage`
- **AND** editor 使用一次性的 `ModelConfigurationEditorSeed` 预填 `modelId`
- **AND** editor 使用 seed 提供的 `wireModelId`，或在 seed 未单独覆盖时以同值 `modelId` 预填 `wireModelId`
- **AND** 系统不会先强制经过空白 `ProfileModelsPage`

#### Scenario: matching explicit model hint 回到 canonical models page
- **WHEN** 用户点击 `添加新模型`
- **AND** 当前页面存在 valid `EndpointModelHint`
- **AND** 当前 `profile` 已有 matching `configured model`
- **THEN** 系统进入当前 `profile` 的 `ProfileModelsPage`
- **AND** 系统不会为该 hint 再次打开空白 create editor

#### Scenario: detail selector 不暴露默认模型语义
- **WHEN** 用户查看或展开 `Profile Detail` 的 `model` selector
- **THEN** selector 只表达当前/effective selection
- **AND** selector 不展示 `默认`、`设置为默认`，或任何等价 default-model copy
- **AND** 选择 model 不会写入 `ProviderProfile.defaultModelId`

### Requirement: ProfileModelsPage SHALL be the canonical ownership list page
系统 SHALL 提供 `ProfileModelsPage` 作为当前 `profile` 的 canonical `model ownership` browse/manage 页面。该页面 SHALL 承载 list、create、edit、delete，以及 `discovery suggestion` 展示；它 MUST NOT 暴露 profile-level set default 操作。当前 endpoint 派生的 `EndpointModelHint` 可以在 `Profile Detail` 上减少一次 create 跳转，但 MUST NOT 取代 `ProfileModelsPage` 的 canonical browse/manage 角色。

#### Scenario: ProfileModelsPage 列出当前 profile 的 configured model
- **WHEN** 用户打开 profile A 的 `Profile Detail -> Models`
- **THEN** 页面列出由 profile A 拥有的 `configured model`
- **AND** 页面不会列出其他 `profile` 的 `configured model`

#### Scenario: ProfileModelsPage 不展示默认标记或默认操作
- **WHEN** 用户打开当前 `profile` 的 `Profile Detail -> Models`
- **THEN** 每个 owned `configured model` 行都不会展示 `默认` badge
- **AND** 页面不会展示 `设置为默认` 按钮
- **AND** 页面不会调用任何 set-default 或 `saveProviderProfile({ defaultModelId })` mutation

#### Scenario: create 动作由 ProfileModelsPage actionbar 发起
- **WHEN** 用户已经位于 `ProfileModelsPage` 并需要为当前 `profile` 添加新 `model`
- **THEN** 系统在 `ProfileModelsPage` 的 actionbar 提供 `+` 入口
- **AND** 该入口成为页面内 canonical create path

#### Scenario: 显式 browse/manage 导航仍然进入 ProfileModelsPage
- **WHEN** 用户从 settings-shell 的 browse/manage affordance 打开当前 `profile` 的模型管理
- **THEN** 系统进入该 `profile` 的 `ProfileModelsPage`
- **AND** 是否存在 `EndpointModelHint` 都不会把该 browse/manage 入口改写成别的页面

### Requirement: ModelConfigurationPage SHALL remain an editor-only child flow
`ModelConfigurationPage` SHALL 保留当前 `Create/Edit Model Config` editor 结构，但 MUST 只作为当前 settings flow 的 child editor 存在，不再承载全局列表模式。它可以从 `ProfileModelsPage` 的 create/edit/suggestion 进入，也可以从 `Profile Detail` 的 unresolved `EndpointModelHint` shortcut 进入。

#### Scenario: editor 保留现有 Create/Edit 结构
- **WHEN** 用户从 `ProfileModelsPage` 或 unresolved hint shortcut 进入 create 或 edit flow
- **THEN** 系统继续使用现有 `ModelConfigurationPage` editor 结构
- **AND** 变化只发生在预填数据与返回导航关系上

#### Scenario: 从 ProfileModelsPage 进入时返回该页
- **WHEN** 用户从 `ProfileModelsPage` 进入 `ModelConfigurationPage`
- **THEN** 系统在保存或返回后回到同一 `profile` 的 `ProfileModelsPage`
- **AND** 不会返回已删除的全局列表模式

#### Scenario: 从 unresolved hint shortcut 进入时返回 Profile Detail
- **WHEN** 用户从 `Profile Detail` 的 unresolved `EndpointModelHint` shortcut 进入 `ModelConfigurationPage`
- **THEN** 系统在保存或返回后回到同一 `profile` 的 `Profile Detail`
- **AND** 本次一次性 `ModelConfigurationEditorSeed` 不再继续控制 editor 之外的页面状态

### Requirement: SettingsAddPage SHALL not configure models before profile exists
`SettingsAddPage` SHALL 只负责创建 `profile`。系统 MUST NOT 在 `profile` 尚未持久化之前提供 `profile-add -> model configuration` 路径。任意成功保存后，系统 SHALL 先进入该 `profile` 的 `Profile Detail`。若当前 raw endpoint URL 已经提取 explicit `modelId`，Detail SHOULD 优先基于保存后的 endpoint 展示值重新 derive `EndpointModelHint`；只有当保存后的结构化 `profile` 无法重建该 hint 时，系统 MAY 携带一次性的 fallback seed 进入 detail flow。

#### Scenario: 新建 profile 流程不再打开 model editor
- **WHEN** 用户在 `SettingsAddPage` 创建一个新 `profile`
- **THEN** 系统只保存 `profile`
- **AND** 系统不会在创建过程中跳到 `ModelConfigurationPage`

#### Scenario: 任意创建成功后默认进入 Detail
- **WHEN** 用户在 `SettingsAddPage` 成功创建任意新 `profile`
- **THEN** 系统进入该 `profile` 的 `Profile Detail`
- **AND** 后续 model create / browse decision 只在保存后发生

#### Scenario: 创建成功后进入 Detail 再决定是否新建 model
- **WHEN** 用户在 `SettingsAddPage` 用一个提取出 explicit `modelId` 的 endpoint URL 创建 `profile`
- **THEN** 系统先完成该 `profile` 的保存
- **AND** 系统进入该 `profile` 的 `Profile Detail`
- **AND** Detail 优先基于保存后的 endpoint 展示值重新 derive 当前 `EndpointModelHint`

#### Scenario: 只有无法重建 hint 时才使用 fallback seed
- **WHEN** 用户在 `SettingsAddPage` 保存的结构化 `profile` 无法完整还原保存前 URL 中的 explicit `modelId`
- **THEN** 系统可以携带一次性的 fallback seed 进入该 `profile` 的 detail flow
- **AND** 该 fallback seed 不会在 `profile` 持久化前触发 model editor
