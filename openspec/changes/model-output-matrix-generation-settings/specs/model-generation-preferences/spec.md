## ADDED Requirements

### Requirement: Generation preference is model-scoped
The system SHALL save generation output preference by `profileId + apiFormat + modelId + operation`; switching profile, model, API format, or operation MUST load the matching preference or the selected matrix default.

#### Scenario: Repository key includes full execution context
- **WHEN** a generation preference is saved or loaded
- **THEN** the repository key MUST include `profileId`, `apiFormat`, `modelId`, and `operation`
- **AND** omitting any of those fields MUST fail validation rather than falling back to a global or model-only key

#### Scenario: Switching models loads model preference
- **WHEN** user switches from model A to model B
- **THEN** Generation Settings MUST show model B's saved preference
- **AND** if model B has no saved preference, it MUST show model B's catalog default cell

#### Scenario: Switching back restores previous model preference
- **WHEN** user saves `imageSize=4K` for model A, switches to model B, then switches back to model A
- **THEN** Generation Settings MUST restore model A's saved `imageSize=4K` preference if that selection is still supported by model A's current matrix

#### Scenario: Same model in different profiles has independent preference
- **WHEN** profile A and profile B both select the same `apiFormat + modelId`
- **AND** user saves different generation preferences in each profile
- **THEN** switching profiles MUST show each profile's own preference rather than sharing a model-only preference

#### Scenario: Operation has independent preference
- **WHEN** the same `profileId + apiFormat + modelId` supports both `text_to_image` and `image_edit`
- **AND** user saves different selections for each operation
- **THEN** switching operation MUST load that operation's saved preference or matrix default independently

### Requirement: Preference stores UI selection, not wire output
Saved generation preference SHALL store the matrix selection identity and UI dimensions, not resolved provider wire output; Send MUST resolve the saved selection against the current matrix at dispatch time.

#### Scenario: Preference resolves through current catalog
- **WHEN** a saved preference references a valid current matrix cell
- **THEN** Send MUST resolve that cell through the current catalog matrix
- **AND** use the current cell's `requestOutput`

#### Scenario: Preference does not persist request output
- **WHEN** storage contains a generation preference
- **THEN** the stored record MUST NOT contain provider wire fields such as pixel `size`, Gemini `imageSize`, Gemini `aspectRatio`, or API-specific `image_config`

### Requirement: Invalid preference falls back to matrix default
When a saved generation preference no longer matches the selected model operation matrix, the system SHALL use the matrix default cell and MUST NOT send stale output values.

#### Scenario: Removed cell falls back to default
- **WHEN** saved preference references a cell id no longer present in the current matrix
- **THEN** the resolved settings MUST use the matrix `defaultCellId`
- **AND** Send MUST use the default cell's `requestOutput`

#### Scenario: Removed option value falls back to default
- **WHEN** saved preference references an `imageSize`, `ratio`, or `outputFormat` no longer present in the current matrix
- **THEN** the resolved settings MUST use the matrix `defaultCellId`
- **AND** the stale selection MUST NOT be sent

### Requirement: Old output settings are not compatibility inputs
The system MUST cleanly replace global generation output settings with model-scoped preferences; implementations MUST NOT read old global output fields as compatibility, migration, best-effort recovery, or fallback inputs.

#### Scenario: Old output fields are ignored
- **WHEN** storage contains old global `outputSizePreset`, `aspectRatio`, or `outputFormat`
- **THEN** the system MUST NOT use those fields to derive a model generation preference

#### Scenario: Provider input size remains app-local
- **WHEN** storage contains app-local `providerInputSizePreset`
- **THEN** the system MAY keep reading it as input preprocessing settings
- **AND** it MUST NOT be merged into model generation preference records
