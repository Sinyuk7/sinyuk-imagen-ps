## Context

当前主链由 `AppShell` 持有分离的 `selectedImageProfileId + selectedModelId`，再把选择降级为 `profileId + providerOptions.model`。Composer readiness、Session queue、core provider step、runtime model resolution 与 `TaskExecutionSnapshot` 都假设每个执行目的地是 `ProviderProfile`、每个执行目标是 model。

ComfyUI 的执行对象是完整 API Format graph。官方完整示例先连接 `/ws?clientId=...`，再提交带相同 `client_id` 与 caller-known `prompt_id` 的 `/prompt`；WebSocket 观察执行结束后，才读取 `/history/{prompt_id}` 与 `/view`。`/queue` 表达 running/pending，history 只保存 terminal entries；空 history不能代表 pending。

当前 upstream 还确认：caller-known `prompt_id` 是 correlation token，不是 dedupe/idempotency key；legacy `executing { node: null }` 只表示执行结束，不代表成功；terminal event 发出后 history可能尚未完成持久化；重连快照可能缺 `prompt_id`。参考固定 upstream snapshot：

- https://github.com/Comfy-Org/ComfyUI/blob/0aecac867d7840b56ad790aa76c5e76e33c74c3d/server.py
- https://github.com/Comfy-Org/ComfyUI/blob/0aecac867d7840b56ad790aa76c5e76e33c74c3d/execution.py
- https://github.com/Comfy-Org/ComfyUI/blob/0aecac867d7840b56ad790aa76c5e76e33c74c3d/script_examples/websockets_api_example.py

本 change 取代 workflow-as-model 方向。项目是 current-state、零生产数据，不需要 legacy migration。

## Goals / Non-Goals

**Goals:**

- Provider Profiles 与 ComfyUI 是同级 Execution Destinations，第二层分别选择 Model 或 Workflow。
- 用一个 discriminated `GenerationRoute | null` 取代分离的 profile/model selection fields。
- Provider model 与 ComfyUI workflow 保持独立实体、executor、readiness 与 transport。
- 接受任意 bounded、可解析的 API Format graph；bindings 是可选、可验证的 executable adapters。
- Send 时冻结完整 plan；workflow/connection 后续 edit/delete不影响已 admitted task。
- 使用 shared WebSocket 观察 execution lifecycle与真实 progress；history是 terminal result authority，queue/history是有限 fallback。
- 每个 plan最多一次 `/prompt`；所有 ComfyUI errors都不可 Retry。
- 结果汇入现有 AssetStore、Task/History、Preview、Download 与 Photoshop Placement。

**Non-Goals:**

- 不把 ComfyUI注册为 `ProviderProfile`、`ApiFormat`、Provider descriptor、model catalog或 `ProviderModelExecution`。
- 不支持多个 connections、endpoint failover、API Key、remote multi-user auth或 server-side workflow registry。
- 不提供 arbitrary node parameter editor、checkpoint/LoRA/VAE chooser、output matrix或 model capability UI。
- 不使用 `/upload/mask`、`original_ref`、remote cancel、global `/interrupt`、queue clear或 history clear。
- 不要求 Photoshop-specific ComfyUI nodes、Photoshop DOM identity coupling或 socket-based Photoshop control。
- 不持久化 queued plans、ephemeral `clientId`、WS payload或 raw workflow到 Task/History。
- 不把 ComfyUI `value/max` progress泛化成所有 Provider共用的百分比协议。

## Decisions

### 1. UI 同级，领域实体分离

```ts
type ExecutionDestinationRef =
  | { readonly kind: 'provider-profile'; readonly profileId: string }
  | { readonly kind: 'comfyui'; readonly connectionId: 'default' }
```

Provider destination返回 model targets；ComfyUI返回 workflow targets。Selector presentation可以复用；`UiModelInfo`、`UserModelConfig`、`useProfileModels()`、`ModelGenerationSettingsContext` 与 provider output matrix不用于 workflow。

