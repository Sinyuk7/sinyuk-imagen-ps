## ADDED Requirements

### Requirement: Provider 新建 SHALL 从固定业务选择开始
用户从 Provider 列表激活 `+` 时，系统 SHALL 显示且只显示 GRSAI、Gemini 和 GPT Image 2 三个可创建入口。选择结果 SHALL 直接决定内部 `apiFormat`、Provider implementation、默认 endpoint、paths 与 auth mode；系统 SHALL NOT 要求用户识别或选择这些 wire-level 字段。

#### Scenario: 打开 Provider 选择页
- **WHEN** 用户从 Settings 的 Provider 列表激活 `+`
- **THEN** 系统 SHALL 显示 GRSAI、Gemini 和 GPT Image 2 三个入口
- **AND** 系统 SHALL NOT 显示 `ApiFormat`、OpenAI Chat Completions 或自定义协议入口

#### Scenario: 选择 Gemini
- **WHEN** 用户选择 Gemini
- **THEN** 系统 SHALL 打开 Gemini Profile 创建页并固定使用 `apiFormat: "gemini-generate-content"`

#### Scenario: 选择 GPT Image 2
- **WHEN** 用户选择 GPT Image 2
- **THEN** 系统 SHALL 打开 OpenAI Images Profile 创建页并固定使用 `apiFormat: "openai-images"`

### Requirement: 每种 Provider SHALL 拥有独立 Profile surface
系统 SHALL 为 GRSAI、Gemini 和 OpenAI Images 提供独立的创建/编辑路由与页面 owner。页面 MAY 复用 header、API Key field、footer 等窄 UI primitive，但 SHALL NOT 复用能够切换 `apiFormat`、auth mode、paths、billing protocol 或模型配置的通用 Provider editor。

#### Scenario: 编辑不同类型 Profile
- **WHEN** 用户从 Provider 列表打开一个 ready Profile
- **THEN** AppShell SHALL 按该 Profile 的内部 `apiFormat` 导航到对应专用页面
- **AND** 页面 SHALL 使用该 Provider 自己的字段、默认配置和文案

#### Scenario: Gemini 与 OpenAI Images 复用基础表单
- **WHEN** 两个页面复用名称、API Key 或 footer 组件
- **THEN** 复用组件 SHALL 只处理对应字段和展示行为
- **AND** Provider-specific config assembly SHALL 继续由各自页面或其专用 controller 拥有

### Requirement: Profile 页面 SHALL 只公开必要配置
创建页 SHALL 公开 Profile 名称、API Key、Save/Cancel；编辑页 SHALL 额外公开 Delete，并允许替换或移除已保存 API Key。只有 Provider 已实现不生成图片、不产生费用的 safe probe 时，页面才 SHALL 显示 Test Connection。页面 SHALL NOT 公开 endpoint collection、endpoint measurement、API path、auth mode、billing protocol、system instruction、wire model、request strategy 或 capability matrix。

#### Scenario: 创建 GRSAI Profile
- **WHEN** 用户打开 GRSAI 创建页
- **THEN** 页面 SHALL 显示名称、API Key、Save 和 Cancel
- **AND** 页面 SHALL NOT 显示 endpoint、submit/result path、auth mode、billing 或模型配置字段

#### Scenario: Provider 不支持 safe probe
- **WHEN** 当前 Provider 没有可用的无生成 safe probe
- **THEN** 页面 SHALL NOT 显示会被用户理解为远端验证成功的 Test Connection 操作

#### Scenario: 删除既有 Profile
- **WHEN** 用户在任一专用编辑页确认 Delete
- **THEN** 系统 SHALL 复用现有 Profile 删除命令删除 Profile、关联 `UserModelConfig` 与 secrets
- **AND** 系统 SHALL 返回 Provider 列表

### Requirement: 专用页面 SHALL 写入固定 Provider 配置
系统 SHALL 继续保存现有 `ProviderProfile` 结构，但 SHALL 由专用页面生成单 endpoint、固定 paths、固定 auth mode 和 disabled billing 配置。GRSAI SHALL 使用 `https://grsai.dakka.com.cn`、Bearer API Key、`/v1/api/generate` 与 `/v1/api/result`；Gemini SHALL 使用 `https://generativelanguage.googleapis.com/v1beta`、`x-goog-api-key` 与 `/models/{model}:generateContent`；OpenAI Images SHALL 使用 `https://api.openai.com/v1`、Bearer API Key、`/images/generations` 与 `/images/edits`。

#### Scenario: 保存 Gemini Profile
- **WHEN** 用户提交合法名称与 API Key
- **THEN** 系统 SHALL 构造一个 `gemini-generate-content` Profile，使用固定 Gemini endpoint、path template、`x-goog-api-key` 和 disabled billing

#### Scenario: 保存 OpenAI Images Profile
- **WHEN** 用户提交合法名称与 API Key
- **THEN** 系统 SHALL 构造一个 `openai-images` Profile，使用固定 OpenAI endpoint、generation/edit paths、Bearer API Key 和 disabled billing

#### Scenario: 创建多个同类型 Profile
- **WHEN** 用户使用不同名称或 API Key 再次创建同一种 Provider Profile
- **THEN** 系统 SHALL 保存独立 Profile 并保留 Profile 列表与切换能力

### Requirement: Profile 创建 SHALL 直接结束于 ready 状态
三个 builtin Provider 的 descriptor SHALL 都提供非空完整默认模型模板。专用创建页 SHALL 复用 `continueProviderProfileSetup()`；模板原子初始化成功后，Profile SHALL 直接 promotion 为 ready、返回 Provider 列表并显示成功反馈，不得导航到 Profile Models 或 Model Configuration。

#### Scenario: 成功创建 GRSAI Profile
- **WHEN** Profile 配置与 12 个默认模型模板全部保存成功
- **THEN** 系统 SHALL 将 Profile promotion 为 ready 并返回 Provider 列表
- **AND** 系统 SHALL NOT 打开任何模型配置页面

#### Scenario: 默认模型初始化失败
- **WHEN** 任一默认模型模板不能解析或原子初始化失败
- **THEN** 系统 SHALL NOT 将 Profile promotion 为 ready
- **AND** 系统 SHALL 显示失败反馈且不留下公开的半完成 Profile

