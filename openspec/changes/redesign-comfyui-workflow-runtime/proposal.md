## Why

当前 ComfyUI 实现把多 connection profile、`ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、预声明 operation 与指定 output binding 作为 workflow 准入条件，导致普通 ComfyUI workflow 无法直接发现和运行。现有方案还把 workflow tree、Import、Form 保存和执行控制混在同一设置页面，并向用户暴露 Frontend/API Format 等内部实现差异。

需要把产品边界重新收紧：ComfyUI 负责创建、保存和管理 workflow JSON；插件只连接一个 server、选择一个当前 Workflow、配置必要的输入映射，并在首页高频运行完整 Workflow。Settings/ComfyUI TAB 是 Workflow Configuration Surface，不是第二个执行器或 workflow 文件管理器。

## What Changes

- **BREAKING**：以单例持久化 `baseUrl` 取代 ComfyUI connection/profile list、`connectionId` 关联、connection CRUD 与独立 connection editor。
- **BREAKING**：删除 `ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、`text-to-image`/`image-edit` 预声明、marker node 与指定 output node 对 workflow 发现和执行的强制要求。
- 首页继续承载高频执行，只运行当前选择的完整 Workflow；Settings 不提供 Run、Queue、AutoRun、batch、History 或第二套结果区。
- Settings/ComfyUI TAB 根页固定提供 Connection、current Workflow、conditional Input Mapping、`#`-exposed Workflow Parameters 与 error/developer Diagnostics。current Workflow 只提供 Change、Refresh、Open in ComfyUI。
- 根页不永久渲染 workflow tree。Change 进入 Picker 子页，展示 bounded remote identities、search、recent 与 grouped list；选择后返回根页。
- ComfyUI 负责 workflow JSON 的创建、保存与管理。V1 不提供 Import、Save、Reset、Advanced settings 或 workflow/Form persistence controls。
- 唯一持久化状态是 canonical `baseUrl`、`selectedWorkflowId`，以及按 workflow revision 隔离的显式 ambiguous input mappings。runtime caches、workflow documents、capabilities、metadata 与 diagnostics 不持久化；Form overrides 仅存于当前 session。
- Frontend Save Format 与 API Format detection 只服务内部 parser、driver 与 tests。UI 不显示 format/source label，也不让用户选择 submission driver。
- workflow discovery 只返回 bounded remote identities，不逐个加载或 contract-filter；选择或刷新 current Workflow 后才加载 runtime document、metadata 与可执行表示。
- output-node metadata 已知且证明没有 active output node 时 fast-fail 且零 submission；metadata 未知时不猜测、不拒绝，交给 native `/prompt` 或 native Queue 返回原生 validation error。
- Send 的唯一语义固定为运行当前完整 Workflow。Composer prompt 与 attachment 只在可安全映射时作为 optional overrides；无法确定且未显式映射时保留 workflow 原值，并用简短 notice 告知未使用输入。
- Dynamic Form 默认全部隐藏：只有 title 以 `#` 开头的 node 才可投影参数，title 以 `.` 开头始终隐藏。V1 只显示可证明安全的 supported primitive widgets；不提供 image、mask、video 或 complex editors。
- 没有 explicit output binding 时收集 `history.outputs[*].images[]` 的全部安全图片。remote execution 成功但没有图片时保存 `completed` + empty outputs，并在 UI 投影为 `completed-without-image-output`。
- mask-specific Photoshop materialization、mask binding 与 mask live/UXP validation 继续延后；workflow 包含 mask/custom nodes 本身不再成为拒绝条件。
- 新 Change 完成后，旧 `add-comfyui-generation-backend` 不再作为 ComfyUI 产品与实现 authority；其未完成的 manual UXP tasks 只作为历史事实参考。

## Capabilities

### New Capabilities

- `comfyui-workflow-runtime`：定义单例 server settings、内部 format detection、remote discovery、完整 graph submission、known/unknown output-node preflight、history image collection与 zero-image completion。
- `comfyui-workflow-form`：定义安全的 `#`-exposed parameter model、session-only overrides、revision-scoped ambiguous mappings 与 input-unused notices。
- `generation-workspace-view-model`：定义 Provider/ComfyUI mode selection、首页高频执行 projection、readiness、settings navigation 与 submit intent。
- `comfyui-settings-surface`：定义 ComfyUI Workflow Configuration Surface、current Workflow controls、Picker 子页、conditional mapping 与 scoped Diagnostics。

### Modified Capabilities

无。

## Impact

- `packages/execution-backends/comfyui`：替换 strict Imagen contract parser/mutation/output filter；新增内部 workflow parser/driver、safe parameter projection、known/unknown output preflight 与宽松 output collector。
- `packages/application/src/comfyui`：从多 connection/workflow contract repository 改为 singleton server、current Workflow session、revision-scoped mapping state 与 non-persistent runtime cache。
- `apps/app`：重构 `AppShell`、`MainPage`、`SettingsPage`、ComfyUI hooks/adapters/persistence、Picker navigation、configuration sections、Diagnostics 与 History zero-image projection。
- `integrations/comfyui-imagen-bridge`：移除 contract-node/schema-digest authority，改为 bounded remote identity list/open/form mutation/native Queue bridge；保持 fixed command allowlist、identity、limits 与 one-shot submission safety。
- Provider transport、Provider profiles/models、shared AssetStore、Task/Job/Session kernel、History resource actions 与 Photoshop Placement owners 继续保持独立；只通过 Generation Workspace ViewModel 组合。

## Migration

- current-state cutover 直接删除旧 connection/profile、contract 与 imported workflow persistence；无生产数据或 legacy schema 兼容要求。
- 旧状态只迁移可规范化的最后 server address 与仍能解析的 current remote workflow identity；无法证明 revision 的旧 mappings/Form values 不迁移。
- 新 persistence schema 只允许 `baseUrl`、`selectedWorkflowId` 与 revision-scoped explicit ambiguous mappings；启动时忽略并清理其它 legacy ComfyUI persisted fields。
- Provider 数据、shared Task history 与 AssetStore 不参与迁移。

## Risks

- Remote workflow 数量大时 Picker discovery 或 search 可能变慢。以 bounded identities、分组、client-side search 与 scoped loading/error 控制成本，不在根页常驻完整 tree。
- workflow revision 改变后旧 mapping 可能指向错误 input。mapping key 必须包含 revision；revision 不匹配即失效，不猜 replacement。
- output metadata 暂不可用时无法本地证明 `prompt_no_outputs`。unknown 明确延迟到 native validation，并保留原生错误与零 replay 语义。
- `#` node 下仍可能包含 custom/unsafe widgets。renderer 只允许明确支持的 primitive editors；其余值只读保留且不阻塞 execution。
- session-only Form overrides 在 reload 后丢失。这是 V1 明确取舍；ComfyUI 继续作为 workflow 默认值的保存 authority。
