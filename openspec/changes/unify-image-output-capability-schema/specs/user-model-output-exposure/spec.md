## ADDED Requirements

### Requirement: User model configuration SHALL limit exposed output entry points rather than enumerate full capability truth
`UserModelConfig` SHALL control which recommended output entry points and safe output options are exposed in the product UI. It MUST NOT attempt to enumerate the full underlying capability space for models whose geometry truth is constrained but not finite.

#### Scenario: Flexible pixel model config limits exposed presets
- **WHEN** a `flexible-pixels` model supports a large legal pixel space but the product exposes only recommended size presets
- **THEN** `UserModelConfig` MUST be able to disable or allow those recommended presets
- **AND** it MUST NOT require the config to list every legal pixel size in the capability truth

### Requirement: User model configuration SHALL manage Use Input Size as an exposed edit-only option
If a model supports exact input-size derivation for `image_edit`, `UserModelConfig` SHALL be able to allow or disable the `Use Input Size` entry independently from the shared base output size presets.

#### Scenario: Config disables Use Input Size while keeping shared size presets
- **WHEN** a user edits a model config for a model that supports `Use Input Size`
- **THEN** the config UI MUST allow that entry to be disabled without requiring a second operation configuration section
- **AND** shared non-derived size presets MUST remain configurable in the same shared output view

#### Scenario: Use Input Size does not create second size derivation policy
- **WHEN** `UserModelConfig` allows `Use Input Size`
- **THEN** the config MUST only control whether that entry is exposed
- **AND** it MUST NOT define a second output-size derivation algorithm separate from the shared input normalization chain

### Requirement: ModelConfigurationPage SHALL render exposure controls from output UI archetypes
`ModelConfigurationPage` SHALL derive its visible controls from the same output UI archetype rules used by MainPage and `GlobalGenerationSettingsPage`, instead of assuming every model exposes `Output Format`, `Aspect Ratio`, and `Resolution` as universal primary filters.

#### Scenario: Flexible pixel config page omits standalone aspect ratio
- **WHEN** a user edits a config for a `flexible-pixels` model
- **THEN** the page MUST expose `Output Size` and `Output Format` controls derived from that model's presentation data
- **AND** it MUST NOT force a standalone `Aspect Ratio` control into the editor

### Requirement: Legacy matrix-oriented config semantics SHALL be replaced by exposure semantics
New user model configuration behavior SHALL replace the old assumption that output config is always a subset of a finite official matrix. Implementations MUST NOT continue extending `ModelConfigurationPage` around that assumption once the new capability schema is adopted.

#### Scenario: New config flow does not require matrix subset truth
- **WHEN** the product handles a model whose underlying capability truth is not a finite matrix
- **THEN** the configuration system MUST still support limiting exposed output entry points
- **AND** it MUST NOT reject the model solely because its full capability space cannot be represented as a finite cell subset

### Requirement: Ratio-resolution exposure SHALL use dimension-level limits in the first implementation
For `ratio-resolution` models, `UserModelConfig` SHALL limit exposed output choices at the dimension level in the first implementation. It MUST allow enabling or disabling `aspectRatio`, `resolution`, and `outputFormat` values independently, but it MUST NOT require combination-level `aspectRatio × resolution` exceptions.

#### Scenario: Gemini exposure disables one ratio without defining pair exceptions
- **WHEN** a user edits exposed output options for a `ratio-resolution` model
- **THEN** the configuration system MUST support disabling a ratio or a resolution dimension value
- **AND** it MUST NOT require the user to author explicit pairwise combination exceptions in the first implementation
