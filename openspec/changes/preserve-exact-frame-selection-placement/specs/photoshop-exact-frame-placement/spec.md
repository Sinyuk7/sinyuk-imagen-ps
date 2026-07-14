## ADDED Requirements

### Requirement: Exact-frame placement SHALL preserve the captured frame
When a generated image asset is placed from a Photoshop capture-backed result whose placement intent is `exact-frame`, the system SHALL place the asset into the captured source document and transform the active placed layer to the captured `placementRect`. The actual generated asset pixel size, provider-default output geometry, or mismatch between requested and actual output size MUST NOT downgrade the placement intent to `document-only`.

#### Scenario: Selection result returns provider-default sized output
- **WHEN** a user captures a Photoshop selection with placement intent `exact-frame`
- **AND** the provider request has no explicit output geometry
- **AND** the generated asset is returned at `1024x1024`
- **THEN** placing the result keeps `exact-frame`
- **AND** the placed layer is scaled and translated to the captured selection rectangle

#### Scenario: Layer result returns 2K output for a smaller captured frame
- **WHEN** a user captures a `2011x2011` Photoshop layer with placement intent `exact-frame`
- **AND** the provider request uses `wireImageConfigSize:"2K"` and `wireImageConfigAspectRatio:"1:1"`
- **AND** the generated asset is returned at `2048x2048`
- **THEN** placing the result keeps `exact-frame`
- **AND** the placed layer final bounds match the captured `2011x2011` frame

#### Scenario: Explicit pixel request returns mismatched output size
- **WHEN** a capture-backed result has placement intent `exact-frame`
- **AND** the requested output geometry is explicit pixels
- **AND** the generated asset pixel dimensions do not match that requested geometry
- **THEN** placing the result still keeps `exact-frame`
- **AND** the placed layer is transformed to the captured `placementRect`

### Requirement: Anchored exact-frame placement SHALL keep document safety boundaries
The system SHALL apply `exact-frame` coordinates only when the captured source document can be resolved with strong source-document evidence. If the source document is missing, size-drifted, ambiguous, or resolved only by active-document fallback, the system MUST NOT blindly transform a placed layer using stale captured coordinates.

#### Scenario: Captured document dimensions drift before placement
- **WHEN** a capture-backed result has placement intent `exact-frame`
- **AND** the current Photoshop document with the captured `documentId` no longer matches `documentSizeAtCapture`
- **THEN** the system rejects or blocks anchored frame placement according to the existing document mismatch path
- **AND** it does not transform the placed layer to stale coordinates

#### Scenario: Active document fallback is used
- **WHEN** the captured source document cannot be strongly resolved
- **AND** the placement target resolution falls back to the active Photoshop document
- **THEN** the system MUST NOT apply the captured `placementRect` transform to that fallback document

### Requirement: Exact-frame placement diagnostics SHALL report output mismatches without changing placement authority
When the generated asset size can be read, the system SHALL preserve diagnostic evidence about the actual asset size and exact-frame transform outcome. If requested output geometry and actual asset size differ, the system SHALL make that mismatch diagnosable without reporting the successful placement as `document-only`.

#### Scenario: Output mismatch is logged for an exact-frame placement
- **WHEN** a generated asset is placed with placement intent `exact-frame`
- **AND** the actual generated asset size differs from the requested output geometry
- **THEN** placement success telemetry reports `placement:"exact-frame"`
- **AND** telemetry includes the actual asset size and frame-transform bounds
- **AND** telemetry does not report `requestedPlacement:"exact-frame"` with `placement:"document-only"` solely because of the output-size mismatch
