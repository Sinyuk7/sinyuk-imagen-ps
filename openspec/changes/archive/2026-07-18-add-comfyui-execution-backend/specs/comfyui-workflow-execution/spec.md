## ADDED Requirements

### Requirement: Executor 必须只消费 send-time plan
`ComfyUiWorkflowExecutor` MUST 接收 immutable `ComfyUiExecutionPlan`，不得在 dispatch时重新读取 workflow/connection repositories、UI state或 model settings。Plan MUST 包含 deep-cloned complete API graph、origin/timing snapshot、caller-known `promptId`、validated `ResolvedWorkflowBindings`与 host-neutral AssetRefs；MUST NOT 包含 `clientId`。

#### Scenario: Repository changes before dispatch
- **WHEN** admission后 workflow与 connection repositories被修改
- **THEN** executor MUST 执行 plan snapshot，repository spies MUST 记录零 reads

### Requirement: Admission 必须 fail closed 地重新验证 bindings
Admission MUST 对 snapshot graph重新验证每个 adapter。Invalid binding MUST 从 plan排除、保留 graph原值、suppress同 role/slot fallback并产生 bounded warning；MUST NOT 阻止 zero-input workflow执行。Only validated bindings MAY mutation graph。

#### Scenario: Persisted text binding now points to link
- **WHEN** snapshot input为 `[sourceNodeId, outputIndex]`
- **THEN** plan MUST 排除该 binding，Composer prompt MUST 不写入 link

### Requirement: Shared WebSocket 必须在 upload 与 POST 前 ready
Runtime MUST 为 plan origin取得 connection-scoped shared realtime channel，生成或复用 ephemeral `clientId`，等待 socket open并在 upload/POST前订阅 plan `promptId`。若 connect在 bounded timeout内失败，executor MAY 进入 HTTP reconciliation mode并继续一次 submission；MUST NOT 因 channel恢复而重复 upload或 POST。

#### Scenario: Short workflow
- **WHEN** workflow可能在 POST后立即完成
- **THEN** prompt listener MUST 在 `/prompt` 前已经注册

#### Scenario: WebSocket unavailable before submission
- **WHEN** WS connect timeout但 HTTP origin仍可访问
- **THEN** executor MAY 进入 reconciliation mode并最多 POST一次，MUST NOT 声称 realtime可用

### Requirement: Realtime channel 必须按 promptId 路由小型事件集合
Parser MUST bounded处理 `execution_start`、`executing`、`progress`、`execution_success`、`execution_error`、`execution_interrupted`与 legacy `executing node:null`。Task-specific event MUST 含与 plan精确匹配的 `data.prompt_id`。Other prompt IDs、unknown/malformed payload与重连后无 prompt ID snapshot MUST NOT归属当前 Task；raw WS payload MUST NOT进入 logs或 history。`status.queue_remaining`只作 channel级 evidence，MUST NOT成为单 Task状态或进度。

#### Scenario: Other client event
- **WHEN** shared socket收到另一 prompt ID的 `progress`
- **THEN** current Task listener MUST 不更新

#### Scenario: Reconnect snapshot lacks promptId
- **WHEN** server在 reconnect后发送只有 node ID的 `executing`
- **THEN** router MUST 忽略 task attribution并触发/继续 HTTP reconciliation

### Requirement: Realtime progress 必须保持 backend-specific
Accepted `/prompt` response MUST先投影 ComfyUI backend phase `queued`；matching `execution_start`、`executing node != null`或 `progress` MUST转为 `running`。`executing` MAY投影 current node；`progress` MAY投影 bounded `nodeId/value/max`。Application MUST NOT invent缺失值，也 MUST NOT把 ComfyUI progress schema强加给 Provider models。

#### Scenario: Accepted before execution starts
- **WHEN** `/prompt`已 accepted但尚未收到 matching execution activity
- **THEN** UI MAY显示 queued，MUST NOT使用 server-wide `queue_remaining`推断当前 task位置

#### Scenario: Progress event
- **WHEN** matching event包含 `value: 12` 与 `max: 30`
- **THEN** App MAY显示 `12 / 30`，MUST NOT改写为无来源的百分比

### Requirement: Graph mutation 必须按 executable adapter dispatch
Executor MUST 从 plan graph再 clone invocation working graph。`literal-text`只能替换 validated scalar text；`comfy-uploaded-image-name`只能替换 validated upload-backed scalar input；`history-output-images`只读取 history，不修改 graph。Caller value缺失时 MUST 保留原值。Caller MUST NOT override node IDs、adapters或 raw graph。

#### Scenario: Empty prompt
- **WHEN** prompt binding valid但 Composer prompt为空
- **THEN** working graph MUST 保留 original text

#### Scenario: Adapter mismatch
- **WHEN** runtime shape与 binding adapter不一致
- **THEN** executor MUST 不 mutation、不猜其他 node，并保留 bounded warning

