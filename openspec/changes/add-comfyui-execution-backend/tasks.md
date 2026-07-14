## 1. Connection Slice 与真实 Transport Gate

- [ ] 1.1 创建 `packages/execution-backends/comfyui` package manifest、TypeScript config、public exports、workspace/policy wiring与独立 test command；禁止依赖 App/Application repositories或 Provider model catalog。
- [ ] 1.2 定义 singleton `ComfyUiConnectionConfig`与 protocol-neutral origin/duration value objects；origin只接受 `scheme://host[:port]`，覆盖 path/query/fragment/credentials/scheme rejection与 HTTP->WS scheme derivation。
- [ ] 1.3 实现 Chrome/UXP独立 connection repository、clone/serialization与 save/get/delete commands；证明 Provider Profile store不变。
- [ ] 1.4 建立 bounded `GET /system_stats` fake cases并实现 Test Connection，验证 HTTP success、minimal `{system,devices}` shape、timeout/size limit且零 `/object_info`/mutation。
- [ ] 1.5 实现 HTTP/WebSocket host adapters与 normalized transport causes，区分 server、UXP permission、CORS、mixed content、WS connect/disconnect、protocol mismatch与 timeout。
- [ ] 1.6 实现最小 connection-scoped `ComfyUiRealtimeChannel`：ephemeral `clientId`、connect/open timeout、prompt subscriptions、unsubscribe、idle/runtime destroy cleanup；`clientId`不得持久化。
- [ ] 1.7 实现独立 ComfyUI Settings entry、origin/timing editor与 Test Connection；禁止复用 Provider endpoint/failover/model editor。
- [ ] 1.8 在真实 Chrome验证 localhost/LAN、CORS/WS origin、HTTPS->`ws://` mixed content、HTTP与 WS handshake；记录实际 endpoint范围。
- [ ] 1.9 在真实 Photoshop UXP验证 manifest permission、`127.0.0.1`、localhost、custom port、LAN、HTTP、`ws://`、timeout、close/error与 panel reload cleanup；若失败，停止后续 slice并先收窄 contract。
- [ ] 1.10 运行独立 package connection tests与 focused App settings scenarios，确认 fake gate不发真实 network。

## 2. Zero-Input Workflow End-to-End Slice

- [ ] 2.1 添加 compile-time/contract tests，锁定 `GenerationRoute` union、`GenerationRoute | null` active selection、非法 model/workflow混合与 route不含 graph/origin/timing/binding/remote ID。
- [ ] 2.2 将 core provider-named opaque dispatch symbols/step kind泛化为 backend-neutral execution seam，并用 provider-model parity tests锁定现有 request/result/error/Job lifecycle。
- [ ] 2.3 在 Application定义 `PreparedGenerationSubmission`、provider/comfy execution plans、`GenerationExecutor`、两个 executors、`GenerationResult`与 strict plan-kind router。
- [ ] 2.4 实现 bounded API Format parser与 loose workflow repository schema，允许 hardcoded/zero-input/no-detected-output graph，拒绝 frontend/malformed/oversized graph且不回显 raw content。
- [ ] 2.5 实现 bounded Chrome/UXP workflow JSON import及 import/list/rename/replace/delete commands，证明不调用 model discovery或 `UserModelConfig` store。
- [ ] 2.6 实现原子 `prepareGenerationSubmission()`：deep clone graph、snapshot origin/timings、生成 caller-known prompt ID、构造 session-only plan与 durable Task draft。
- [ ] 2.7 将 prompt ID在首个 POST前写入 durable Task；覆盖 durable write失败时零 upload/POST以及 queued-only plan reload丢弃且不持久化 graph。
- [ ] 2.8 扩展 fake server/channel，支持 `/ws` open、matching `execution_start/execution_success`、history lag/terminal、`/prompt`、`/history/{promptId}`与 `/view`。
- [ ] 2.9 实现 connect + subscribe before upload/POST与 `{prompt,prompt_id,client_id}`单次 submission；覆盖 response ID mismatch、400 rejection与 call count `0 | 1`。
- [ ] 2.10 实现 terminal hint后 bounded history read、single bound/unbound output download与 `GenerationResult` normalization。
- [ ] 2.11 把 Session queue改为 non-durable plan sidecar与 route-derived lanes；ComfyUI connection lane cap为 `1`，public snapshot不暴露 graph/origin/bindings/clientId。
- [ ] 2.12 把 Task execution snapshot改为 provider/comfy discriminated display facts，禁止 raw graph、WS payload、full history、origin与 bytes。
- [ ] 2.13 用 persisted `GenerationRoute | null`替换 AppShell分离 profile/model state；实现 Model/Workflow selector labels、双向 switch、no fallback与 target delete处理。
- [ ] 2.14 拆分 readiness：zero-input ComfyUI只要求 connection、workflow、readable graph与无 blocking local error；隐藏 provider output controls并允许空 prompt/无附件 Send。
- [ ] 2.15 证明 zero-input结果复用现有 AssetStore、TaskOutput、History、Preview、Download与 Photoshop Placement contracts。
- [ ] 2.16 运行 core、Application session与 zero-input App scenario tests，形成首个完整 vertical proof。

