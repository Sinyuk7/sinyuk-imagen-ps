## ADDED Requirements

### Requirement: 单一 Generation Workspace ViewModel 必须拥有 mode、main execution 与 Settings route
Application/UI composition MUST 暴露一个 Generation Workspace ViewModel，统一服务高频 MainPage execution surface 与 Settings navigation。它 MUST 拥有 `generationMode`、shared Composer draft、backend selections、readiness projection、conditional mappings、exposed `#` parameters、notices、Send action 与 mode-matched settings route。MainPage 与 Settings MUST 消费该 projection，且 MUST NOT 重复推导 backend domain state。

#### Scenario: Shared MainPage projection
- **WHEN** MainPage 渲染 header、toolbar、prompt、attachments、status、notices 或 Send
- **THEN** 它 MUST 只消费 unified ViewModel projection，且 MUST NOT 检查 ComfyUI 或 Provider transport details

#### Scenario: Mode-matched Settings route
- **WHEN** 用户从 generation workspace 打开 Settings
- **THEN** ViewModel MUST 将 Provider mode 路由到 Provider TAB，并将 ComfyUI mode 路由到 ComfyUI TAB

### Requirement: Backend builders 必须投影同一个 common shape
ViewModel MUST 使用独立的 `buildProviderComposerViewModel()` 与 `buildComfyUiComposerViewModel()` builder。Provider builder MAY 消费既有 profile/model/output facts；ComfyUI builder MUST 只消费 singleton server、saved-workflow selection、workflow readiness、conditional mappings 与 workflow Form facts。两个 builder 都 MUST NOT 在 common projection 中暴露 parser/driver format label、ComfyUI connection profile、Imagen contract 或 operation semantics。

#### Scenario: Provider builder
- **WHEN** mode 为 Provider
- **THEN** builder MUST 投影既有 Provider selection 与 submit semantics，且 MUST NOT 要求 ComfyUI facts

#### Scenario: ComfyUI builder
- **WHEN** mode 为 ComfyUI
- **THEN** builder MUST 投影 selected saved workflow 与 workflow-native readiness，且 MUST NOT 要求 Provider profile/model facts

### Requirement: Mode switching 必须保留 shared draft 与两侧 selection
切换 `generationMode` 时，ViewModel MUST 保留 session-only shared Composer draft，至少包括 prompt 与 attachments，并 MUST 保留 Provider selection 与 ComfyUI `selectedWorkflowId`。它 MUST NOT 清空、猜测或交叉写入任一 backend selection。Session-only Form overrides MUST 继续归属其 workflow revision。

#### Scenario: Provider 切换到 ComfyUI
- **WHEN** 用户从 Provider 切换到 ComfyUI
- **THEN** prompt、attachments、Provider selection 与既有 ComfyUI selected workflow MUST 保持不变

#### Scenario: ComfyUI 切换到 Provider
- **WHEN** 用户从 ComfyUI 切换到 Provider
- **THEN** ComfyUI workflow selection 与 session Form draft MUST 保持不变，并恢复 Provider selection

### Requirement: ComfyUI projection 必须使用单一 merged user-facing status
ComfyUI ViewModel MUST 将 API、Frontend、Bridge capability facts 与 selected-workflow load/readiness 合并为一个 bounded user-facing status surface。Raw probe dimensions MAY 保留为 diagnostic/internal facts，但 MUST NOT 渲染为分离的 connection/profile rows。ComfyUI status MUST NOT 包含 Provider billing、balance、cost 或 profile semantics；`billingVisible` MUST 为 `false`。

#### Scenario: 无法读取 remote workflows
- **WHEN** internal API probe ready 但 Frontend workflow discovery 或 Bridge unavailable
- **THEN** status surface MUST 显示一个 `Unable to read workflows` 等价的 actionable status，且 MUST NOT 向用户显示单独的 API ready badge

#### Scenario: ComfyUI status 排除 billing
- **WHEN** mode 为 ComfyUI
- **THEN** status surface MUST omit billing content，且 `billingVisible` MUST 为 `false`

