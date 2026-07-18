## Why

当前 `core-engine` 的 `Job` 已是 host-neutral execution record，但 Workflow、Dispatcher 与 Application Session 仍以 `provider` / `profileId` 为中心，导致新增 backend 时只能复制或绕过现有 Job、Task 与 queue 链路。需要先把现有 Provider 执行路径重构为真正 backend-neutral 的公共结构，并以严格行为等价门槛保护全部现有功能。

## What Changes

- **BREAKING**：把 `core-engine` 的 `ProviderRef`、`ProviderDispatchAdapter`、`ProviderDispatcher` 与 `provider` Workflow step 收敛为 backend-neutral `ExecutionRef`、`ExecutionAdapter`、`ExecutionDispatcher` 与 `execution` step。
- 在 `packages/application` 建立统一 `GenerationBackend` admission/projector seam，使 Session 只编排 frozen submission、lane、readiness、Task/Job correlation 与 terminal projection，不解释具体 backend。
- 将用户可见、durable 的 `TaskRecord` ownership 从 execution kernel 收敛到 Application；Task 不解释底层 backend，Job 仍表示一次执行尝试。
- 保留 Provider 自身的 config/request/transport/result contracts，通过薄 bridge 适配到通用 `ExecutionAdapter`。
- 保持现有 Provider generate/edit、profile/model resolution、asset materialization、queue、retry、billing、History、Preview、Download 与 Photoshop Placement 行为不变。
- 明确 CHANGE-01 不添加 ComfyUI、Frontend Canvas、Bridge、workflow repository 或新的 user-facing capability。

## Capabilities

### New Capabilities

- `backend-neutral-job-execution`: 定义 backend-neutral Job、Workflow execution step、dispatcher、adapter、context 与 opaque input/output contract。
- `application-task-orchestration`: 定义 Application-owned Task、queued submission、Task/Job correlation、backend admission、lane/readiness 与 terminal projection contract。
- `provider-execution-parity`: 定义 Provider 通过通用 execution seam 执行后的严格行为等价要求与回归门槛。

### Modified Capabilities

无。

## Impact

- 主要影响 `packages/core-engine`、`packages/application` 与 `packages/providers` 的 bridge/composition boundary。
- `apps/app` 仅调整类型导入和 composition wiring；不得改变 UI、UXP/Chrome host IO 或用户流程。
- 现有 Provider implementations、request builders、response parsers、registry、catalog 与 transport policy 不重写。
- CHANGE-01 完成后，后续 execution backend 必须只实现既定 extension seams；若仍需修改通用 Job、Task、Session 或 Dispatcher contract，则本 Change 未完成。
