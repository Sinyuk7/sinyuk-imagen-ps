## Why

当前产品把 `ApiFormat`、endpoint/path 推断、auth mode、billing protocol 和用户模型配置暴露为通用 Provider 配置器，导致新建 Profile 与日常生成需要理解大量 wire-level 概念。现有 GRSAI、Gemini GenerateContent 和 OpenAI Images Provider 已具备独立请求实现、静态模型模板及共享的 Application/Core 执行链，因此应通过收敛产品 surface 而非重写底层架构来降低复杂度。

## What Changes

- 新增固定的 Provider 选择页；用户点击 `+` 后只看到 GRSAI、Gemini 和 GPT Image 2 三个业务入口。
- 新增 GRSAI、Gemini、OpenAI Images 三个独立的 Profile 创建/编辑 surface；Gemini 与 OpenAI Images 可复用窄表单组件，但保持独立路由、固定配置和业务文案。
- 将 `packages/providers` 按 GRSAI、Gemini、OpenAI Images 三个业务 Provider 重组为可见的 vertical slice；每个目录集中拥有固定 Profile 模板、config schema、静态模型目录、descriptor、请求/响应实现和 Provider-local transport，共享代码只保留稳定 contract、registry 与真正跨 Provider 的 transport primitive。
- 将 Provider Profile UI 收拢为独立 feature 目录；Picker、三个 Provider 页面和无业务判断的窄共享表单按产品入口清晰分层，不再散落在通用 Settings pages/components 中。
- Profile 页面只公开名称、API Key、连接测试、保存和删除等必要操作；`apiFormat`、auth mode、endpoint/path、billing protocol、request strategy 与 wire model 由对应 Provider 的固定配置生成。
- Profile 创建继续复用现有 `continueProviderProfileSetup()`、Provider descriptor 默认模型模板和 `UserModelConfig` 初始化；本变更不重写 Provider/Application/Core 执行链。
- 主生成 surface 继续允许选择 Profile 与模型；新 Profile 创建完成后自动拥有静态模型并选择确定的默认模型，避免首次生成被模型配置流程阻塞。
- **BREAKING** 删除用户可见的 Profile Models、Model Configuration、endpoint 自动识别、API path、auth mode、billing protocol、system instruction 和模型 CRUD surface 及其设置路由。
- **BREAKING** 从产品支持集合移除 `openai-chat-completions` 图片生成入口及 `chat-image` builtin；保留 OpenAI 官方 Images API 的 `openai-images` / `image-endpoint` 实现。
- 保留 Profile 列表、多 Profile、Profile 切换、Secret Storage、`ModelGenerationPreference`、History、结果落图、GRSAI async lifecycle、Gemini/OpenAI Images 请求解析、Provider Execution Adapter、Provider Registry、Application/Core 和独立 ComfyUI 工作流。
- 不提供旧 Profile 或 `UserModelConfig` 数据迁移；项目当前为零用户、零生产数据，验证以清理本地存储或卸载重装后的 current-state 为准。

## Capabilities

### New Capabilities

- `provider-profile-surfaces`: 定义固定 Provider 选择、三种专用 Profile 创建/编辑页面、必要字段和 Profile 生命周期交互。
- `fixed-provider-model-experience`: 定义三种 Provider 的静态模型目录、首次初始化、默认选择和只读模型体验。
- `legacy-provider-surface-removal`: 定义通用协议配置、模型 CRUD、`chat-image` 产品入口和相关路由的删除边界。

### Modified Capabilities

无。

## Impact

- `apps/app/src/shared/ui`: Settings 路由、Provider 列表、新建/详情页面、AppShell、Composer 模型 readiness，以及新的 `features/provider-profiles` vertical slice、相关样式、i18n 与 UI harness。
- `packages/application/src/commands`: Profile setup outcome、Profile/model command surface、默认模型选择与 app-facing ports；内部 `UserModelConfigRepository` 和解析路径继续保留。
- `packages/providers`: 目录按三个业务 Provider 重组；builtin registry、`ApiFormat` 支持集合、`chat-image` implementation/transport/catalog，以及 GRSAI、Gemini GenerateContent、OpenAI Images 的固定 Profile 模板、schema、静态模型、descriptor 与 transport ownership。
- Chrome deterministic harness、provider/application contract tests、UXP build 与 `pnpm validate`。
- ComfyUI backend、runtime adapter、connection/workflow 配置和 Photoshop placement contract 不改变。
