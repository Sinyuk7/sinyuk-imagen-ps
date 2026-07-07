## ADDED Requirements

### Requirement: Capture SHALL prioritize provider-input readiness over preview readiness
当用户执行 Photoshop `Capture` 时，系统 MUST 先完成正式 `provider-input` 资产准备与落盘，再异步派生 preview。`Capture` 主完成后，attachment SHALL 已具备可发送的 `providerInput.storedRef`，而 preview 可以仍处于 pending 或 failed 状态。

#### Scenario: Capture completes with sendable provider input before preview
- **WHEN** user triggers `Capture` for a Photoshop selection or layer
- **THEN** system SHALL create and store the formal `provider-input` asset during the `Capture` flow
- **AND** system SHALL allow `Send` to reuse that stored asset without waiting for preview readiness

#### Scenario: Preview failure does not block sendability
- **WHEN** formal `provider-input` asset is already ready and background preview derivation fails
- **THEN** attachment SHALL remain sendable
- **AND** system SHALL NOT invalidate or regenerate the formal `provider-input` asset only because preview failed

### Requirement: Preview SHALL be derived asynchronously as host-encoded JPEG
系统 SHALL 在正式 `provider-input` 资产 ready 后后台派生 preview thumbnail。preview MUST 使用 Photoshop host `imaging.getPixels(... applyAlpha: true)` 与 `imaging.encodeImageData(...)` 生成 `JPEG`，并 SHALL 视为纯视觉 best-effort 结果：不保留透明度、不保留选区形状、也不要求与正式发送图严格同帧。后台 preview 请求 MUST 固定 `Capture` 时记录的 `documentID`、`layerID / composite source`、`sourceBounds` 与 `targetSize`。

#### Scenario: Background preview uses host JPEG path
- **WHEN** system starts preview derivation after formal `provider-input` asset is ready
- **THEN** system SHALL request preview pixels from Photoshop with `componentSize: 8`, `colorSpace: "RGB"`, and `applyAlpha: true`
- **AND** system SHALL encode preview bytes through `imaging.encodeImageData(...)`
- **AND** system SHALL persist preview as `image/jpeg`

#### Scenario: Selection preview does not preserve selection mask shape
- **WHEN** captured source is a Photoshop selection
- **THEN** preview derivation SHALL NOT require `getSelection()` mask composition
- **AND** resulting preview SHALL be allowed to show rectangular crop content with white-matted transparency

#### Scenario: Preview uses capture-bound source identity
- **WHEN** background preview derivation starts after user has switched active document or active layer
- **THEN** system SHALL still read preview pixels from the `Capture`-bound `documentID` and `layerID / composite source`
- **AND** system SHALL NOT fall back to the current active document or active layer

#### Scenario: Missing original source keeps placeholder
- **WHEN** the `Capture`-bound `documentID` or `layerID` is no longer available during background preview derivation
- **THEN** system SHALL mark preview derivation as failed for that attachment
- **AND** system SHALL keep the existing placeholder instead of reading any substitute source

#### Scenario: Stale preview result is discarded
- **WHEN** a background preview finishes after its attachment was removed or replaced by a newer capture generation
- **THEN** system SHALL discard that preview result
- **AND** system SHALL NOT overwrite the current attachment state with stale preview bytes

### Requirement: Formal PNG encoding SHALL attempt thresholded candidate encoder with safe fallback
系统 SHALL 继续将正式 `provider-input` 资产统一编码为 `PNG`。编码时 MUST 按最终输出 `targetSize` 选择 encoder：当 `targetWidth * targetHeight * 4 <= 64 * 1024 * 1024` 时尝试 `@jsquash/png`；超过该阈值，或 `@jsquash/png` 的 `import`、initialize、encode 任一阶段失败时，MUST 回退现有自写 encoder + stored deflate。无论使用哪条编码路径，正式输出尺寸 MUST 严格匹配 `providerInputPlan.targetWidth` 与 `providerInputPlan.targetHeight`，且候选 encoder 失败不得让 `Capture` 失败。

#### Scenario: Threshold-sized output attempts candidate encoder
- **WHEN** formal `provider-input` output RGBA byte size is less than or equal to `64 MiB`
- **THEN** system SHALL attempt to encode the formal `PNG` with `@jsquash/png`

#### Scenario: Oversized output falls back to current encoder
- **WHEN** formal `provider-input` output RGBA byte size is greater than `64 MiB`
- **THEN** system SHALL use the existing self-managed `PNG` encoder with stored deflate

#### Scenario: Candidate encoder failure falls back safely
- **WHEN** formal `provider-input` output RGBA byte size is less than or equal to `64 MiB` and `@jsquash/png` fails during `import`, initialize, or encode
- **THEN** system SHALL fall back to the existing self-managed `PNG` encoder with stored deflate
- **AND** system SHALL still complete `Capture` successfully with a stored formal `PNG` asset

#### Scenario: Formal asset preserves planned output size
- **WHEN** system stores the formal `provider-input` asset for a completed `Capture`
- **THEN** stored `PNG` width SHALL equal `providerInputPlan.targetWidth`
- **AND** stored `PNG` height SHALL equal `providerInputPlan.targetHeight`

### Requirement: Capture pipeline SHALL emit structured timing observation
系统 SHALL 为正式 `provider-input` 与 preview 派生输出结构化 timing，至少覆盖 host 读取、数据变换、编码、落盘与 encoder 选择。该观测用于真实 UXP harness 比较，不要求在 CI 中设置固定性能阈值断言。

#### Scenario: Formal provider-input timing is emitted
- **WHEN** system completes formal `provider-input` preparation for a `Capture`
- **THEN** system SHALL emit timing fields for `providerInput.getPixelsMs`, `providerInput.getDataMs`, `providerInput.transformMs`, `providerInput.encodeMs`, and `providerInput.storeMs`
- **AND** system SHALL emit `providerInput.encoder`, `providerInput.rgbaBytes`, and `providerInput.pngBytes`

#### Scenario: Preview timing is emitted
- **WHEN** system completes or fails background preview derivation
- **THEN** system SHALL emit timing fields for `preview.getPixelsMs`, `preview.encodeMs`, and `capture.readyMs`
