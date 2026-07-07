## Why

当前 `resolveProviderInputPlan()` 仍把“整数尺寸下保持 exact ratio”当成共享 contract，导致 `providerInputMaxSide` 不能作为 hard ceiling 生效：轻则出现 `2050x1230` 这类超限 target，重则在 large coprime dimensions 下直接保留原尺寸，生成超大 stored-deflate `PNG`。同时，`exact-frame` placement 仍把 planner 整数量化误差与 provider 输出几何失配混为一个固定 ratio guard，导致已知且可解释的量化结果也可能被误判。

现在需要把 provider input geometry 与 placement geometry 的职责拆清。共享 planner 只负责 `no-upscale`、`fit-inside` 与整数 `targetSize`；provider 输出阶段只根据 request contract 产生的 `expectedOutputSize` / `allowedOutputSizes` 做离散匹配；Photoshop host 边界只做 fail-closed 验证保险，不再把验证表述成已知 host bug workaround。

## What Changes

- **BREAKING** 将共享 `resolveProviderInputPlan()` 从“exact-ratio candidate search”改为标准 `fit-inside` hard ceiling：`targetWidth`、`targetHeight` 永远不得突破 `maxSide`，且默认 `no-upscale`。
- **BREAKING** 删除共享 planner 对 `multiple`、`maxSideBucket`、`preferredMultiple`、`effectiveMultiple`、`wasUpscaled`、`wasDownscaled` 与单一 `scale` 的 contract 依赖；planner 仅返回 `sourceSize`、`targetSize`、`kind` 与 provenance-only `aspectRatioError`。
- 在 Photoshop `getPixels()` / `getSelection()` 使用 planner 产出的精确 `targetSize`，并在宿主边界后验证实际返回尺寸；该验证是 fail-closed 保险，不是已知 host bug workaround。
- **BREAKING** 将 `exact-frame` placement 从“要求输出与 source frame exact ratio 匹配”改为“信任 planner 量化结果，不给 provider 额外 tolerance budget；优先按 `expectedOutputSize` 精确比对，其次按 `allowedOutputSizes` / geometry identity 做离散匹配；未知输出几何或集合外返回一律降级 `document-only`”。
- 调整 local file 与 capture/layer 消费路径：是否允许 passthrough 由 source geometry 是否满足 policy 决定，而不是依赖旧 planner 的派生布尔字段。
- 补齐 regression tests、placement tests 与 host boundary assertions，覆盖 `64x64 -> 64x64`、`10000x6000 -> 2048x1229`、`4096x4095 -> 2048x2048`、以及 provider 输出集合外返回触发 `document-only` 的行为。

## Capabilities

### New Capabilities
- `provider-input-geometry-policy`: 定义共享 provider input planner 的 hard ceiling、`no-upscale`、整数 `fit-inside`、Photoshop host target-size 验证，以及 local file / capture / layer 的统一几何约束。
- `provider-output-placement-geometry`: 定义 `exact-frame` 与 `document-only` 的输出几何判定，明确 planner 量化误差仅作 provenance，不形成 provider 输出 tolerance budget。

### Modified Capabilities

## Impact

- Affected code:
  - `apps/app/src/shared/image/resize.ts`
  - `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
  - `apps/app/src/adapters/chrome/chrome-host-port.ts`
  - `apps/app/src/shared/domain/photoshop-placement.ts`
  - `packages/providers/src/transport/chat-image/parse-response.ts`
- Affected tests:
  - `apps/app/tests/shared/image.contract.test.ts`
  - `apps/app/tests/adapters/uxp/photoshop-host-bridge.read.contract.test.ts`
  - `apps/app/tests/adapters/uxp/provider-input-placement.contract.test.ts`
  - `apps/app/tests/adapters/uxp/photoshop-host-bridge.write.contract.test.ts`
- Systems:
  - Photoshop UXP Imaging API
  - shared provider input normalization
  - provider output geometry validation
  - placement fallback semantics
