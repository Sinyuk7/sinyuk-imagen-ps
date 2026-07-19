## Why

当前 ComfyUI 实现把多 connection profile、`ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、预声明 operation 与指定 output binding 作为 workflow 准入条件，导致普通 ComfyUI workflow 无法直接发现和运行，也让设置页与 Composer 承担了过多配置状态。现在需要回到 ComfyUI 的原生语义：一个 server 入口、运行当前完整 workflow、能够明确绑定时才覆盖输入，其余值保持 workflow 原样。

## What Changes

- **BREAKING**：以单例 `baseUrl` server settings 取代 ComfyUI connection/profile list、`connectionId` 关联、connection CRUD 与独立 connection editor；ComfyUI 只有一个设置入口。
- **BREAKING**：删除 `ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、`text-to-image`/`image-edit` 预声明、marker node 与指定 output node 对 workflow 导入和执行的强制要求。
- 自动识别具体 workflow JSON 为 ComfyUI Frontend Save Format 或 API Format；server address 只负责 URL normalization 与 API/Frontend/Bridge capability detection，不把 URL 误判为 workflow format。
- workflow discovery 先返回完整 bounded identity list，不逐个加载或 contract-filter；选择 workflow 后才加载、解析、构建 form 并检查至少一个 ComfyUI `OUTPUT_NODE = True`。
- Send 的唯一语义固定为“运行当前选择的完整 workflow”；prompt 与 attachments 只是 optional overrides，缺少或未选择 binding 不阻塞 Send。
- 首页始终显示 Workflow、Text binding 与 Image binding selectors。没有 binding 时保留 workflow 原值；用户输入未被使用时只显示简短提示，不建立复杂禁用态。
- 引入 format-neutral Workflow Form，按 monorepo 参考行为动态渲染 supported widgets；`#` 强制显示、`.` 强制隐藏，但不复制任何 `sdppp_*` property、identifier 或 namespace。
- 引入统一 Provider/ComfyUI Generation Workspace ViewModel，集中派生 header、Composer controls、readiness、settings route 与 submit intent，避免 `MainPage`/`AppShell` 散布 backend 条件分支。
- ComfyUI TAB 只显示 `baseUrl`、connection status、collapsed advanced settings、workflow tree/import 与 selected workflow dynamic widgets；不显示 Provider profiles、Global Generation、Prompt Settings 或多 connection 内容。
- 没有 explicit output binding 时收集 `history.outputs[*].images[]` 的全部安全图片。remote execution 成功但没有图片时保存 `completed` + empty outputs，并在 UI 投影为 `completed-without-image-output`。
- mask-specific Photoshop materialization、mask binding 与 mask live/UXP validation 继续延后；workflow 包含 mask/custom nodes 本身不再成为拒绝条件。
- 新 Change 完成后，旧 `add-comfyui-generation-backend` 不再作为 ComfyUI 产品与实现 authority；其未完成的 manual UXP tasks 不得作为本 Change 的实现证据或验收标准，只作为历史事实参考。

## Capabilities

### New Capabilities

- `comfyui-workflow-runtime`: 定义单例 server settings、workflow format detection、discovery/admission、完整 graph submission、output-node preflight、history image collection 与 zero-image completion。
- `comfyui-workflow-form`: 定义 format-neutral widget model、converter registry、`#`/`.` visibility、value overrides、Text/Image bindings 与 input-unused notices。
- `generation-workspace-view-model`: 定义 Provider/ComfyUI mode selection、shared Composer projection、backend-specific controls、settings navigation、readiness 与 submit intent。
- `comfyui-settings-surface`: 定义 ComfyUI-exclusive settings TAB、address/advanced/workflow hierarchy、workflow list/detail interaction与 UI states。

### Modified Capabilities

无。

## Impact

- `packages/execution-backends/comfyui`：替换 strict Imagen contract parser/mutation/output filter，新增 workflow format/form/runtime metadata 与宽松 output collector。
- `packages/application/src/comfyui`：从多 connection/workflow contract repository 改为 singleton server、workflow presentation state、optional bindings 与 workflow-native admission。
- `apps/app`：重构 `AppShell`、`MainPage`、`SettingsPage`、ComfyUI hooks/adapters/persistence、Composer selectors、readiness notices 与 History zero-image projection。
- `integrations/comfyui-imagen-bridge`：移除 contract-node/schema-digest authority，改为 bounded Frontend workflow list/open/form/mutation/native Queue bridge；保持 fixed command allowlist、identity、limits 与 one-shot submission safety。
- Provider transport、Provider profiles/models、shared AssetStore、Task/Job/Session kernel、History resource actions与 Photoshop Placement owners继续保持独立；只通过 Generation Workspace ViewModel 组合。
