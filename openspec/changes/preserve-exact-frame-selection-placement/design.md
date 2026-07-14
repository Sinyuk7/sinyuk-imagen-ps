## Context

当前 `apps/app/AGENTS.md` 定义的 Photoshop Placement Contract 已经要求 `exact-frame` 放回 captured document 并 transform 到 captured rectangle，且目标文档无法 strong verify 时才拒绝。实际代码路径中，`placeAssetOnCanvas()` 会先读取生成图片尺寸，再调用 `placementIntentForActualOutput()`；该函数会在输出尺寸缺失、尺寸不匹配、或 provider-default 无法证明比例身份时，把 `exact-frame` 降级为 `document-only`。

这导致来自 selection/layer capture 的结果虽然持有 `placementRect`，但置入阶段不会执行 `transformActivePlacedLayer()`，用户看到的是普通 document placement，而不是回到选区框。23:53 incident 的日志表现为 request placement 是 `exact-frame`，实际 `hostbridge.place_asset.ok` 记录 `placement:"document-only"`、`requestedPlacement:"exact-frame"`，且没有 after-translate telemetry。

## Goals / Non-Goals

**Goals:**

- 让 selection/layer capture 产生的有效 `placementRect` 成为 `exact-frame` transform 的 authority。
- 将 provider 实际输出尺寸、请求输出尺寸、ratio-resolution identity 只用于 diagnostics 或 provider contract validation，不用于取消 frame placement。
- 保留目标文档 strong verification、安全拒绝、active-document fallback guard、unbound placement normalization 等现有 host safety boundary。
- 用 fake UXP host bridge contract tests 覆盖不同比例/尺寸输出下仍然 scale/translate 到 captured rectangle。
- 用 domain contract tests 覆盖 `placementIntentForActualOutput()` 或其替代 API 不再把有效 `exact-frame` 因输出尺寸不可验证而降级。

**Non-Goals:**

- 不修改 provider request builder、`wireImageConfigSize`、`wireImageConfigAspectRatio`、或 model output settings persistence。
- 不修复 task history 中 `running` 未闭环、`executionJobId` 缺失、或 queue scheduler lifecycle。
- 不引入自动 Photoshop writeback；结果仍由用户点击 place。
- 不改变 `document-only`、`unbound`、multiple-documents ambiguity 的产品语义。
- 不依赖真实 Photoshop smoke 作为默认验证门；真实 UXP proof 仍是 manual-only gate。

## Decisions

### 1. Treat `placementRect` as the exact-frame authority

`exact-frame` intent already contains the captured document evidence and `placementRect`。只要目标文档解析为 strong source-document match，host bridge SHALL place the asset and transform the active placed layer to that rect。实际图片像素尺寸只影响 scale factor，不影响是否需要 transform。

Alternative: keep downgrading when output size mismatches expected request size. This preserves current test behavior but violates user intent: the user selected a canvas frame, not an intrinsic pixel-size contract.

### 2. Move output-size mismatch out of placement intent resolution

`placementIntentForActualOutput()` currently mixes two concerns:

- target placement authority
- provider output conformance

Implementation should either simplify this function so valid `exact-frame` returns unchanged, or replace it with a helper that returns diagnostics while preserving placement intent. If mismatch telemetry is kept, it should be emitted as separate attrs such as requested/actual output geometry mismatch, not by changing `placement` to `document-only`。

Alternative: preserve downgrade and add a manual override. That creates hidden behavior differences in the place action and still leaves selection placement surprising by default.

### 3. Keep document safety checks as the only downgrade/reject boundary for anchored placement

Frame placement must still go through `targetDocumentForPlacement()` / `resolvePlacementTarget()`。If the original document is missing, ambiguous, weak-only where host bridge requires strong, size-drifted, or active-document fallback was used, the host bridge must not blindly apply stale frame coordinates.

For this change, output geometry must not convert `exact-frame` to `document-only`; document confidence remains the safety boundary.

Alternative: allow active-document fallback and still transform. That is unsafe because the frame coordinates belong to another document identity.

### 4. Tests should encode user-visible placement, not implementation suspicion

Existing tests that expect "unverifiable exact-frame output downgrades to document-only" should be replaced with tests that assert transform occurs for:

- `exact-frame` without output selection / unknown expected size
- provider-default output returning `1024x1024`
- ratio-resolution `2k + 1:1` returning `2048x2048`
- explicit pixel request returning a mismatched actual size

The durable behavior under test is: `scalePlacedLayer()` and `translatePlacedLayer()` are called to match the captured rect, and success telemetry reports `placement:"exact-frame"` with `placementTargetRect` / `placedLayerBoundsAfterTranslate`。

## Risks / Trade-offs

- [Risk] A provider may return content with an unexpected aspect ratio, causing visible stretch inside the selected frame. → Mitigation: this is the correct interpretation for explicit frame placement; log mismatch diagnostics so provider/output-setting issues remain debuggable.
- [Risk] Existing contract tests currently encode the downgrade policy. → Mitigation: update the tests in the same slice and make the new assertions target user-visible transform behavior.
- [Risk] Weak reopened-document matching could apply coordinates to a document that merely resembles the original. → Mitigation: keep host bridge's current strong verification requirement for anchored writeback.
- [Risk] Real Photoshop transform behavior can differ from fake host geometry. → Mitigation: default gate remains fake UXP contract tests plus targeted domain tests; manual UXP smoke can be recorded separately after implementation.
