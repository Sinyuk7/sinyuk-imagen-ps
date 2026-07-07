## ADDED Requirements

### Requirement: Shared provider input planner SHALL enforce hard-ceiling fit-inside geometry
系统 SHALL 将共享 provider input planner 定义为 `no-upscale`、整数 `fit-inside`、hard `maxSide` ceiling 的几何 contract。planner 返回的 `targetWidth` 与 `targetHeight` MUST 是正整数，MUST 不大于 `maxSide`，且 MUST 不大于 source 对应维度。

#### Scenario: Small source stays passthrough
- **WHEN** source size is `64x64` and `maxSide` is `2048`
- **THEN** planner SHALL return `kind: "passthrough"`
- **AND** planner SHALL return `targetSize: 64x64`

#### Scenario: Large wide source is resized inside the ceiling
- **WHEN** source size is `10000x6000` and `maxSide` is `2048`
- **THEN** planner SHALL return `kind: "resize"`
- **AND** planner SHALL return `targetSize: 2048x1229`

#### Scenario: Large coprime source is resized instead of passed through
- **WHEN** source size is `4096x4095` and `maxSide` is `2048`
- **THEN** planner SHALL return `kind: "resize"`
- **AND** planner SHALL return `targetSize: 2048x2048`

#### Scenario: Quantized portrait source remains inside the ceiling
- **WHEN** source size is `4096x1537` and `maxSide` is `2048`
- **THEN** planner SHALL return `targetSize: 2048x769`
- **AND** planner SHALL NOT exceed `2048` on either side

### Requirement: Planner quantization metadata SHALL be provenance only
系统 MAY 记录 planner 量化产生的 `aspectRatioError` 作为日志、调试与 regression 分析字段，但该字段 MUST NOT 被任何消费方解释为 provider 输出 tolerance budget。进入 provider 输出阶段后，消费方 SHALL 以 `targetSize`、`expectedOutputSize`、`allowedOutputSizes` 等确定 geometry 事实为准。

#### Scenario: Planner returns quantization provenance
- **WHEN** planner rounds a non-integer short side to the nearest integer target
- **THEN** planner SHALL expose `aspectRatioError` as provenance metadata
- **AND** planner SHALL still expose `targetSize` as the only geometry source of truth

#### Scenario: Output validation ignores planner error as budget
- **WHEN** downstream placement or output validation checks provider output geometry
- **THEN** system SHALL compare against contract-defined output geometry facts
- **AND** system SHALL NOT enlarge acceptance bounds by adding planner `aspectRatioError`

### Requirement: Photoshop host SHALL verify actual dimensions after `targetSize` requests
当 Photoshop host 通过 `imaging.getPixels()`、`imaging.getSelection()` 等 API 请求 planner 产出的 `targetSize` 时，系统 SHALL 信任官方 `targetSize` contract，并在宿主边界后验证实际返回尺寸。该验证 MUST 是 fail-closed 保险，不得表述成已知 host bug workaround。

#### Scenario: Capture image and selection use the same target geometry
- **WHEN** a Photoshop capture includes both image pixels and selection mask pixels
- **THEN** system SHALL request the same `targetSize` for image and selection reads
- **AND** system SHALL keep both results on the same pixel grid before alpha composition

#### Scenario: Host returns requested target size
- **WHEN** Photoshop returns image data whose width and height match the requested `targetSize`
- **THEN** system SHALL continue provider-input encoding and storage

#### Scenario: Host returns unexpected target size
- **WHEN** Photoshop returns image data whose width or height differs from the requested `targetSize`
- **THEN** system SHALL fail closed before provider-input encoding or storage
- **AND** system SHALL record requested and actual dimensions for diagnostics

### Requirement: Local file normalization SHALL be decided from source geometry policy
对于 local file 输入，系统 SHALL 先判断 source dimensions 是否满足 provider input geometry policy，再决定 passthrough、normalize 或 reject；系统 MUST NOT 依赖旧 planner 派生布尔字段作为 source policy 真值。

#### Scenario: Source already satisfies policy
- **WHEN** a local file source is already within `maxSide` and requires no upscale
- **THEN** system SHALL accept passthrough using the original dimensions

#### Scenario: Source exceeds policy and runtime can normalize
- **WHEN** a local file source exceeds the geometry policy and the runtime has a verified normalization path
- **THEN** system SHALL resize the source to planner `targetSize` before storing provider input

#### Scenario: Source exceeds policy and runtime cannot normalize
- **WHEN** a local file source exceeds the geometry policy and the runtime lacks a verified normalization path
- **THEN** system SHALL reject the input instead of passing the source through unchanged