## 3. Single Text Binding Slice

- [ ] 3.1 定义 executable `WorkflowInputBinding`/`WorkflowOutputBinding` unions、`WorkflowBindings`、`ResolvedWorkflowBindings`与 adapter validator public contracts。
- [ ] 3.2 建立 literal-vs-link Case Bank，证明 scalar text可替换而 `[nodeId,outputIndex]`永远不可被 text/image adapter覆盖。
- [ ] 3.3 实现最小 compatibility registry：标准 `CLIPTextEncode.text -> literal-text`；普通 STRING、model/path/sampler/LoRA/VAE/checkpoint/prefix不得自动成为 prompt candidate。
- [ ] 3.4 实现 optional `/object_info/{class}` schema evidence；它只能与 explicit compatibility rule共同确认 custom prompt adapter，不能把任意 STRING变成 prompt。
- [ ] 3.5 在 admission重新验证 text binding并按 adapter mutation working clone；Composer prompt为空时保留 graph原值。
- [ ] 3.6 实现 prompt-used/unused projection与非阻塞 UI feedback，不引入 `required`或 prompt readiness。
- [ ] 3.7 运行 single text fake workflow与 App composer scenarios，证明 repository/plan graph immutable且 POST一次。

## 4. Single Image Binding Slice

- [ ] 4.1 复用 Host/App asset materialization seam，把 Photoshop/file image转换为 AssetStore ref；shared layers不得接收 DOM `File`、UXP entry、native path或 Photoshop object。
- [ ] 4.2 实现 bounded multipart `/upload/image` client，不手工设置 boundary，验证 server-returned safe name/subfolder/type并覆盖 renamed response。
- [ ] 4.3 扩展 compatibility registry：标准 `LoadImage.image -> comfy-uploaded-image-name`；只有 explicit tested upload-backed custom rules可加入。
- [ ] 4.4 实现 single image plan mapping、upload与 adapter graph mutation；无 caller image时保留 graph literal，unused attachment零 upload。
- [ ] 4.5 增加 `input-preparation-failed`、`upload-failed` stage mapping，证明 prepare/upload失败时零 `/prompt`。
- [ ] 4.6 在 fake、Chrome与真实 UXP验证 image upload、Blob/view、大图与 timeout，完成 img2img vertical proof。

## 5. Ambiguity 与 Binding Lifecycle Slice

- [ ] 5.1 实现 priority：valid saved binding、marker-selected supported candidate、unique supported automatic candidate、no injection；marker不得赋予 unsupported input adapter语义。
- [ ] 5.2 覆盖 multiple text/image candidates、marker缺失/重复、不连续 image markers与 no-guess行为；unused caller values必须明确且零 upload。
- [ ] 5.3 将 workflow config正式字段命名为 `bindings`，持久化 bounded `bindingDiagnostics` sources/warnings/invalid saved intents；删除 `detectedBindings`与 `required`。
- [ ] 5.4 实现 Replace-time validation：node/input/class/value-shape/link变化时 active binding失效，保存 invalid diagnostic并 suppress同 role/slot marker/auto fallback。
- [ ] 5.5 实现 Send-time snapshot revalidation，覆盖 repository corruption/old schema；invalid binding不进 plan、不 mutation、不阻塞原 graph。
- [ ] 5.6 实现 invalid saved binding UI warning与重新配置/清除 intent流程，禁止 silent candidate switch。
- [ ] 5.7 实现 explicit-only mask role detection与 `IMAGEN_PS_MASK` candidate selection，但暂不上传 mask；禁止 topology/alpha/MASK-output consumption推断。
- [ ] 5.8 实现 workflow node-schema四状态 projection与 revalidate command，证明 status不承诺 model/dependency/GPU/execution success。
- [ ] 5.9 运行 ambiguity/replace/admission Case Bank与 workflow Settings/App scenarios。

## 6. Realtime Resilience、Observation 与 Error Slice