Active selection持久化为一个 `GenerationRoute | null`。Destination已选但 target未选时 route为 `null`。切换 destination或 target失效时清空 target，不自动 fallback第一项。Server offline或 validation unchecked不破坏合法 selection identity。

### 2. Route 简单，execution plan 完整

```ts
type GenerationRoute =
  | { readonly kind: 'provider-model'; readonly profileId: string; readonly modelId: string }
  | { readonly kind: 'comfyui-workflow'; readonly connectionId: 'default'; readonly workflowId: string }
```

Route只回答“选择了哪个目标”。Application在 Send时原子创建：

```ts
interface ComfyUiExecutionPlan {
  readonly kind: 'comfyui'
  readonly workflowId: string
  readonly workflowName: string
  readonly graph: ComfyUiApiWorkflow
  readonly connection: {
    readonly origin: string
    readonly requestTimeoutMs: number
    readonly executionTimeoutMs: number
    readonly wsConnectTimeoutMs: number
    readonly reconciliationIntervalMs: number
    readonly reconciliationTimeoutMs: number
  }
  readonly promptId: string
  readonly prompt?: string
  readonly assets: readonly AssetRef[]
  readonly bindings: ResolvedWorkflowBindings
}
```

Graph是 deep clone；connection是 snapshot；`promptId` 是 canonical lowercase UUID；AssetRefs与 bindings在 admission解析。首个 POST前，prompt ID必须写入 durable Task；write失败则零 POST。Plan是 session-only queue sidecar，不进入 durable `JobInput`、Task、Session snapshot、logs或 diagnostics。

Workflow/connection在 admission后 replace/delete/edit不影响 plan。Dispatch不重新读取 repositories，也不重新选择 target。

### 3. Connection 只接受 origin

`ComfyUiConnectionConfig` 使用 `origin`，只接受 `scheme://host[:port]`。允许 HTTP(S)、localhost、loopback与 LAN IP；拒绝 non-root path、query、fragment、credentials。HTTP origin按 scheme派生 WS URL：`http -> ws`、`https -> wss`。Reverse-proxy path prefix留给后续 capability。

Config保存 request/execution/WS connect/reconciliation timings与 timestamps。只复用中立 origin/duration value objects，不复用完整 `ProviderConnectionConfig`。正常执行不使用固定 polling/backoff；`reconciliationIntervalMs` 与 `reconciliationTimeoutMs` 只在 WebSocket/submit uncertainty fallback启用。

Test Connection固定 bounded `GET /system_stats`，只接受 HTTP success、bounded JSON、`system` object与 `devices` array。它不读取 `/object_info`。Workflow node validation独立按需读取 `/object_info/{class}`。

### 4. Workflow config 保存 executable bindings

```ts
type WorkflowInputBinding =
  | { readonly adapter: 'literal-text'; readonly nodeId: string; readonly inputName: string }
  | { readonly adapter: 'comfy-uploaded-image-name'; readonly nodeId: string; readonly inputName: string }

type WorkflowOutputBinding = {
  readonly adapter: 'history-output-images'
  readonly nodeId: string
}

interface WorkflowBindings {
  readonly prompt?: WorkflowInputBinding
  readonly images: readonly WorkflowInputBinding[]
  readonly mask?: WorkflowInputBinding
  readonly output?: WorkflowOutputBinding
}

interface BindingDiagnostics {
  readonly sources: Readonly<Record<string, 'saved' | 'marker' | 'auto'>>
  readonly warnings: readonly BindingWarning[]
  readonly invalidSavedBindings: readonly InvalidSavedBinding[]
}

interface ComfyUiWorkflowConfig {
  readonly workflowId: string
  readonly displayName: string
  readonly graph: ComfyUiApiWorkflow
  readonly bindings: WorkflowBindings
  readonly bindingDiagnostics?: BindingDiagnostics
  readonly createdAt: string
  readonly updatedAt: string
  readonly workflowContentHash?: string
}
```

`bindings` 只含当前 graph上可执行的 mutation/output adapters；来源与 invalid user intent放在 bounded diagnostics。Content hash只用于 dedupe/cache/diagnostics，不参与 route validity、revision或 retry。

