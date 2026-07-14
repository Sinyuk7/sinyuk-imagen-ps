## ADDED Requirements

### Requirement: Execution Destination 与 Target 必须分层选择
App MUST 把 Provider Profiles 与 ComfyUI 投影为同级 Execution Destinations。选择 Provider Profile 后，第二层 Target MUST 是 Model；选择 ComfyUI 后，第二层 Target MUST 是 Workflow。Selector presentation MAY 复用，但 workflow MUST NOT 投影为 `UiModelInfo`、`UserModelConfig` 或 model catalog item。

#### Scenario: Provider destination
- **WHEN** 用户选择一个 Provider Profile
- **THEN** Target selector MUST 标记为 Model，并显示该 profile 的 configured models

#### Scenario: ComfyUI destination
- **WHEN** 用户选择 ComfyUI
- **THEN** Target selector MUST 标记为 Workflow，并显示独立 workflow repository 中的 workflows

### Requirement: GenerationRoute 必须只表达选择 identity
Application MUST 使用以下合法 union，并 MUST NOT 在 route 内保存 revision、graph、timeout、binding、AssetRef 或 remote prompt ID：

```ts
type GenerationRoute =
  | { readonly kind: 'provider-model'; readonly profileId: string; readonly modelId: string }
  | { readonly kind: 'comfyui-workflow'; readonly connectionId: 'default'; readonly workflowId: string }
```

#### Scenario: ComfyUI route
- **WHEN** 用户选择 singleton ComfyUI connection 与一个 workflow
- **THEN** Application MUST 生成只包含 `kind`、`connectionId` 与 `workflowId` 的 route

#### Scenario: Illegal mixed route
- **WHEN** caller 同时提供 ComfyUI workflow 与 provider model fields
- **THEN** route decoder MUST 拒绝输入，MUST NOT 创建 Task、queue entry 或 backend side effect

### Requirement: Active selection 必须持久化为完整 discriminated route
App MUST 以 `GenerationRoute | null` 作为 active selection source of truth，MUST NOT 分别持久化 `selectedProfileId`、`selectedModelId`、`selectedWorkflowId` 后在运行时拼接。Reload 时 MUST decode完整 route并验证 referenced identity；connection offline或 node-schema status unknown MUST NOT 使合法 route丢失。

#### Scenario: Reload ComfyUI selection while server offline
- **WHEN** persisted route引用现有 workflow，但 ComfyUI server当前不可达
- **THEN** App MUST 恢复同一 route，readiness MAY 显示 runtime问题，MUST NOT 改选 Provider或清空 workflow

#### Scenario: Persisted target no longer exists
- **WHEN** persisted route引用已删除 profile/model/workflow
- **THEN** App MUST fail closed为 `null`或 target-unselected state，MUST NOT 自动选择第一项

### Requirement: Admission 必须冻结完整 execution plan
Send-time admission MUST 原子解析 route、当前 connection/workflow repositories、host-neutral inputs 与 bindings，并创建 immutable `PreparedGenerationSubmission`。ComfyUI variant MUST 包含 session-only `ComfyUiExecutionPlan`，其中 graph是 deep clone，origin/timings是 current snapshot，`promptId` 在 admission生成，AssetRefs与 `ResolvedWorkflowBindings` 已完成 adapter validation。Invalid saved binding MUST排除且 suppress同槽位 fallback，但 MUST NOT阻止原 graph执行。

#### Scenario: Workflow 在排队后被修改
- **WHEN** admitted ComfyUI task 仍在 queue，随后同一 workflow 被 replace
- **THEN** queued task MUST 使用原 graph snapshot，新 task MUST 使用 replacement graph

#### Scenario: Connection 在排队后被修改
- **WHEN** admitted ComfyUI task 仍在 queue，随后 connection origin 或 timing 改变
- **THEN** queued task MUST 使用原 connection snapshot，新 task MUST 使用新 config

#### Scenario: Workflow 在排队后被删除
- **WHEN** admitted ComfyUI task 仍在 queue，随后 workflow 被删除
- **THEN** queued task MUST 继续使用原 plan；之后的 admission MUST 因 target 不存在而失败

### Requirement: Execution plan 必须是 non-durable session sidecar
Queue MUST 在当前运行时内存保存 execution plan，并把它作为 non-durable execution context传给 executor。Raw graph、origin、resolved bindings、upload plan与 realtime `clientId` MUST NOT进入 durable `JobInput`、`TaskRecord`、Session snapshot、日志或 diagnostics。Dispatch MUST NOT重新读取 repositories，也 MUST NOT根据 current UI state重选 target。

#### Scenario: App reload
- **WHEN** App 在 ComfyUI task 仍 queued 时 reload
- **THEN** queued-only task MAY 按现有 session contract 丢弃，系统 MUST NOT 为恢复它而持久化 raw graph

#### Scenario: Dispatch
- **WHEN** queue lease 获得后开始 ComfyUI dispatch
- **THEN** executor MUST 只消费 admitted plan，repository spies MUST 显示零 dispatch-time reads

### Requirement: Queue lane 必须从 route destination 派生
Provider route lane key MUST 是 `provider-profile:{profileId}`；ComfyUI route lane key MUST 是 `comfyui-connection:{connectionId}`。同一 ComfyUI connection 的不同 workflows MUST 共享 lane。v1 ComfyUI per-connection local lane cap MUST 是 `1`，并在 local invocation settle 时释放；它 MUST NOT 被描述成远端 queue 的严格并发保证。