- [ ] 6.1 实现 bounded WebSocket event parser与 prompt subscriber map，覆盖 `execution_start`、`executing`、`progress`、`execution_success/error/interrupted`与 legacy node-null。
- [ ] 6.2 严格按 `data.prompt_id`过滤；忽略 other prompt、unknown/malformed event、channel `status`与 reconnect后无 prompt ID snapshot，且不持久化 raw payload。
- [ ] 6.3 实现 ComfyUI-specific `queued -> running` backend phase与 `nodeId/value/max` progress projection；不得用 server-wide queue_remaining推断单 task，也不得强加给 Provider executor。
- [ ] 6.4 实现 `/queue` decoder与 `ComfyUiPromptObservation`：history terminal优先，其次 strict `queue_running/queue_pending` tuple index `1`，再到 absent/unknown。
- [ ] 6.5 实现 socket断开后同 clientId最多一次 reconnect；reconnect成功仍以 history reconciliation兜底 missed terminal event，失败转 HTTP fallback且不 replay。
- [ ] 6.6 实现 ambiguous POST confirmation：WS event/history/queue任一找到 prompt即 accepted；bounded窗口持续 absent返回 `submission-unknown`。
- [ ] 6.7 实现 accepted execution reconciliation：pending/running受 execution timeout约束；持续 absent/unknown超过 reconciliation timeout返回 `execution-state-unknown`。
- [ ] 6.8 实现 stable error `code + stage + messageKey + bounded cause` union，覆盖 prepare/upload/submit/observe/download与 `protocol-mismatch`。
- [ ] 6.9 实现 abort/late-response：停止后续调度、unsubscribe task listener、不关闭其他 subscribers、不保证 UXP in-flight request取消、不声称 remote canceled。
- [ ] 6.10 删除 ComfyUI generic Retry与 `RetryDisposition`分支；所有 failed/interrupted tasks `canRetry=false`，再次 Generate创建新 plan/prompt ID。
- [ ] 6.11 扩展 fake realtime Case Bank：event interleave、history lag、disconnect/reconnect、malformed queue、submission ambiguity、timeouts、abort与 POST count始终不超过 1。

## 7. Output Binding 与 Best-Effort Fallback Slice

- [ ] 7.1 实现 optional `history-output-images(nodeId)` binding与 marker/saved output selection；缺少 binding不阻止 workflow。
- [ ] 7.2 实现 strict bound output：只收指定 node，任一 descriptor或 download失败使 Task `download-failed`。
- [ ] 7.3 实现 unbound fallback排序：numeric IDs数值升序且优先，其他 IDs lexical顺序，保持每个 `images[]` array order。
- [ ] 7.4 实现 unbound best-effort：invalid descriptor或单张 download failure跳过；至少一张成功即成功，零 entries为 `completed-without-image-output`，全部失败为 `download-failed`。
- [ ] 7.5 实现 safe encoded `/view`、channel allowlist、MIME/signature/byte limits与 traversal/control-character rejection。
- [ ] 7.6 只保存 bounded `{discovered, imported, skipped}` metadata，禁止 raw history与 per-item raw errors。
- [ ] 7.7 运行 single/multi/final+preview/custom output、partial descriptor/download failure与 ordered asset result chain scenarios。

## 8. Mask via /upload/image Slice

- [ ] 8.1 在 Host/App将 Photoshop selection/mask materialize为带 alpha PNG或普通 grayscale image AssetRef，保留现有 placement ownership。
- [ ] 8.2 将 explicit mask role解析为 validated `comfy-uploaded-image-name` binding，统一使用 `/upload/image`与普通 graph injection。
- [ ] 8.3 证明无 mask binding时零 materialization/upload/injection，且消费 `LoadImage` MASK output不会自动启用 Photoshop mask。
- [ ] 8.4 删除/禁止 `/upload/mask`、`original_ref`、alpha-patching transport、双 upload response normalization与对应 fake route。
- [ ] 8.5 运行 alpha PNG、grayscale mask、unbound mask、wrong adapter与 no-`/upload/mask` contract tests。

## 9. Acceptance、Release Evidence 与 Writeback

- [ ] 9.1 运行 `openspec validate add-comfyui-execution-backend --type change --strict --json`与 residual scan，确认无 polling-first、WebSocket-deferred、history-pending、`detectedBindings`、`required`、`/upload/mask`、`original_ref`、revision routing或 ComfyUI Retry obligations。
- [ ] 9.2 运行 model catalog与 policy checks，证明 ComfyUI未进入 Provider descriptor、model catalog、`ApiFormat`、discovery或 request strategy。
- [ ] 9.3 运行 `pnpm --filter @imagen-ps/core-engine test`、独立 ComfyUI package tests、`pnpm --filter @imagen-ps/application test`与 focused App scenarios。
- [ ] 9.4 运行 `pnpm --filter @imagen-ps/app build:chrome`、`pnpm --filter @imagen-ps/app build:uxp`、`pnpm validate`与 `pnpm release:verify`；build/fake不得冒充真实 transport proof。
- [ ] 9.5 运行 opt-in live ComfyUI smoke：zero-input、text、image、ambiguity、WS progress、disconnect/reconnect、queue/history fallback、outputs、mask-via-image、abort与 no Retry。
- [ ] 9.6 在真实 Chrome复验 CORS/WS origin/mixed-content、tab lifecycle、HTTP fallback、multipart、Blob与 large transfer。
- [ ] 9.7 在真实 Photoshop UXP复验 manifest endpoint范围、WS lifecycle、panel reload、HTTP fallback、multipart、Blob、timeout与 large transfer。
- [ ] 9.8 把稳定 route/plan/binding/realtime/error/testing/UXP facts写回 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`或 matching module `AGENTS.md`；不写 raw payload、execution logs或临时计划。