### 5. Binding detection 只选择 supported candidates

Priority保持：

```text
valid saved binding
-> optional marker selecting a supported candidate
-> unique supported automatic candidate
-> no injection
```

v1 registry至少支持：

- `literal-text`: 标准 `CLIPTextEncode.text`，或 `/object_info` 与明确 compatibility rule共同证明的普通 `STRING` prompt input。
- `comfy-uploaded-image-name`: `LoadImage.image`，或明确测试通过且声明 upload-backed string语义的 compatibility rule。
- `history-output-images`: node ID对应的 terminal history `images[]` projection。

Graph input `[nodeId, outputIndex]` 是 link，任何 text/image adapter都不得覆盖。任意 STRING、`ckpt_name`、`vae_name`、filename prefix、sampler/model/LoRA/path不能仅凭 scalar/string shape成为 candidate。Marker只能从 supported candidates中消歧；指向 link或 unsupported input时只产生 warning。

Bindings从不含 `required`。Caller value为空/缺失时保留 graph原值，workflow照常运行。

### 6. Replace 与 Send 都验证 binding

Import/Replace对每个 saved binding验证 node存在、class/input与 adapter兼容、input shape可写且不是 link。Valid binding保留；invalid binding从 active `bindings`移除，写入 bounded `invalidSavedBindings`，并阻止同 role/slot静默 fallback到 marker/auto。

Send admission对 snapshot graph再次执行同一 validator，防止 repository corruption或旧 schema。Invalid binding不进入 plan、不 mutation、不阻塞 workflow；UI显示例如“之前配置的提示词输入已不存在，当前提示词不会传入此 Workflow”。

### 7. Shared WebSocket 是主观察通道

`packages/execution-backends/comfyui` 提供 connection-scoped channel：

```ts
interface ComfyUiRealtimeChannel {
  connect(origin: string): Promise<void>
  subscribe(promptId: string, listener: ComfyUiExecutionListener): Unsubscribe
  disconnect(): void
}
```

每个 active origin维护一条 socket、一个 ephemeral `clientId`与 prompt subscriber map。`clientId`只属于 transport runtime，不进入 Route、Plan、Config、Task或 History。Channel由 Application runtime管理；panel reload/destroy、connection删除/切换和 idle policy负责 cleanup。

支持的 normalized events保持小集合：started、node-started、progress、terminal-hint与 failed。Parser识别 `execution_start`、`executing`、`progress`、`execution_success`、`execution_error`、`execution_interrupted`与 legacy `executing node:null`。所有 task-specific event必须有匹配 `data.prompt_id`；其他 prompt、malformed/unknown events被 bounded ignore/diagnose。`status.queue_remaining`只表示 server总体队列，不能映射为某个 Task进度。

POST accepted后，ComfyUI backend phase先投影为 `queued`；matching `execution_start`、`executing`或 `progress`再投影为 `running`。Progress保留 ComfyUI-specific `nodeId/value/max`。App可以显示 node或 `value / max`，但不得伪造缺失值，也不把协议强加给 Provider models。

### 8. Connect-before-submit 与 at-most-once

顺序固定：

```text
generate ephemeral channel clientId + caller-known promptId
-> connect shared WebSocket and await open
-> subscribe promptId
-> upload bound assets
-> POST /prompt once with prompt + prompt_id + channel client_id
-> observe prompt-scoped events
-> terminal hint
-> bounded GET /history/{promptId}
-> collect/download outputs
```

WebSocket必须在 upload/POST前 ready，避免短 workflow漏事件。若 WS connect失败，v1可以在 bounded timeout后进入 HTTP reconciliation模式再单次 POST；不得为恢复 realtime而重新上传或 POST。

At-most-once是 client policy，不是 server guarantee。Response ID必须与 caller-known ID一致。POST timeout/reset/malformed response不触发第二次 POST。

### 9. Terminal history 与 HTTP reconciliation