#### Scenario: Different workflows share a lane
- **WHEN** 两个 ComfyUI tasks 使用不同 workflows 但相同 `connectionId`
- **THEN** 它们 MUST 受同一 lane cap 约束

#### Scenario: Local timeout releases lane
- **WHEN** accepted remote prompt 的本地 invocation 因 timeout settle
- **THEN** local lane MUST 释放，并且 task evidence MUST NOT 声称 remote execution 已停止

### Requirement: Readiness 必须按 backend 分支
Provider readiness MUST继续验证 profile、model、operation与 provider-owned output controls。ComfyUI readiness MUST只阻塞于 connection未配置、workflow未选择、graph不可读取或其他 blocking local error；MUST NOT统一要求 prompt非空、至少一张图片、exact image count、operation classification或 output matrix。Invalid/ambiguous binding与 node-schema status MUST提供明确 auxiliary warning，但 MUST NOT单独阻止原 graph Send。

#### Scenario: Workflow has no detected inputs
- **WHEN** selected workflow graph 可读取且没有 prompt/image bindings
- **THEN** ComfyUI readiness MUST 允许 Send，并把未使用输入作为非阻塞 feedback

#### Scenario: Provider model selected
- **WHEN** selected route 是 `provider-model`
- **THEN** existing provider-specific readiness 与 output matrix rules MUST 保持生效

### Requirement: Selection state 不得自动制造 target
Destination 已选择但 Target 未选择时，route MUST 是 `null`。切换 destination、删除当前 target 或加载失败时，App MUST 清空不再合法的 target，MUST NOT 自动选择第一项、把 model 映射为 workflow 或把旧 output selection 带入 ComfyUI execution。

#### Scenario: Switch from Provider to ComfyUI
- **WHEN** 用户从含已选 model 的 Provider Profile 切换到 ComfyUI
- **THEN** workflow target MUST 为空，旧 model ID 与 output settings MUST NOT 进入 ComfyUI route 或 plan

#### Scenario: Switch from ComfyUI to Provider
- **WHEN** 用户从含已选 workflow 的 ComfyUI切换到 Provider Profile
- **THEN** model target MUST 为空，旧 workflow ID、bindings与 workflow feedback MUST NOT 进入 Provider route 或 request

### Requirement: Durable history 必须只保存 display 与 diagnostics facts
Durable Task/History MUST使用合法 target union保存 task kind、profile/model identity或 workflow identity、workflow display name、remote prompt ID、status、bounded backend progress/output warnings、result assets、normalized error与 timestamps。ComfyUI admission生成 caller-known `promptId` 后，Application MUST在首个 `POST /prompt` 前把该 ID写入 durable Task；持久化失败 MUST阻止 POST。它 MUST NOT保存 execution plan、raw graph、origin/auth、bindings、ephemeral `clientId`、WS payload、upload temp、full history或 image bytes。

#### Scenario: Persist ComfyUI correlation before submission
- **WHEN** admission已生成 caller-known `promptId` 且 task即将提交
- **THEN** durable snapshot MUST 先保存 workflow ID/name 与 remote prompt ID；write失败时 `/prompt` call count MUST 是 0

### Requirement: ComfyUI task 必须永久禁用 generic Retry
所有 ComfyUI failed/interrupted tasks MUST 投影 `canRetry = false`，不使用 `RetryDisposition`，也不提供 generic Retry action。用户再次点击 Generate MUST 创建新 Task、新 execution plan 与新 `promptId`，并采用当时的当前 workflow/connection；它不是旧 task replay。Provider retry 行为 MAY 保持现有独立契约。

#### Scenario: ComfyUI task fails before submission
- **WHEN** ComfyUI task 因 local validation 或 network error 失败
- **THEN** history MUST 显示 `canRetry = false`

#### Scenario: User generates again
- **WHEN** 用户在失败后再次点击 Generate
- **THEN** Application MUST 执行全新 admission，MUST NOT 复用旧 execution plan 或 remote prompt ID

### Requirement: Executors 必须在 normalized GenerationResult 后汇合
Application MUST 提供 backend-neutral `GenerationExecutor` interface，并分别组合 `ProviderModelExecutor` 与 `ComfyUiWorkflowExecutor`。两者成功后 MUST 映射为 Application-owned `GenerationResult`，再进入现有 AssetStore materialization、Task outputs、History、Preview、Download 与 Photoshop Placement 链。

#### Scenario: ComfyUI returns multiple images
- **WHEN** ComfyUI executor 返回 ordered image assets
- **THEN** 下游 MUST 使用现有 backend-neutral result chain，MUST NOT 创建 ComfyUI-specific history 或 placement path

### Requirement: Core dispatch seam 必须 backend-neutral
`packages/core-engine` MUST 只拥有 opaque execution dispatch、Job lifecycle、logger 与 `AbortSignal`。Core MUST NOT 导入 `GenerationRoute`、`ComfyUiExecutionPlan` 或按 profile/model/workflow 分支。Provider-named dispatch/step symbols MUST 泛化为 backend-neutral execution symbols，并由 parity tests 证明现有 provider-model behavior 未改变。

#### Scenario: Execute provider model after rename
- **WHEN** provider-model task 通过新的 execution seam 运行
- **THEN** model resolution、request mapping、result、error 与 lifecycle MUST 与迁移前一致