### Requirement: 所有外部图片必须统一通过 /upload/image
Executor MUST 只解析和上传 bound AssetRefs，并通过 bounded multipart `/upload/image`发送 image、alpha PNG或 grayscale mask image。它 MUST 采用 server返回且通过 safe name/subfolder/type验证的 descriptor，再由 `comfy-uploaded-image-name`写入 graph。v1 MUST NOT 调用 `/upload/mask`、发送 `original_ref`或实现 alpha-patching transport。

#### Scenario: Explicit mask binding
- **WHEN** App materialize alpha PNG且 plan有 valid mask image binding
- **THEN** executor MUST 使用 `/upload/image`并把 returned image name写入该 binding

#### Scenario: Unbound mask
- **WHEN** caller有 mask但 plan没有 valid mask binding
- **THEN** upload spy MUST 显示 mask零 requests

### Requirement: 每次 invocation 必须提交完整 graph 且最多一次
Executor MUST POST `{ prompt, prompt_id: promptId, client_id: channelClientId }`，其中 prompt是完整 working graph，`client_id`来自 ephemeral channel。Application MUST 在首个 POST前把 prompt ID写入 durable Task；write失败时零 POST。Response timeout/reset/malformed body、WS disconnect或 endpoint uncertainty MUST NOT触发第二次 POST。Caller-known ID只用于 correlation/reconciliation，不是 server idempotency key。

#### Scenario: Accepted response
- **WHEN** `/prompt`返回匹配 caller-known ID
- **THEN** executor MUST 继续 realtime observation且 POST call count为 1

#### Scenario: Response ID mismatch
- **WHEN** response `prompt_id`与 plan ID不同
- **THEN** executor MUST 返回 `protocol-mismatch`，MUST NOT跟随 unknown ID或再次 POST

#### Scenario: Ambiguous response
- **WHEN** server可能已接受但 client未收到完整 response
- **THEN** executor MUST 使用已订阅 WS evidence和 bounded HTTP reconciliation确认，MUST NOT再次 POST

### Requirement: WebSocket terminal event 只能触发 authoritative history read
`execution_success`、`execution_error`、`execution_interrupted`与 legacy `executing node:null` MUST 被视为 terminal hint，不是最终 success truth。收到 matching hint后，executor MUST bounded读取 `/history/{promptId}`；history尚未落盘时继续 reconciliation。最终 success/failure MUST 由 terminal history status决定。

#### Scenario: Legacy node-null after failure
- **WHEN** server在 execution error后发送 `executing { node: null }`
- **THEN** executor MUST读取 history并返回 `execution-failed`，MUST NOT把 node-null当 success

#### Scenario: History lags terminal event
- **WHEN** terminal event后首次 history返回 `{}`
- **THEN** executor MUST 在 bounded window继续 reconciliation，MUST NOT立即返回 no-output

### Requirement: HTTP reconciliation 必须组合 history 与 queue
Fallback observer MUST 先读取 `/history/{promptId}`；有 entry时 parse `completed | failed`。没有 entry时 MUST读取 `/queue`并严格验证 `queue_running`与 `queue_pending` arrays，且 queue item index `1`为 prompt ID。Matching running/pending分别映射 `running/pending`；两边都无才映射 `absent`；transport/schema failure映射 `unknown`。History empty MUST NOT单独解释为 pending/running。

#### Scenario: Prompt is pending
- **WHEN** history为空且 `queue_pending`含 matching tuple
- **THEN** observation MUST 是 `pending`

#### Scenario: Prompt is running
- **WHEN** history为空且 `queue_running`含 matching tuple
- **THEN** observation MUST 是 `running`

#### Scenario: Malformed queue tuple
- **WHEN** queue item缺少 index `1` prompt ID
- **THEN** observation MUST 是 `unknown`且 bounded cause为 `protocol-mismatch`

### Requirement: Reconnect 与 reconciliation 必须有界且不 replay
WebSocket中途断开后，channel MUST 使用同一 ephemeral `clientId`最多 reconnect一次。Reconnect失败或可能漏 event时，executor MUST使用 reconciliation interval/timeout；不得重新 materialize、upload或 POST。Accepted prompt持续 pending/running受 execution timeout约束。Accepted execution持续 absent/unknown超过 reconciliation timeout MUST返回 `execution-state-unknown`；ambiguous submission持续 absent超过 confirmation window MUST返回 `submission-unknown`。

#### Scenario: Reconnect succeeds without terminal replay
- **WHEN** reconnect成功但 server未重放 missed terminal event
- **THEN** executor MUST通过 history reconciliation收敛，不得永久等待 WS

#### Scenario: Reconnect exhausted
- **WHEN** socket断开且一次 reconnect失败
- **THEN** Task MUST切换 HTTP reconciliation，POST call count保持 1

### Requirement: Error 必须按 code 与 stage 归一
ComfyUI error code MUST 包含 `input-preparation-failed | upload-failed | submission-rejected | submission-unknown | execution-failed | execution-timeout | execution-state-unknown | completed-without-image-output | download-failed | protocol-mismatch`。Error MUST 同时包含 `prepare | upload | submit | observe | download` stage、stable message key与 optional bounded `NormalizedTransportError` cause。Raw endpoint、graph、payload、history、stack或 image bytes MUST NOT持久化。

