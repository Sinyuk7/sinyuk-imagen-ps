## ADDED Requirements

### Requirement: User model config narrows official preset matrix
`UserModelConfig` SHALL derive output capability from an official preset with the same `apiFormat`; it MAY narrow the preset to a non-empty subset of matrix cells, but MUST NOT add a cell, option, request strategy, or provider output field not present in the official preset.

#### Scenario: User config saves subset of cells
- **WHEN** user saves a user model config based on an official preset and selects only part of the preset cells
- **THEN** the system MUST persist that subset
- **AND** the user model's later UI options and Send behavior MUST use only the persisted subset

#### Scenario: User config cannot add unsupported cell
- **WHEN** command input or storage attempts to add an `imageSize`, `ratio`, `outputFormat`, matrix cell id, or `requestOutput` not present in the official preset
- **THEN** save or validation MUST fail
- **AND** the unsupported capability MUST NOT be persisted

#### Scenario: User config cannot change request strategy
- **WHEN** command input attempts to set a `requestStrategyId` different from the official preset
- **THEN** save MUST fail
- **AND** the model MUST NOT become executable with that strategy

#### Scenario: User config subset cannot be empty
- **WHEN** user attempts to disable every matrix cell for an operation that remains enabled
- **THEN** save MUST fail with validation failure

### Requirement: Old user model output schema is rejected
The system MUST replace old aggregate `UserModelConfig.output.aspectRatios/sizes/outputFormats` with official preset matrix subset configuration; implementations MUST NOT migrate or best-effort reinterpret old aggregate output config.

#### Scenario: Old aggregate output config is invalid
- **WHEN** storage or command input provides old aggregate `aspectRatios`, `sizes`, or `outputFormats`
- **THEN** the system MUST reject the structure or treat the record as invalid
- **AND** it MUST NOT auto-migrate the aggregate values into matrix cells

#### Scenario: Storage validators reject old config
- **WHEN** Chrome, UXP, or fake storage reads a user model config with old aggregate output shape
- **THEN** the validator MUST reject that record
- **AND** no compatibility branch MUST recover it

### Requirement: ModelConfigurationPage only exposes preset-derived subset editing
`ModelConfigurationPage` SHALL load an official preset matrix and expose controls that disable or enable preset cells/formats; it MUST NOT expose free aggregate editing that can add unsupported output capability.

#### Scenario: Page derives options from official preset
- **WHEN** user opens `ModelConfigurationPage` for a model config
- **THEN** the page MUST display output options derived from the selected official preset matrix
- **AND** it MUST NOT show old free `aspectRatios`, `sizes`, or `outputFormats` aggregate multi-select controls

#### Scenario: Page save payload is matrix subset
- **WHEN** user saves `ModelConfigurationPage`
- **THEN** the save payload MUST identify the official preset and selected matrix subset
- **AND** it MUST NOT submit old aggregate output capability fields

#### Scenario: Edit seed loads persisted subset
- **WHEN** user edits an existing user model config
- **THEN** `ModelConfigurationPage` MUST load the official preset and the persisted subset
- **AND** disabled preset cells MUST remain disabled in the editing UI