`execution_success`、`execution_error`、`execution_interrupted`与 legacy `executing node:null` 都只是 terminal hints。特别是 `node:null` 不代表 success。收到 hint后 bounded读取 history；若首次没有 entry，继续有限 reconciliation，最终由 `history.status` 区分 completed/failed并读取 outputs。

WebSocket中途断开时最多使用同一 `clientId` reconnect一次。重连 event缺 `prompt_id`时不得归属唯一 active task。Reconnect失败、漏 terminal event、POST response模糊时使用：

```ts
type ComfyUiPromptObservation =
  | { readonly state: 'pending' }
  | { readonly state: 'running' }
  | { readonly state: 'completed'; readonly history: ComfyUiHistoryEntry }
  | { readonly state: 'failed'; readonly history: ComfyUiHistoryEntry }
  | { readonly state: 'absent' }
  | { readonly state: 'unknown'; readonly cause: NormalizedTransportError }
```

Observer先查 `/history/{promptId}`；有 entry就 parse terminal status。否则查 `/queue`，严格验证 `queue_running/queue_pending` tuple shape且 item index `1`等于 prompt ID。两边无记录才是 absent；transport/protocol failure是 unknown。

Ambiguous submission在 bounded窗口内若 WS event、history或 queue找到 prompt，即确认 accepted；持续 absent则 `submission-unknown`。Accepted execution在 queue中保持 pending/running则受总 execution timeout约束；断线后持续 absent/unknown且 reconciliation超时则 `execution-state-unknown`。任何 fallback都不属于 Retry。

### 10. 所有外部图片统一 `/upload/image`

Executor只上传被 validated bindings使用的 AssetRefs。Photoshop selection/mask先 materialize为带 alpha PNG或普通 grayscale image，再通过 `/upload/image`；返回的 safe name/subfolder/type经验证后，由 `comfy-uploaded-image-name` adapter写入明确 input。

v1删除 `/upload/mask`、`original_ref`、alpha patch与双上传格式 normalization。Mask role只表达 caller asset语义，不推断 graph topology；没有 explicit mask binding就不上传。

### 11. Output strict binding 与 best-effort fallback

有 explicit output binding时，只读取 bound node `images[]`，所有 descriptors/downloads必须成功，否则 `download-failed`。

无 binding时，按 numeric node ID数值升序、再按 non-numeric lexical顺序扫描全部 `images[]`，保持各 array order。Invalid descriptor或单张 download失败可跳过；至少一张成功则 Task成功，并只保存 bounded `{ discovered, imported, skipped }` warning metadata。没有任何 image entry是 `completed-without-image-output`；找到 entries但全部失败是 `download-failed`。Raw history与 per-item raw error不持久化。

### 12. Error 分层且永不 Retry

```ts
type ComfyUiTaskErrorCode =
  | 'input-preparation-failed'
  | 'upload-failed'
  | 'submission-rejected'
  | 'submission-unknown'
  | 'execution-failed'
  | 'execution-timeout'
  | 'execution-state-unknown'
  | 'completed-without-image-output'
  | 'download-failed'
  | 'protocol-mismatch'

interface ComfyUiTaskError {
  readonly code: ComfyUiTaskErrorCode
  readonly stage: 'prepare' | 'upload' | 'submit' | 'observe' | 'download'
  readonly messageKey: string
  readonly cause?: NormalizedTransportError
}
```

Cause必须 bounded/sanitized，不能含 endpoint、raw response、WS payload、graph或 secret。所有 ComfyUI failed/interrupted tasks都 `canRetry = false`。再次 Generate创建新 Task、plan与 prompt ID。

WS reconnect、HTTP reconciliation、history fetch与 `/view` continuation都属于同一次 execution，不是 Retry。它们不得重新 materialize/upload/POST graph。

### 13. Queue、core 与 persistence 边界

Application-owned router只把 provider plan交给 `ProviderModelExecutor`，把 ComfyUI plan交给 `ComfyUiWorkflowExecutor`。两者在 Application-owned `GenerationResult`汇合。Core provider-named opaque seam泛化为 backend-neutral execution seam，但不导入 route/plan或分支 backend。

