## Why

当前生成链把 `ProviderProfile` 视为执行目的地、把 model 视为目的地内部的执行目标。ComfyUI 在 UI 上同样回答“本次请求交给哪里执行”，但它的执行目标是完整 workflow graph，不是 model，也不应被伪装成特殊 `ProviderProfile` 或 `UserModelConfig`。

需要引入显式 backend route、send-time execution plan 与独立 executor，让 provider-model 和 comfyui-workflow 共享选择体验、任务生命周期与图片结果链，同时保持各自的数据结构、binding、transport、realtime observation、failure 与 retry 语义独立。

## What Changes

- **BREAKING**：把主界面 Profile/Model 选择重构为 Execution Destination/Target；Provider Profile 下面选择 Model，ComfyUI 下面选择 Workflow。
- **BREAKING**：引入简单 discriminated `GenerationRoute`，只表达 `profileId + modelId` 或 `connectionId + workflowId`；graph、connection snapshot、bindings 与 remote IDs 属于 send-time execution plan。
- 新增独立 singleton `ComfyUiConnectionConfig` 与 `ComfyUiWorkflowConfig` repositories；它们不进入 Provider Profile、model catalog、`UserModelConfig`、`requestStrategyId` 或 output matrix。
- Connection v1 只接受 HTTP(S) origin，固定使用 `GET /system_stats` 做 safe probe；workflow node validation 独立按需使用 `/object_info`。
- Workflow import 只要求 bounded、可解析的 ComfyUI API Format graph。Prompt/image/mask/output bindings 都是可选增强，不是导入或 Send 门槛。
- Binding 改为 executable adapter，而不只是 `nodeId + inputName`。v1 仅支持 validated literal text、Comfy uploaded image name 与 history output images；marker 只能选择 supported candidate，不能赋予 arbitrary input 新协议。
- Replace 与 Send admission 都重新验证 saved bindings。Dangling/shape-invalid binding 不参与 mutation、不自动 fallback，并向 UI 投影明确 warning；workflow 仍按原 graph 执行。
- 点击 Send 时冻结 session-only `ComfyUiExecutionPlan`：deep-cloned graph、origin/timing snapshot、caller-known `promptId`、AssetRefs 与 validated bindings。Queue/executor 只消费 plan，dispatch 不重新读取 repositories。
- ComfyUI v1 使用 connection-scoped shared WebSocket 作为主执行状态通道：先连接并订阅 `promptId`，再上传素材与单次 `POST /prompt`；所有 task event 精确按 `prompt_id` 路由。
- WebSocket terminal hint 后 bounded 读取 `/history/{promptId}`，由 history 决定最终状态与 outputs。Socket 断线或 POST response 模糊时，最多一次 reconnect，随后使用 `/history + /queue` 做有限 reconciliation；绝不重新 POST。
- 所有外部 image/mask assets 统一通过 `/upload/image`。v1 不使用 `/upload/mask`、`original_ref` 或 alpha-patching transport。
- 有 explicit output binding 时严格收集指定 node；无 binding 时 best-effort 收集全部标准 `images[]`，至少一张成功即成功并保存 bounded skip counts。
- ComfyUI error 使用稳定 `code + stage + bounded cause`；所有 ComfyUI Task 都 `canRetry = false`。用户再次 Generate 创建新 Task、新 plan 与新 `promptId`。
- 两类 executor 在 normalized `GenerationResult` 后汇合，继续复用 AssetStore、Task/History、Preview、Download 与 Photoshop Placement。
- UXP/Chrome transport acceptance 正式覆盖 HTTP、WebSocket、origin/permission/CORS/mixed-content、multipart、Blob、timeout、close/reconnect 与大图传输。

## Capabilities

### New Capabilities

- `generation-backend-routing`: 定义 Execution Destination/Target、简单 `GenerationRoute`、send-time plan admission、route-derived lane、backend readiness、durable display snapshot 与 executor 汇合。
- `comfyui-connection-management`: 定义 origin-only singleton connection、`/system_stats` probe、shared realtime channel 与 UXP/Chrome HTTP/WebSocket acceptance。
- `comfyui-workflow-management`: 定义宽松 API Format import、独立持久化、executable binding adapters、replace/send validation、辅助 node-schema validation 与 Workflow projection。
- `comfyui-workflow-execution`: 定义完整 graph 单次提交、WebSocket-first lifecycle、HTTP reconciliation、`/upload/image`、history/output collection、download、normalization、no-retry、local cancel与 backend-specific progress语义。

### Modified Capabilities

- 无。当前 `openspec/specs/` 没有已同步 main specs；本 change 以新增 capability 记录 current-state 契约。

## Impact

- `packages/application`：拥有 `GenerationRoute`、repositories、`ComfyUiExecutionPlan` admission、executor router、session queue sidecar、AssetRef resolution、realtime composition 与 Task lifecycle。
- `packages/core-engine`：把 provider-named opaque dispatch seam 泛化为 backend-neutral execution seam；只负责 Job lifecycle、opaque params/result、logger 与 `AbortSignal`。
- 新建 `packages/execution-backends/comfyui`：拥有 parser、binding adapters、HTTP/WebSocket protocol client、event/queue/history/view parsers、normalization、fake server/channel 与 Case Bank；不进入 `packages/providers/src/families/comfyui`。
- `packages/providers`：只保留现有 model Provider contracts 与 `ProviderModelExecutor` 依赖，不承载 ComfyUI catalog/discovery/capability 假数据。
- `apps/app`：主界面使用 destination/target projections；ComfyUI 显示 Workflow、隐藏 model output controls，并展示 unused/ambiguous/invalid-binding feedback与 backend-specific progress。
- 持久化：workflow repository 保存 graph、executable bindings与 bounded diagnostics；queued plan和 ephemeral `clientId` 只在内存；Task/History 不保存 raw graph、origin、WS payload、full history、upload temp或 image bytes。
- 验证：default gate 使用 fake HTTP/WebSocket、fake repositories/clock与 app scenarios；真实 ComfyUI、Chrome与 Photoshop UXP transport是 early opt-in gate和 release evidence。