#### Scenario: AssetRef cannot be read
- **WHEN** bound AssetRef在 upload前无法解析
- **THEN** task MUST失败为 `input-preparation-failed` at `prepare`，且 `/prompt` call count为 0

#### Scenario: Upload fails
- **WHEN** `/upload/image`失败
- **THEN** task MUST失败为 `upload-failed` at `upload`，且 `/prompt` call count为 0

### Requirement: 所有 ComfyUI errors 必须不可 Retry
所有 ComfyUI failed/interrupted Tasks MUST `canRetry = false`，MUST NOT使用 `RetryDisposition`或 generic Retry。用户再次 Generate MUST创建新 Task、plan与 prompt ID。WS reconnect、HTTP reconciliation、history/view continuation属于同一次 execution，不是 Retry。

#### Scenario: Execution state unknown
- **WHEN** reconciliation最终返回 `execution-state-unknown`
- **THEN** History MUST不提供 Retry action

### Requirement: Output collection 必须区分 strict binding 与 best-effort fallback
有 explicit `history-output-images` binding时，executor MUST只收集 bound node且全部 descriptors/downloads成功，否则 `download-failed`。无 binding时，executor MUST按 numeric node ID数值升序、再按 non-numeric lexical顺序扫描全部 standard `images[]`并保持 array order；invalid descriptor或单张 download failure MAY跳过。至少一张成功即 Task success，并保存 bounded `{ discovered, imported, skipped }` metadata；无 entries返回 `completed-without-image-output`；有 entries但全部失败返回 `download-failed`。

#### Scenario: Explicit output is strict
- **WHEN** bound node返回三张 images且一张下载失败
- **THEN** entire Task MUST失败为 `download-failed`

#### Scenario: Fallback partial success
- **WHEN** unbound scan发现四张 images、三张成功、一张无效
- **THEN** Task MUST成功并只保存 `{ discovered: 4, imported: 3, skipped: 1 }`

#### Scenario: Fallback all downloads fail
- **WHEN** unbound scan发现 image entries但零张可导入
- **THEN** Task MUST失败为 `download-failed`

### Requirement: Output download 必须安全且有界
Executor MUST构造 encoded `/view` requests，拒绝 traversal、absolute path、control characters与 unsupported type，允许 validated `input | temp | output` channels，并强制 status、byte limit与 supported image MIME/signature。Raw response与 partial bytes MUST NOT持久化。

#### Scenario: Traversal descriptor
- **WHEN** filename或 subfolder含 traversal syntax
- **THEN** strict模式 MUST失败；fallback模式 MUST skip且不得发送 `/view`

### Requirement: Abort 不得暗示 remote cancellation
Abort MUST停止后续 upload/POST/realtime等待/reconciliation/download调度，unsubscribe listener并忽略迟到结果。UXP MUST NOT保证 signal已取消 in-flight host request。Prompt可能 accepted后，Task MAY映射 interrupted并保存 remote prompt ID与 `remoteMayContinue`，但 MUST NOT调用 remote/global cancel或提供 Retry。

#### Scenario: Abort after acceptance
- **WHEN** caller在 matching progress后 abort
- **THEN** local observation MUST停止，remote可能继续，socket shared channel MUST不因单 task abort影响其他 subscribers

### Requirement: Result normalization 必须接入共享 image chain
成功 execution MUST返回 Application-owned `GenerationResult`，包含 ordered image assets、optional backend progress summary与 bounded output warning metadata。它 MUST NOT暴露 raw workflow、prompt payload、WS payload、full history、origin/auth或 unbounded response。Downstream MUST复用 AssetStore、TaskOutput、History、Preview、Download与 Photoshop Placement。

#### Scenario: Successful fallback output
- **WHEN** best-effort fallback导入多张 ordered assets
- **THEN** existing backend-neutral result chain MUST消费这些 assets与 bounded warning counts

### Requirement: ComfyUI package 必须独立于 model providers
Parser、binding registry/adapters、HTTP/WS clients、event/queue/history/view parsers、normalization、fake server/channel与 Case Bank MUST位于 `packages/execution-backends/comfyui`。Package MUST NOT注册 Provider descriptor、model catalog、discovery、capability或 request strategy，也 MUST NOT依赖 Application repositories或 App UI。

#### Scenario: Catalog validation
- **WHEN** model catalog policy运行
- **THEN** ComfyUI package MUST不作为 model provider出现

### Requirement: Fake harness 必须证明 realtime 与 fallback contracts
Default tests MUST使用 scriptable fake HTTP server、fake WebSocket、fake clock/repositories与 spies，覆盖 connect-before-submit、prompt filtering、progress、terminal/history lag、disconnect、one reconnect、queue/history reconciliation、single POST、adapter mutation、`/upload/image` only、strict/best-effort outputs、errors、abort与 no Retry。Default suite MUST零 live network；真实 Chrome/UXP evidence保持 opt-in gate。

#### Scenario: Unrelated WebSocket traffic
- **WHEN** fake channel交错发送 current/other prompt events与 malformed payload
- **THEN** only matching valid events MUST改变 Task state，raw payload MUST不持久化
