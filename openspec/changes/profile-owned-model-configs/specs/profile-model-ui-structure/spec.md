## ADDED Requirements

### Requirement: Settings root SHALL remove standalone global model ownership
系统 SHALL 从 settings root 移除 standalone global `model ownership` 入口。settings root 继续以 `profile` 列表与全局设置为主，但 MUST NOT 再暗示存在跨 `profile` 的全局 `model` 管理页面。

#### Scenario: settings root 不再提供全局 model ownership 入口
- **WHEN** 用户打开 settings root
- **THEN** 系统展示 `profile` 列表与其他全局设置项
- **AND** 系统不再展示独立的全局 `ModelConfigurationPage` 列表入口

#### Scenario: 外部导航不再暗示全局 ownership
- **WHEN** 用户从 settings root 浏览任何 `model-management navigation`
- **THEN** 系统不会暗示 user model 是跨 `profile` 全局拥有的
- **AND** 所有 canonical 入口都指向具体 `profile`

### Requirement: Profile Detail SHALL remain the provider detail shell while changing model semantics
系统 SHALL 保留 `Profile Detail` 作为 `endpoint/auth/billing/provider` 主配置 shell，但其 `model` 区块 MUST 改成“模型列表”语义，而不是“当前模型 + inline create”语义。

#### Scenario: Profile Detail 保留主体结构
- **WHEN** 用户打开某个 `Profile Detail`
- **THEN** 系统继续展示该 `profile` 的 `endpoint/auth/billing/provider` 配置结构
- **AND** `model` 区块只作为快速 selector 与跳转入口存在

#### Scenario: detail 页移除 inline add 按钮
- **WHEN** 用户查看 `Profile Detail` 的 `model` 区块
- **THEN** 系统不再显示 detail 页 inline `+` 按钮
- **AND** create 动作不再直接从该区块内发起

### Requirement: Profile Detail model selector SHALL provide Add New Model navigation
`Profile Detail` 的 `model` selector SHALL 继续承载默认模型选择能力，同时 MUST 在顶部提供固定动作项 `添加新模型`，用于导航到当前 `profile` 的 `Profile Detail -> Models` 页面。

#### Scenario: selector 顶部存在添加新模型动作
- **WHEN** 用户展开 `Profile Detail` 的 `model` selector
- **THEN** selector 顶部显示固定动作项 `添加新模型`
- **AND** 该动作项不与已拥有 `configured model` 混淆

#### Scenario: 点击添加新模型进入当前 profile 的 Models 页面
- **WHEN** 用户点击 `添加新模型`
- **THEN** 系统导航到当前 `profile` 的 `Profile Detail -> Models`
- **AND** 不会跳到全局 `model ownership` 页面

### Requirement: ProfileModelsPage SHALL be the canonical ownership list page
系统 SHALL 提供 `ProfileModelsPage` 作为当前 `profile` 的 canonical `model ownership` 列表页。该页面 SHALL 承载 list、set default、create、edit、delete，以及 `discovery suggestion` 展示。

#### Scenario: ProfileModelsPage 列出当前 profile 的 configured model
- **WHEN** 用户打开 profile A 的 `Profile Detail -> Models`
- **THEN** 页面列出由 profile A 拥有的 `configured model`
- **AND** 页面不会列出其他 `profile` 的 `configured model`

#### Scenario: create 动作由 ProfileModelsPage actionbar 发起
- **WHEN** 用户需要为当前 `profile` 添加新 `model`
- **THEN** 系统在 `ProfileModelsPage` 的 actionbar 提供 `+` 入口
- **AND** 该入口成为 canonical create path

#### Scenario: settings shell 先进入 ProfileModelsPage 再进入 editor
- **WHEN** 用户从 `Profile Detail`、其空状态动作或其他 settings-shell `model-management` affordance 发起 create / edit
- **THEN** 系统先进入当前 `profile` 的 `ProfileModelsPage`
- **AND** 再从该页面进入 `ModelConfigurationPage`

### Requirement: ModelConfigurationPage SHALL remain an editor-only child flow
`ModelConfigurationPage` SHALL 保留当前 `Create/Edit Model Config` editor 结构，但 MUST 只作为当前 `ProfileModelsPage` 的 child flow 存在，不再承载全局列表模式。

#### Scenario: editor 保留现有 Create/Edit 结构
- **WHEN** 用户从 `ProfileModelsPage` 进入 create 或 edit flow
- **THEN** 系统继续使用现有 `ModelConfigurationPage` editor 结构
- **AND** 变化只发生在数据来源与导航关系上

#### Scenario: 返回导航保持在当前 profile context
- **WHEN** 用户从 `ModelConfigurationPage` 返回
- **THEN** 系统返回进入 editor 之前的来源页面
- **AND** 若从 `ProfileModelsPage` 进入，则返回该 `profile` 的 `ProfileModelsPage`
- **AND** 不会返回已删除的全局列表模式

### Requirement: SettingsAddPage SHALL not configure models before profile exists
`SettingsAddPage` SHALL 只负责创建 `profile`。系统 MUST NOT 在 `profile` 尚未持久化之前提供 `profile-add -> model configuration` 路径。

#### Scenario: 新建 profile 流程不再打开 model editor
- **WHEN** 用户在 `SettingsAddPage` 创建一个新 `profile`
- **THEN** 系统只保存 `profile`
- **AND** 系统不会在创建过程中跳到 `ModelConfigurationPage`

#### Scenario: 创建 profile 后再进入 Models 页面
- **WHEN** 用户完成 `profile` 创建并需要配置模型
- **THEN** 系统要求用户先进入该 `profile` 的 `Profile Detail`
- **AND** 再从 `Profile Detail -> Models` 进入后续 `model` 管理 flow
