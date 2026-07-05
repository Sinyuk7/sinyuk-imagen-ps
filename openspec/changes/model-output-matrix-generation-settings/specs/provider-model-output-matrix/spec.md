## ADDED Requirements

### Requirement: Official image catalog is executable allowlist
Provider execution SHALL only use models with an explicit official image catalog entry or a validated user model config derived from an official entry; provider catalog resolution MUST NOT return a hidden default fallback for unknown image models.

#### Scenario: Resolver can represent no explicit rule
- **WHEN** catalog resolution receives an unknown model id
- **THEN** the resolver MUST return an explicit no-match result such as `undefined`, `null`, or a tagged unavailable result
- **AND** it MUST NOT return `image-endpoint-default`, `chat-image-default`, `gemini-generate-content-default`, or any other hidden executable default rule

#### Scenario: Unknown discovered model is not executable
- **WHEN** provider discovery returns a model id that is not in the official catalog and has no validated user model config
- **THEN** model listing MAY show the discovered fact as unavailable or unconfigured
- **AND** the model MUST NOT be selectable as an executable generation model

#### Scenario: Unknown selected model fails before provider dispatch
- **WHEN** Submit references a model id that is not in the official catalog and has no validated user model config
- **THEN** application validation MUST fail before provider dispatch
- **AND** no provider HTTP request MUST be sent

#### Scenario: Default rules are mechanically absent from executable catalog
- **WHEN** tests inspect official executable image catalog rules
- **THEN** no executable rule id MUST end with `-default`
- **AND** helper assertions such as `hasExplicitRule(apiFormat, modelId)` MUST return false for unknown model ids

### Requirement: Catalog declares an output matrix per model operation
The provider catalog SHALL declare an output matrix for each executable `apiFormat + modelId + operation`; each matrix MUST contain stable cell ids, ordered UI options for `imageSize`, `ratio`, and `outputFormat`, a `defaultCellId`, and one exact `requestOutput` per cell.

#### Scenario: Matrix default cell is valid and unique
- **WHEN** catalog validation reads an output matrix
- **THEN** `defaultCellId` MUST reference exactly one cell in the same matrix
- **AND** every cell id MUST be unique within that `apiFormat + modelId + operation`

#### Scenario: Matrix options match cells
- **WHEN** catalog validation reads `imageSize`, `ratio`, or `outputFormat` options
- **THEN** every option exposed by the matrix MUST be used by at least one cell
- **AND** every cell selection value MUST be present in the corresponding option list

#### Scenario: Matrix is operation-scoped
- **WHEN** one model supports both `text_to_image` and `image_edit`
- **THEN** each operation MUST have its own matrix and `defaultCellId`
- **AND** selecting a cell for one operation MUST NOT imply support for the other operation

#### Scenario: Matrix excludes legacy 512 image size concepts
- **WHEN** catalog validation reads matrix `imageSize` options or provider-native request output fields
- **THEN** matrix options MUST NOT expose `512`
- **AND** Gemini request output MUST NOT use `IMAGE_SIZE_FIVE_TWELVE` or equivalent 512-specific provider size constants

### Requirement: Matrix resolves UI selection to exact provider output
Each valid matrix cell SHALL resolve `imageSize + ratio + outputFormat` to exact provider request output fields; transport builders MUST serialize only the resolved fields and MUST NOT re-derive, downgrade, or infer output size/ratio from UI labels.

#### Scenario: GPT matrix resolves to pixel size
- **WHEN** selected model uses the OpenAI Images API format and the selected cell is `imageSize=4K`, `ratio=16:9`, `outputFormat=png`
- **THEN** resolved `requestOutput` MUST contain exact pixel `size`, for example `size: "3840x2160"`
- **AND** transport MUST write that exact `size` value to the HTTP body

#### Scenario: GPT auto resolves to provider auto
- **WHEN** selected model uses the OpenAI Images API format and the selected cell has `ratio=auto`
- **THEN** resolved `requestOutput` MUST use `size: "auto"`
- **AND** transport MUST NOT convert `auto` to a square pixel value

#### Scenario: Gemini matrix resolves to native fields
- **WHEN** selected model uses a Gemini image API format and the selected cell is `imageSize=4K`, `ratio=16:9`, `outputFormat=png`
- **THEN** resolved `requestOutput` MUST contain the Gemini request fields for image size and aspect ratio
- **AND** transport MUST write those same resolved Gemini fields to the HTTP body

#### Scenario: Request output rejects unrelated fields
- **WHEN** a catalog cell for one API format includes a provider output field owned by another API format
- **THEN** catalog validation MUST fail
- **AND** the invalid cell MUST NOT be executable

### Requirement: Transport builders contain no output inference fallback
Provider transport builders SHALL receive resolved `requestOutput` and directly serialize it; legacy helper functions that infer provider size, ratio, image config, or downgrades from UI output labels MUST be removed rather than kept as dormant fallback paths.

#### Scenario: Image endpoint builder has no size preset inference
- **WHEN** `image-endpoint` request building receives resolved output
- **THEN** it MUST serialize the exact resolved `size` and `outputFormat`
- **AND** it MUST NOT call legacy inference helpers such as `concreteSizeFromOutput` or `sizeFromPreset`

#### Scenario: Chat image builder has no image config inference
- **WHEN** `chat-image` request building receives resolved output
- **THEN** it MUST serialize the exact resolved `image_config` fields
- **AND** it MUST NOT map UI labels such as `4K` to another provider label such as `2K`

#### Scenario: Gemini builder has no generation config inference
- **WHEN** `gemini-generate-content` request building receives resolved output
- **THEN** it MUST serialize the exact resolved Gemini generation config fields
- **AND** missing or malformed resolved output MUST fail validation rather than silently deriving replacement output

### Requirement: Provider input resize is not output matrix data
`providerInputSizePreset` SHALL remain an app-local input image preprocessing setting and MUST NOT be represented as a provider output matrix option, cell field, or request output field.

#### Scenario: Image edit uses input resize separately
- **WHEN** user submits image edit with input images
- **THEN** app-local input preprocessing MAY use `providerInputSizePreset`
- **AND** output parameters MUST still come from the selected model output matrix cell
