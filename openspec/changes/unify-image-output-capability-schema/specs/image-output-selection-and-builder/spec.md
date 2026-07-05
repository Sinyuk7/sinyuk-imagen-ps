## ADDED Requirements

### Requirement: Output selection SHALL store canonical user intent including format
The system SHALL persist output choice as canonical user intent rather than a fixed matrix cell identity or provider wire payload. In the first implementation, canonical output selection MUST include geometry selection plus `outputFormat`. Canonical geometry selection MUST support `provider-default`, `pixels`, `ratio-resolution`, and `input-derived`.

#### Scenario: Pixel model stores pixels as selection intent
- **WHEN** a user selects an exact pixel geometry for a `flexible-pixels` model
- **THEN** the saved selection MUST record that pixel intent as canonical selection data
- **AND** it MUST NOT require a precomputed provider request payload to be stored alongside the selection

#### Scenario: Ratio-resolution model stores native dimensions as selection intent
- **WHEN** a user selects `aspectRatio` and `resolution` for a `ratio-resolution` model
- **THEN** the saved selection MUST preserve both dimensions as canonical selection data
- **AND** it MUST NOT collapse them into a provider-independent fake pixel preset id

#### Scenario: Output format travels with canonical selection
- **WHEN** a user selects an output format for any supported model
- **THEN** canonical output selection MUST include that `outputFormat`
- **AND** the system MUST NOT keep `outputFormat` on a separate legacy preference path

### Requirement: Stored selection and effective selection SHALL remain distinct
The system SHALL distinguish between stored user preference and runtime-resolved effective selection. Operation normalization MUST be a non-destructive runtime projection and MUST NOT overwrite stored preference unless the user explicitly changes the selection.

#### Scenario: Normalization does not destroy stored exact-size preference
- **WHEN** a stored selection uses exact input size for `image_edit`
- **AND** runtime resolution occurs under `text_to_image`
- **THEN** the effective selection MUST resolve as `provider-default`
- **AND** the stored selection MUST remain unchanged until the user explicitly saves a new choice
- **AND** visible UI state MAY show `Auto`, but that projection MUST NOT overwrite the stored exact-size preference

### Requirement: Input-derived exact-size selection SHALL normalize by operation
The system SHALL allow edit-derived exact input size as an output selection value, but that value MUST normalize when the current operation no longer supports it.

#### Scenario: Use Input Size normalizes to provider-default in text-to-image
- **WHEN** a saved selection uses an input-derived exact-size mode
- **AND** the current operation is `text_to_image`
- **THEN** the resolved selection MUST normalize to `provider-default`
- **AND** the UI MUST NOT expose a separate error or extra operation section for that normalization

### Requirement: Builder SHALL map selection and normalized input context to provider payload
Provider request builders SHALL receive canonical selection plus normalized input context and MUST derive the exact provider payload from that combination. Capability records MUST NOT carry provider wire payload templates as truth data.

#### Scenario: GPT builder resolves exact input size from normalized input context
- **WHEN** a user selects exact input size for a GPT-style `flexible-pixels` model during `image_edit`
- **THEN** the builder MUST consume normalized input dimension metadata already prepared by the input pipeline
- **AND** it MUST validate and emit the exact provider pixel size required by that model

#### Scenario: Exact-size uses first normalized edit input in multi-image edit
- **WHEN** an image-edit request includes multiple input images and exact input size is selected
- **THEN** builder resolution MUST use the normalized geometry of the first input image as the primary edit input
- **AND** it MUST NOT infer size from the last input image, canvas size, or another implicit source

#### Scenario: Gemini builder resolves native ratio-resolution fields
- **WHEN** a user selects `aspectRatio` and `resolution` for a Gemini-style model
- **THEN** the builder MUST emit the provider's native geometry request fields
- **AND** it MUST NOT first flatten the selection through a fake pixel preset payload stored in capability data

### Requirement: Builder SHALL fail closed for unsupported or unresolvable selections
If a canonical selection cannot be resolved for the current capability, operation, or normalized input context, builder resolution MUST fail closed before provider dispatch.

#### Scenario: Exact input size fails without valid input dimensions
- **WHEN** a user selection requires input-derived exact size
- **AND** the current request context does not provide a valid input image dimension source
- **THEN** resolution MUST fail before provider dispatch
- **AND** the system MUST NOT silently downgrade the request to another geometry mode

### Requirement: Use Input Size SHALL reuse existing input normalization results
When a user selects `Use Input Size`, the system SHALL derive output geometry from the same input normalization chain already used for edit-image input preparation. The system MUST NOT create a second independent size-derivation pipeline for output geometry.

#### Scenario: Normalized input size feeds both upload and output geometry
- **WHEN** an image-edit request uses local input normalization and the user selects `Use Input Size`
- **THEN** the output geometry MUST be resolved from the normalized input dimensions produced by that same pipeline
- **AND** the builder MUST NOT reopen files, inspect host runtime state, or parse image bytes on its own
- **AND** the system MUST NOT maintain a second independent output-size derivation chain for that selection

### Requirement: Exact-size resolution SHALL validate but MUST NOT silently rewrite geometry
If `Use Input Size` resolves to normalized input geometry that does not satisfy the current output capability, the system MUST fail closed or disable the option. It MUST NOT silently round, crop, or resize geometry during exact-size resolution.

#### Scenario: Invalid exact-size geometry is rejected instead of rewritten
- **WHEN** normalized input geometry violates the selected model's output constraints
- **THEN** exact-size resolution MUST fail or be unavailable
- **AND** the system MUST NOT silently modify that geometry and still call it `Use Input Size`
