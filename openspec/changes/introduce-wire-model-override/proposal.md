## Why

当前 `UserModelConfig.modelId` 同时承担 config identity、profile 选择 identity 与上游请求 `model` wire 值三种语义，导致用户在配置官方 preset 能力子集时，修改一个看似普通的字段就会改变真实执行链路。随着 `gpt-image-2-vip`、`gpt-image-2-svip`、`gemini-3.1-vip`、`nano-banana-2-4k-cl` 这类中转站或 relay 私有 wire model 名出现频率上升，继续把 provider 私有路由名写进全局 catalog `aliases/prefixes/patterns` 会放大全局规则维护成本，并错误地把 profile-local 路由事实建模成 repo 级模型事实。

## What Changes

- 为持久化 model config 引入 `wireModelId`，将“能力模板锚点”与“真实上游请求 model”分离。
- 保持 `baseModelId` 继续作为官方 preset 与能力矩阵锚点，不允许改成 provider 私有 wire 名。
- 保持 `modelId` 作为稳定 config identity，不再承担常规 wire route 语义。
- 修改 runtime 解析流程：`baseModelId` 决定能力上限、输出矩阵与 `requestStrategyId` 合法性，`wireModelId` 仅决定最终请求 payload 中的 `model`。
- 将 `resolveImageModelRule()` / `resolveProviderResolvedOutput()` 改为显式接收 capability model 参数，避免再次误传 wire model。
- 调整 model config UI：将“请求模型 ID”作为低频高级选项放入 `Advanced settings`，默认折叠，并在列表轻量展示当前实际请求 model。
- 保持 generation preference key 与 profile `selectedModelIds/defaultModelId` 继续绑定稳定 config identity，避免 override 造成 preference 与选择状态漂移。
- **BREAKING**：不兼容旧 `UserModelConfig` 持久化数据。缺少 `wireModelId` 的旧 config 一律视为非法数据并丢弃。

## Capabilities

### New Capabilities
- `wire-model-override`: 允许用户在不改变官方 preset 能力模板的前提下，为单个 model config 提供独立的上游 wire model selector。

### Modified Capabilities

## Impact

- Affected code: `packages/application/src/commands/model-configs.ts`, `packages/application/src/commands/model-config-resolution.ts`, `packages/application/src/runtime.ts`, `packages/providers/src/contract/request.ts`, `packages/providers/src/transport/*/build-request.ts`, `apps/app/src/shared/ui/pages/model-configuration-page.tsx`
- Affected storage: `UserModelConfig` schema in UXP JSON storage, Chrome IndexedDB storage, in-memory repositories, test fakes
- Affected contract APIs: `resolveImageModelRule()`, `resolveProviderResolvedOutput()`, `ResolvedModelConfig`
- Affected UI: model config 列表与编辑页、profile model 选择展示、advanced settings 文案与默认交互、dispatch 日志展示
- Affected tests: application command tests、storage schema tests、UI page tests、profile selection tests、generation preference tests
