## ADDED Requirements

### Requirement: 通用 Provider 配置 surface SHALL 被移除
App Settings SHALL 不再提供通用 Settings Add、通用 Settings Detail、Profile Models 或 Model Configuration 产品路由。endpoint import/detection、API format 选择、auth mode、advanced paths、billing protocol、system instruction 和模型 CRUD 组件在没有其他产品 owner 时 SHALL 从 app surface 与 app-facing command ports 删除。

#### Scenario: 检查 Settings 路由
- **WHEN** 应用加载 Provider Settings 或处理任一受支持 Profile 的新建/编辑导航
- **THEN** 路由 SHALL 只到 Provider 选择页或对应专用 Profile 页面
- **AND** 路由 union SHALL 不包含 `profile-models` 或 `model-configuration`

#### Scenario: 访问旧模型配置入口
- **WHEN** UI state 或旧测试尝试打开 Profile Models 或 Model Configuration
- **THEN** 当前产品 SHALL 不渲染这些页面或操作入口

### Requirement: Chat Completions 图片 Provider SHALL 被移除
系统 SHALL 从 builtin 注册与受支持 `ApiFormat` 集合移除 `openai-chat-completions` / `chat-image` 图片生成实现、transport、catalog rules 和专属测试。系统 SHALL 保留 `openai-images` / `image-endpoint` 作为 GPT Image 2 官方 Images API implementation；删除 SHALL NOT 影响独立的 prompt optimization 能力。

#### Scenario: 列出 builtin Provider
- **WHEN** Application 初始化 builtin Provider Registry
- **THEN** registry SHALL 包含 `grsai-generate`、`gemini-generate-content` 和 `image-endpoint`
- **AND** registry SHALL NOT 包含 `chat-image`

#### Scenario: 路由 OpenAI Images Profile
- **WHEN** `apiFormat: "openai-images"` Profile 生成或编辑图片
- **THEN** 系统 SHALL 继续使用 `image-endpoint` Provider 与官方 Images API paths

### Requirement: 共享执行链 SHALL 保持稳定
本变更 SHALL 保留 `ProviderGenerationBackend`、Provider Registry、Provider Execution Adapter、dispatch-time secret resolution、asset materialization、GRSAI `ProviderAsyncLifecycle` 与 Application async execution manager。Gemini 与 OpenAI Images SHALL 继续通过同步 `invoke()` 返回 Promise；Core Job/Task lifecycle SHALL 继续作为所有 Provider 的统一异步产品状态。

#### Scenario: 执行 GRSAI 任务
- **WHEN** Core dispatch 一个 GRSAI Job
- **THEN** Provider Execution Adapter SHALL 路由到 GRSAI submit/poll lifecycle
- **AND** Application/Core SHALL NOT 解析 GRSAI request 或 result wire fields

#### Scenario: 执行 Gemini 或 OpenAI Images 任务
- **WHEN** Core dispatch 一个 Gemini 或 OpenAI Images Job
- **THEN** 同一个 Provider Execution Adapter SHALL 调用对应 Provider 的 `invoke()`
- **AND** Task、Job、History 与结果 materialization SHALL 继续使用现有共享链

### Requirement: 非 Provider 产品能力 SHALL 保持不变
Settings Provider surface 收敛 SHALL NOT 删除 Profile 列表、多 Profile 切换、Secret Storage、History、Preview、Download、Place to Photoshop、Prompt Preset、全局生成设置或 ComfyUI 的连接、workflow、参数与生成流程。

#### Scenario: 使用 ComfyUI
- **WHEN** 用户选择 ComfyUI 工作流
- **THEN** ComfyUI backend、runtime adapter、连接配置、workflow 与生成交互 SHALL 保持现有行为

#### Scenario: 使用历史结果
- **WHEN** 任一保留 Provider 任务完成并进入 History
- **THEN** Preview、Download 与 Place to Photoshop SHALL 继续按现有资源合同工作

### Requirement: current-state SHALL 不提供旧数据迁移
系统 SHALL 以零用户、零生产数据为 current-state 实现本次 breaking reset。实现 SHALL 删除旧 schema/surface 的兼容分支而不新增 migration、reset command 或 legacy profile converter；本地开发验证 SHALL 使用清理存储或卸载重装后的状态。

#### Scenario: 开始新版本验证
- **WHEN** 开发者验证本次变更
- **THEN** 验证 SHALL 从空 Profile/Model storage 开始
- **AND** 系统 SHALL NOT 要求实现旧 `openai-chat-completions` Profile 或旧模型编辑数据迁移