### Requirement: Mapping controls 与 `#` parameters 必须条件投影
ViewModel MUST 分别按 Text/Image candidate 数量投影 mapping：零 candidate时不暴露selector并投影non-blocking unavailable notice；恰好一个candidate时自动绑定且不暴露selector；多个candidates时暴露target selector并等待用户显式选择。Text与Image都恰好一个candidate时，ViewModel MUST 隐藏整个Input Mapping section。ViewModel MUST 只暴露current node title以`#`开头的workflow parameters，并按normalized natural title顺序投影。Unknown或non-writable widget MUST 不进入exposed parameter list，同时 MUST 保留其saved value。

#### Scenario: Workflow 没有 compatible mapping
- **WHEN** selected workflow 的 Text 或 Image candidate 数量为零
- **THEN** ViewModel MUST 隐藏对应 selector、投影 unavailable notice，且 Send availability MUST 只服从 workflow/runtime readiness

#### Scenario: Workflow 只有唯一 candidate
- **WHEN** selected workflow 的 Text 或 Image candidate 数量恰好为一
- **THEN** ViewModel MUST 自动解析该 mapping 并隐藏对应 selector

#### Scenario: Workflow 有多个 candidates
- **WHEN** selected workflow 的 Text 或 Image candidate 数量大于一
- **THEN** ViewModel MUST 投影对应 target selector，且 MUST NOT 自动猜测 candidate

#### Scenario: 两类 mapping 都唯一
- **WHEN** Text 与 Image candidate 数量都恰好为一
- **THEN** ViewModel MUST 自动解析两者并隐藏整个 Input Mapping section

#### Scenario: `#` parameter projection
- **WHEN** selected workflow 包含 title 为 `# Prompt` 与 `# Seed` 的 nodes
- **THEN** ViewModel MUST 按 normalized title 顺序暴露这些 parameters，且 MUST NOT 暴露 parser、driver 或 `sdppp_*` identifier

### Requirement: Submit intent 必须保持 native backend semantics
ViewModel MUST 产生一个 backend-specific submit intent。Provider intent MUST 保持当前 profile/model/output semantics。ComfyUI intent MUST 表示“运行当前完整 saved workflow”，并携带 `selectedWorkflowId`、session Form override snapshot、optional revision-scoped mappings 与 shared Composer snapshot。ComfyUI intent MUST NOT 携带 connection profile、workflow format label、Imagen contract 或 `text-to-image`/`image-edit` operation。

#### Scenario: Provider Send
- **WHEN** Provider mode 调用 Send
- **THEN** intent MUST 保持既有 Provider profile/model/output semantics

#### Scenario: ComfyUI Send
- **WHEN** ComfyUI mode 调用 Send
- **THEN** intent MUST 请求运行完整 selected workflow，且 prompt/first attachment MUST 只通过 resolved optional mappings 使用

### Requirement: Input mappings 与 Composer values 不得建立额外 Send gate
ComfyUI Send availability MUST 只服从 singleton server/runtime readiness、selected workflow load state、bounded workflow admission 与 native/local output validation facts。Prompt empty、attachment count、missing mapping、unused dynamic input、unsupported widget、mask presence、unknown output metadata 或 mapping candidate count MUST NOT 独立禁用 Send。Notices MUST 解释被忽略的 prompt 或 attachments，且 MUST NOT 改变 availability。Send label/tooltip MUST 使用“运行当前 Workflow”语义。

#### Scenario: Unused prompt 或 attachment
- **WHEN** prompt 或 attachments 存在但对应 mapping 缺失
- **THEN** Send MUST 保持 available，且 ViewModel MUST 投影 bounded unused-input notice

#### Scenario: Unknown output metadata
- **WHEN** runtime 在 dispatch 前无法解析 output metadata
- **THEN** ViewModel MUST 让 Send 继续服从 native execution readiness，且 MUST NOT 创建 output-metadata hard gate

### Requirement: Settings TAB navigation 不得修改 generation state
Settings 内显式切换 Provider/ComfyUI TAB MUST 只更新 Settings navigation state。它 MUST NOT 改写 `generationMode`、`selectedWorkflowId`、Provider selection、shared Composer draft 或 session Form overrides。

#### Scenario: 显式切换 Settings TAB
- **WHEN** 用户从 generation workspace 进入 Settings 后切换 TAB
- **THEN** generation mode、selections、prompt/attachments 与 session Form draft MUST 保持不变
