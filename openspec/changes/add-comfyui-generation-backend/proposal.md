## Why

完成 `generalize-task-job-execution-architecture` 后，系统具备不修改 Job、Task 与 Session 公共 contract即可接入新 generation backend 的稳定扩展点。现在需要把 ComfyUI 作为一个完整 `GenerationBackend` 接入，并同时支持 API Graph submission 与 Frontend native Queue，而不是复制 Provider 或建立第二套 execution/history/asset 架构。

## What Changes

- 新增一个 Application-owned `ComfyUiGenerationBackend` 与一个 Core-facing `ComfyUiExecutionAdapter`；内部包含 `ApiGraphDriver` 和 `FrontendQueueDriver` 两种 submission driver。
- 新增 ComfyUI connection、health/readiness、workflow repository与target selection；API Format workflow 通过 bounded import管理，Frontend workflow通过compatible Bridge discovery引用remote identity。
- 只支持项目声明的 Binding/Type Contract 输入输出：prompt、ordered images 与 image outputs。mask vocabulary 先保留为预留语义；任何包含 mask entry 的 workflow 在本 Change 中必须返回 `not-ready/workflow`，不得进入 Task dispatch、live gate 或 UXP 验收。其他 Reroute、Primitive、Get/Set、subgraph和custom nodes保持opaque，不进入兼容范围。
- 复用现有 `HostImageAsset`、`ImageResource`、`StoredAssetRef`、`AssetStore`；send-time 只走 image 解析与 `/upload/image` 上传，mask 路径暂缓到后续 refactor。
- API Graph driver负责validated graph mutation、App-owned `/prompt`、realtime/history reconciliation；Frontend Queue driver负责open workflow、exact widget mutation与native Queue一次提交。
- 两个driver统一投影到CHANGE-01的Task/Job/GenerationBackend链，复用TaskOutput、History、Preview、Download与Photoshop Placement。
- 新增最小ComfyUI Bridge integration；page-side protocol不传raw image bytes、不返回compiled graph、不执行任意script。
- 使用owner-local AutoDL环境完成真实Chrome vertical proof，并完成Photoshop UXP manual smoke；credentials、endpoint values、workflow payload、generated images与raw logs不写入仓库。
- **BREAKING**：旧 `add-comfyui-execution-backend` artifacts不再作为实现authority；本Change从统一架构重新定义完整功能与验收门槛。

## Capabilities

### New Capabilities

- `comfyui-backend-management`: 定义connection、readiness、workflow repository、API Graph import、Frontend discovery与target selection。
- `comfyui-workflow-input-contract`: 定义Binding/Type Contract、prompt/image materialization、reserved mask vocabulary、upload barrier与exact widget values。
- `comfyui-dual-driver-execution`: 定义API Graph driver、Frontend Queue driver、at-most-once submission、receipt、progress与history reconciliation。
- `comfyui-result-host-integration`: 定义shared Task/Job result projection、output storage、History/Preview/Download/Photoshop Placement以及Chrome/UXP真实验收。

### Modified Capabilities

无。

## Impact

- 硬依赖 `generalize-task-job-execution-architecture` 完成；实现期间不得修改其 `Job`、`ExecutionAdapter`、`GenerationBackend`、Session queue或Task lifecycle contract。
- 新增独立ComfyUI execution backend package/integration；`packages/providers`及Provider behavior保持不变。
- `packages/application`只新增ComfyUI backend policy、connection/workflow repositories与request/result mapping。
- `apps/app`新增Chrome/UXP connection adapters、host asset resolution、target settings与shared UI wiring，继续使用现有resource/placement owners。
- ComfyUI server安装一个bounded Bridge integration，用于health/version evidence与Frontend native Queue；仅Binding/Type Contract节点与本项目直接相关。
