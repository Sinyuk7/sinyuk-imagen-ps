## Why

当前 Mask 链路只为 Photoshop selection 产生了部分 canonical 数据，真实 user layer mask 仍在 UXP 读取后被丢弃，Primary Attachment 变化、durable retry 与 Provider/ComfyUI dispatch 也没有统一契约。现在需要把 Mask 收敛为 Primary Image 的隐藏 Edit Region，使上层保持单一数据流，同时让 UI 只在目标执行后端支持时开放 Mask，并让不支持的后端安全省略 Mask。

## What Changes

- 引入 Primary Image 绑定的 Edit Region；Mask 不作为普通 attachment 展示、不占 attachment 数量，也不允许独立上传。
- 统一 Photoshop selection 与 user layer mask 的读取结果：image 与 mask 必须共享同一 `sourceBounds`、`targetSize` 和 provider-input 坐标空间，并归一化为 `white = edit` 的 8-bit grayscale canonical mask。
- 增加 Primary 生命周期协调：仅 Primary 的创建、删除、重排、替换或 geometry 更新触发 Mask reconcile；旧 Mask 立即失效，新 Primary 符合条件时异步重建。
- 明确 Mask 状态与提交行为：`disabled`、`loading`、`ready`、`none`、`error` 分离；Photoshop Primary 的 `loading` 或 `error` 不得静默退化为无 Mask 提交，普通上传图不读取 Mask。
- 将 Edit Region 的 immutable snapshot 与 opaque asset reference 纳入 Task/History，使 retry 复用原始 Mask 而不重新读取当前 Photoshop 文档。
- 增加执行能力规划：OpenAI image endpoint 使用原生 raster Mask；Gemini generate-content 与无 Mask binding 的 ComfyUI Workflow 在 UI 禁用 Mask；ComfyUI 仅在 Workflow 显式声明 Mask binding 时注入。
- 将 Provider wire 形式与 UXP acquisition 解耦；公共层保持 canonical Mask，Provider/Workflow Adapter 负责 polarity、format 和 node/input mapping。
- 保留 Photoshop result-layer post-composite 为独立后续能力；本次变更不把结果回写 Mask 混入核心 acquisition/dispatch 链。

## Capabilities

### New Capabilities

- `photoshop-mask-edit-region`: 定义 Primary Image、Edit Region、Photoshop selection/user layer mask 同帧读取、canonical geometry、生命周期状态、失效重建和 durable snapshot。
- `mask-execution-routing`: 定义 canonical Edit Region 到 Provider/ComfyUI 的 capability resolution、UI availability、wire/workflow 转换和 unsupported no-Mask fallback。

### Modified Capabilities

无。

## Impact

- `apps/app`: Composer draft/ViewModel、Mask coordinator、Photoshop UXP/Chrome simulator HostPort、ImageResource/attachment/task snapshot、UI 状态与 harness。
- `packages/application`: admitted request、Task/History snapshot、retry reconstruction、ComfyUI generation payload。
- `packages/providers`: image edit capability model、OpenAI mask conversion/transport、Gemini/chat-image no-Mask fallback contract。
- `packages/execution-backends/comfyui` 与 `integrations/comfyui-imagen-bridge`: Workflow-declared Mask binding、upload barrier、mutation/input mapping。
- 验证：mock-only contract suites 为默认门禁；真实 Photoshop UXP Mask 读取和真实后端行为保留为独立 manual/live proof。
