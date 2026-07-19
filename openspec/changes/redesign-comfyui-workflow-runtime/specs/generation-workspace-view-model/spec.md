## ADDED Requirements

### Requirement: Generation workspace view model 必须统一拥有 mode 与页面投影
Application/UI composition 层 MUST 由一个 generation workspace view model 统一拥有 `generationMode`，并投影 header target、ordered toolbar controls、prompt surface、attachment surface、billing/status surface、notices、settings route、Send label、Send availability 与 backend-specific submit intent。`MainPage`、Provider management 与 ComfyUI management MUST NOT 分别持有或重复推导页面 mode。

#### Scenario: Provider 与 ComfyUI 共享同一页面壳
- **WHEN** 用户在同一 `MainPage` 内切换 Provider 与 ComfyUI
- **THEN** view model MUST 保持 shared Composer facts，只替换 backend-specific projection

#### Scenario: 页面组件不解释 backend domain
- **WHEN** `MainPage` 渲染 header、toolbar、readiness、notices 或 Send action
- **THEN** 它 MUST 只消费统一 projection，且 MUST NOT 读取 ComfyUI connection、workflow contract 或 Provider transport 细节

### Requirement: View model 必须使用独立 backend builder
View model MUST 使用 `buildProviderComposerViewModel()` 与 `buildComfyUiComposerViewModel()` 分别把 backend facts 转换为同一 `GenerationComposerViewModel`。Builder MUST 只消费对应 backend 的 selection、readiness 与 catalog/workflow facts，并输出页面直接可消费的最小形状。

#### Scenario: Provider builder 只消费 Provider facts
- **WHEN** 当前 mode 为 Provider
- **THEN** Provider builder MUST 投影 profile selector、model selector、output controls 与 Provider submit intent，且 MUST NOT 要求 ComfyUI workflow facts

#### Scenario: ComfyUI builder 只消费 workflow facts
- **WHEN** 当前 mode 为 ComfyUI
- **THEN** ComfyUI builder MUST 投影 Workflow、Text binding、Image binding selectors、workflow readiness、input notices 与 ComfyUI submit intent，且 MUST NOT 要求 Provider profile 或 model catalog

### Requirement: Mode switch 必须保留 shared draft 与各 backend selection
切换 `generationMode` 时，view model MUST 保留 shared Composer draft，至少包括 `prompt` 与 `attachments`，并分别保留 Provider selection 与 ComfyUI workflow selection。切换 mode MUST NOT 清空 draft、丢失非当前 backend selection、猜测 replacement 或把一个 backend 的 selection 写入另一个 backend。

#### Scenario: Provider 切到 ComfyUI
- **WHEN** 用户从 Provider 切到 ComfyUI
- **THEN** `prompt`、`attachments` 与 Provider selection MUST 保持不变，且既有 ComfyUI workflow selection MUST 恢复

#### Scenario: ComfyUI 切回 Provider
- **WHEN** 用户从 ComfyUI 切回 Provider
- **THEN** ComfyUI workflow selection MUST 保留，shared draft MUST 保持不变，且 Provider selection MUST 恢复

### Requirement: Submit intent 必须保持 backend 原生语义
View model MUST 根据当前 `generationMode` 产生唯一 submit intent。Provider intent MUST 保持现有 profile/model/output 语义；ComfyUI intent MUST 表示运行 selected complete workflow，并携带 workflow identity、Form override snapshot、selected optional bindings 与 shared Composer snapshot。ComfyUI intent MUST NOT 携带 connection profile、`ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract` 或 `text-to-image`/`image-edit` operation。

#### Scenario: Provider Send
- **WHEN** 当前 mode 为 Provider 且用户点击 Send
- **THEN** submit intent MUST 使用现有 Provider profile、model、output 与 prompt 语义

#### Scenario: ComfyUI Send
- **WHEN** 当前 mode 为 ComfyUI 且用户点击 Send
- **THEN** submit intent MUST 表示运行 selected complete workflow，且 prompt 与首张 attachment 只作为已选择 binding 的 optional override

#### Scenario: MainPage 不组装 execution payload
- **WHEN** 页面准备提交 generation
- **THEN** `MainPage` MUST 调用 view model 产生的 submit intent，且 MUST NOT 自行组装 backend-specific execution payload

### Requirement: ComfyUI input binding 不得形成 Send gate
ComfyUI projection MUST 将 server/API readiness、selected workflow load state 与 output-node preflight facts用于 Send availability。Text/Image binding、Composer prompt、attachment 数量、workflow 是否消费动态输入以及 mask-specific binding MUST NOT 形成额外 Send gate。Send label 与 tooltip MUST 表达“运行当前 Workflow”，不得使用 Provider operation vocabulary。

#### Scenario: Workflow 没有 Text binding
- **WHEN** selected workflow 可运行、Composer prompt 非空且 Text binding 为 `No binding`
- **THEN** Send MUST 保持可用，并显示 `此 Workflow 不使用当前提示词`

#### Scenario: Workflow 没有 Image binding
- **WHEN** selected workflow 可运行、attachments 非空且 Image binding 为 `No binding`
- **THEN** Send MUST 保持可用，并显示 `此 Workflow 未识别到图片输入，附件不会发送`

#### Scenario: Workflow 有多个附件
- **WHEN** selected workflow 可运行、Image binding 存在且 Composer attachments 超过一张
- **THEN** Send MUST 保持可用，并显示 `此 Workflow 仅使用第一张附件`

#### Scenario: Workflow 没有动态输入
- **WHEN** selected workflow 不消费 Composer prompt 或 attachments 但通过 execution preflight
- **THEN** view model MUST 允许运行 workflow 原值，且 MUST NOT 建立 required prompt、image 或 mask readiness

### Requirement: Settings route 必须跟随 current generation mode
Generation workspace view model MUST 为 settings action 投影与当前 `generationMode` 匹配的 settings route。Provider mode MUST 打开 Provider TAB；ComfyUI mode MUST 打开 ComfyUI TAB。Settings 内部的显式 TAB 切换 MUST 只改变 settings navigation state，不得反向改写 generation mode 或清空 Composer state。

#### Scenario: 从 ComfyUI mode 进入 Settings
- **WHEN** 用户在 ComfyUI mode 点击 settings action
- **THEN** settings route MUST 直接打开 ComfyUI TAB

#### Scenario: 从 Provider mode 进入 Settings
- **WHEN** 用户在 Provider mode 点击 settings action
- **THEN** settings route MUST 直接打开 Provider TAB

#### Scenario: Settings TAB 切换不改 generation mode
- **WHEN** 用户在 Settings 内显式切换 TAB
- **THEN** generation mode 与 shared Composer draft MUST 保持不变