Lane keys：

```text
provider-model   -> provider-profile:{profileId}
comfyui-workflow -> comfyui-connection:{connectionId}
```

Singleton ComfyUI lane local cap为 `1`。Public Session snapshot不含 graph/origin/bindings。Durable Task只保存 backend kind、workflow ID/name、known prompt ID、status/progress summary、normalized error、result assets与 timestamps；不保存 plan、clientId、WS payload、full history或 bytes。

### 14. Package 与 host ownership

`packages/execution-backends/comfyui`拥有 parser、binding registry/adapters、HTTP/WS clients、event/queue/history/view parsers、normalization、fake server/channel与 Case Bank。Application拥有 repositories、route、plan、executor composition、channel lifecycle、queue、assets与 task lifecycle。App/Host拥有 file IO、Photoshop materialization与 placement。

`sd-ppp`只作 public-input projection UX参考，不引入 Photoshop-specific nodes、DOM identity或 socket control。

### 15. Transport acceptance 是前置 gate

Connection slice先在真实 Chrome与 Photoshop UXP验证：origin normalization、`/system_stats`、`ws://127.0.0.1`、`ws://localhost`、custom port、LAN、manifest domain permission、CORS/WS origin、HTTPS页面到 `ws://` mixed content、HTTP multipart、Blob/view、timeout、close/error、one reconnect、panel reload cleanup与大图传输。

UXP local docs确认 manifest v5必须声明 network domains，当前 manifest配置 `domains: "all"`；这只证明声明存在，不证明具体 endpoint/port/WS在真实 host可用。若 early transport gate失败，停止后续 execution slice并先收窄 endpoint产品范围。

## Risks / Trade-offs

- [WS event丢失或重连快照缺 prompt ID] -> prompt filtering + one reconnect + bounded history/queue reconciliation；不绑定无 ID event。
- [Terminal event先于 history落盘] -> terminal仅作 hint，bounded等待 authoritative history entry。
- [Loose admission允许无法执行的 workflow] -> import只证明结构安全；binding/node evidence与 server rejection分层表达。
- [Saved binding在 Replace后 dangling] -> replace/send双校验、invalid diagnostics、禁止 silent fallback、workflow原样运行。
- [Ambiguous POST可能已入队] -> caller-known ID、single POST、WS/queue/history confirmation、`submission-unknown`、no Retry。
- [无 output binding包含中间预览] -> best-effort fallback与 bounded counts；用户可保存 explicit output binding进入 strict模式。
- [Plan/WS payload含敏感或大对象] -> 只在 session memory；durable stores/logs禁止原文。
- [UXP WebSocket行为存在 host差异] -> Connection slice早期真实 gate；build/fake不能替代。

## Migration Plan

1. Connection slice：origin normalization、`/system_stats`、shared WS handshake与真实 Chrome/UXP transport gate。
2. Zero-input workflow slice：loose import、route/plan、WS-first single POST、terminal history、single output、现有结果链。
3. Single text binding：validated `CLIPTextEncode.text` adapter；空 prompt保留原值。
4. Single image binding：`/upload/image` + `LoadImage.image` adapter。
5. Ambiguity/binding lifecycle：multiple candidates、marker/saved binding、Replace/Send invalidation与 no fallback。
6. Output fallback：explicit strict、all-output best effort、partial skip warnings。
7. Mask slice：只用 `/upload/image` + alpha/grayscale AssetRef，不引入 `/upload/mask`。
8. 扩展 queue/history/UI/error/acceptance harness，运行 repository gates与 release evidence。

Rollback采用代码回退；connection/workflow stores独立，Provider Profile/model stores不需要修复。

## Open Questions

- 无。v1已固定 WebSocket-first、HTTP reconciliation、executable bindings、origin-only connection、single upload protocol、no Retry与 vertical implementation order；若真实 UXP gate或 upstream contract不成立，必须先更新 artifacts。
