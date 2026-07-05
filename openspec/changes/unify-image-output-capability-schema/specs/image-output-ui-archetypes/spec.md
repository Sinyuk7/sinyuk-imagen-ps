## ADDED Requirements

### Requirement: Output UI SHALL use fixed archetypes chosen by geometry kind
The app SHALL render image output controls using a small fixed set of UI archetypes selected by the model geometry kind, rather than forcing every model into the same visible field set or hand-authoring a unique page per model.

#### Scenario: Flexible pixel models use Size and Format
- **WHEN** the current model capability uses `flexible-pixels`
- **THEN** MainPage and `GlobalGenerationSettingsPage` MUST render `Output Size` and `Output Format`
- **AND** they MUST NOT render a standalone `Aspect Ratio` field for that model

#### Scenario: Ratio-resolution models use Size, Aspect Ratio, and Format
- **WHEN** the current model capability uses `ratio-resolution`
- **THEN** MainPage and `GlobalGenerationSettingsPage` MUST render `Output Size`, `Aspect Ratio`, and `Output Format`
- **AND** the visible ratio field MUST reflect native capability truth rather than a synthetic pixel-preset explanation

### Requirement: Use Input Size SHALL appear as the first Output Size option for supported edit models
If the current model and operation support exact input-size derivation, the UI SHALL show `Use Input Size` as the first `Output Size` option. It MUST NOT appear as a separate section, badge, or second operation-specific output module.

#### Scenario: Edit-capable model prepends Use Input Size
- **WHEN** the current operation is `image_edit`
- **AND** the current capability supports exact input-size derivation
- **THEN** the `Output Size` group MUST display `Use Input Size` in the first position
- **AND** the rest of the size options MUST follow in their normal recommended order

#### Scenario: Text-to-image hides Use Input Size
- **WHEN** the current operation is `text_to_image`
- **THEN** the UI MUST NOT display `Use Input Size`
- **AND** any previously saved exact input-size selection MUST resolve as `Auto` in the visible state
- **AND** that visible `Auto` state MUST come from runtime normalization rather than destructive preference overwrite

### Requirement: ModelConfigurationPage SHALL avoid expanding into parallel text and edit output sections when the only difference is Use Input Size
`ModelConfigurationPage` SHALL keep a single shared output configuration view when `text_to_image` and `image_edit` share the same base output options and the only extra edit behavior is `Use Input Size`.

#### Scenario: Shared config includes edit-only size entry
- **WHEN** a model uses shared output options for both operations and only `image_edit` adds `Use Input Size`
- **THEN** `ModelConfigurationPage` MUST render one shared `Output Size` group
- **AND** that group MUST include `Use Input Size` as an edit-only first entry instead of rendering a second operation section

### Requirement: UI labels SHALL describe recommended entry points rather than raw capability internals
User-facing output controls SHALL present concise recommended labels such as `Auto`, `Use Input Size`, `1K`, `2K Wide`, or native ratio choices. The UI MUST NOT expose raw provider payload objects or raw internal capability unions as labels.

#### Scenario: GPT presets show readable labels
- **WHEN** a flexible-pixel model exposes recommended output size presets
- **THEN** the UI MUST render concise product labels for those presets
- **AND** any detailed dimensions or ratio hints MUST remain secondary supporting text rather than becoming a separate primary control dimension

### Requirement: Input settings SHALL explain their relationship to Use Input Size
If the product exposes input normalization settings for image-edit requests, the UI SHALL explain that `Use Input Size` uses the normalized input size produced by that same chain rather than the untouched original source size.

#### Scenario: Input settings hint clarifies normalized source
- **WHEN** the user can adjust image-edit input normalization settings and also sees `Use Input Size`
- **THEN** the UI MUST communicate that `Use Input Size` follows normalized input dimensions
- **AND** it MUST NOT imply that output size always equals the original unprocessed source image dimensions

### Requirement: UI SHALL reflect exact-size availability from normalized primary edit input
If `Use Input Size` depends on edit input metadata, the UI SHALL resolve its availability from the normalized geometry of the primary edit input.

#### Scenario: Multi-image edit uses first normalized input for availability
- **WHEN** the current request is `image_edit`
- **AND** multiple input images are present
- **THEN** `Use Input Size` availability and hinting MUST be based on the normalized geometry of the first input image
- **AND** the UI MUST NOT infer that state from another input image or the current canvas
