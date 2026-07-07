## Why

当前 `Capture` 会在单次点击内同步完成 preview 生成、provider-input PNG 编码与 asset store 落盘。大选区或大图层下，用户会先等待 Photoshop host modal 完成 preview 读取，再等待正式发送资产完成，导致 `Capture` 体感过慢，且 preview 额外占用一次 host 读取与一次 JS 编码成本。

当前正式发送图统一走自写 PNG 编码路径，策略稳定但实现埋在 Photoshop host bridge 内部；同时 preview 并不需要透明度或严格同帧保证，存在与正式发送图分离处理的空间。

## What Changes

- 将 Photoshop `Capture` 调整为“正式发送图优先”流程：点击后先进入后台任务态并显示占位 preview，不再同步阻塞等待 preview 真图完成。
- 保持正式发送图继续统一输出 `PNG`，并在 `Capture` 完成时落盘，使 `Send` 继续直接复用已准备好的 `provider-input` 资产。
- 为 preview 引入独立后台派生流程：正式发送图 ready 后，再异步生成 JPEG thumbnail。preview 明确不保留透明度，不要求与正式发送图严格同帧，但必须固定 `Capture` 时的 source identity，不能退回读取当前 active document / active layer。
- preview JPEG 路径改为优先使用 Photoshop host `imaging.getPixels(... applyAlpha: true)` 与 `imaging.encodeImageData(...)`，绕过 `imageData.getData() -> JS RGBA -> JS PNG encode`。
- 将正式发送图的 `PNG` 编码固化为 UXP-safe stored-deflate 路径，并抽出到 `apps/app/src/adapters/uxp/png-encoder.ts`，避免依赖真实 UXP 缺失的 browser `ImageData` / WASM encoder contract。
- 补齐 contract tests、production UXP smoke 与结构化 timing 观测，覆盖 `Capture`/`Send` 资源复用、preview 异步派生、preview JPEG 路径、正式 `PNG` 编码路径、落盘尺寸约束，以及 `encode + assetStore.put` 的真实耗时与输出大小比较。

## Capabilities

### New Capabilities
- `photoshop-capture-derivatives`: 定义 Photoshop `Capture` 如何生成正式 `provider-input` 资产、后台 preview thumbnail、UXP-safe `PNG` encoder，以及资源复用与观测契约。

### Modified Capabilities

## Impact

- Affected code:
  - `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
  - `apps/app/src/shared/domain/image-resource.ts`
  - `apps/app/src/shared/ui/pages/main-page.tsx`
  - `apps/app/src/shared/ui/hooks/use-conversation.ts`
  - `apps/app/src/shared/image/thumbnail-store.ts`
- Affected tests:
  - `apps/app/tests/adapters/uxp/photoshop-host-bridge.read.contract.test.ts`
  - `apps/app/tests/adapters/uxp/provider-input-placement.contract.test.ts`
  - related UXP host harness tests for capture / preview / asset store reuse
  - real production UXP smoke for capture, preview, and provider-input reuse
- Dependencies:
  - no new runtime dependency for PNG encoding
- Systems:
  - Photoshop UXP Imaging API
  - UXP asset store / thumbnail pipeline
  - conversation attachment send path
