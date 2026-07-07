## ADDED Requirements

### Requirement: Planner quantization SHALL NOT create placement tolerance budget
系统 SHALL 将 planner 量化误差视为已知 provenance，而不是 provider 输出阶段可消费的 tolerance budget。`exact-frame` 判定时，planner 已经通过 `targetSize` 固化了可接受的 input geometry；后续 placement 只验证 provider output 是否满足 request/output contract 产生的离散 geometry 事实。

#### Scenario: Quantized planner result remains exact-frame when provider output matches it
- **WHEN** source frame `4096x1537` is quantized by planner to `2048x769`
- **AND** provider output size is exactly `2048x769`
- **THEN** system SHALL keep `exact-frame`
- **AND** system SHALL NOT downgrade only because planner `aspectRatioError` is non-zero

#### Scenario: Planner provenance is not reused as output allowance
- **WHEN** system validates provider output geometry for placement
- **THEN** system SHALL NOT add planner `aspectRatioError` to any provider-side acceptance budget

### Requirement: `exact-frame` SHALL require exact `expectedOutputSize` when known
当 request contract 能产生唯一 `expectedOutputSize` 时，系统 SHALL 将该尺寸视为 placement 几何真值。`actualOutputSize` 必须精确匹配；否则系统 MUST 降级为 `document-only`。

#### Scenario: Expected output size matches exactly
- **WHEN** request contract declares `expectedOutputSize: 2048x1229`
- **AND** provider output size is `2048x1229`
- **THEN** system SHALL keep `exact-frame`

#### Scenario: Expected output size does not match
- **WHEN** request contract declares `expectedOutputSize: 2048x1229`
- **AND** provider output size is `2048x1230`
- **THEN** system SHALL downgrade placement to `document-only`

### Requirement: `exact-frame` SHALL use discrete allowed output geometry when exact size is not unique
当 request contract 不能给出唯一 `expectedOutputSize`，但能给出 `allowedOutputSizes` 或离散 geometry identity 时，系统 SHALL 只接受属于允许集合且与当前请求语义 identity 一致的 provider 输出；否则系统 MUST 降级为 `document-only`。

#### Scenario: Allowed output member with matching semantic identity
- **WHEN** request contract allows a discrete output set for the current requested geometry identity
- **AND** provider output size is a member of that allowed set
- **AND** the returned output still matches the requested semantic identity
- **THEN** system SHALL keep `exact-frame`

#### Scenario: Output falls outside the allowed set
- **WHEN** request contract provides `allowedOutputSizes`
- **AND** provider output size is not a member of that set
- **THEN** system SHALL downgrade placement to `document-only`

#### Scenario: Output conflicts with requested semantic identity
- **WHEN** request contract expects one geometry identity
- **AND** provider returns output that maps to a different geometry identity
- **THEN** system SHALL downgrade placement to `document-only`

### Requirement: Unknown or unverifiable output geometry SHALL fall back to `document-only`
当系统无法从 request contract 或 provider contract 推导可验证的 output geometry，或返回结果无法映射到允许集合时，系统 SHALL 采取保守策略并降级 `document-only`。

#### Scenario: Output geometry contract is unknown
- **WHEN** provider output arrives without `expectedOutputSize` and without a verifiable discrete allowed set
- **THEN** system SHALL downgrade placement to `document-only`

#### Scenario: Output geometry facts cannot be verified
- **WHEN** provider output geometry cannot be inspected or matched to contract facts
- **THEN** system SHALL downgrade placement to `document-only`
