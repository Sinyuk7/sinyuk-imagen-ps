## ADDED Requirements

### Requirement: Profile page exposes one selected-model control
`SettingsAddPage` and `SettingsDetailPage` SHALL expose exactly one primary model control for profile selection, labeled as the current model used by that profile; they MUST NOT expose user-facing `discovery` concepts, `Profile models` sublists, or secondary model-selection sections.

#### Scenario: Add page shows one primary model control
- **WHEN** user opens `SettingsAddPage`
- **THEN** the page MUST show a single primary model selector for the current profile draft
- **AND** it MUST NOT show `discovery` field help, discovered-model notices, or profile model sublists

#### Scenario: Detail page shows one primary model control
- **WHEN** user opens `SettingsDetailPage`
- **THEN** the page MUST show a single primary model selector for the persisted profile
- **AND** it MUST NOT show a separate `Profile models` list or additional model status sections under that selector

### Requirement: Profile model selector uses filtered user model configs only
The profile model selector SHALL list only saved `UserModelConfig` entries that are compatible with the current profile `apiFormat`; it MUST NOT include discovered-only model IDs or direct official catalog fallback candidates.

#### Scenario: Selector filters by apiFormat
- **WHEN** a profile uses `gemini-generate-content`
- **THEN** the selector MUST include only saved `UserModelConfig` entries with `apiFormat = gemini-generate-content`

#### Scenario: Selector label uses user model config identity only
- **WHEN** the profile model selector renders a compatible saved `UserModelConfig`
- **THEN** the visible option label MUST use that config's `modelId` or `displayName`
- **AND** it MUST NOT append official preset base-model helper labels to the selector option text

#### Scenario: Selector excludes discovered-only models
- **WHEN** remote discovery returns model IDs that do not correspond to a saved `UserModelConfig`
- **THEN** those discovered-only models MUST NOT appear in the profile model selector

#### Scenario: Selector excludes direct catalog fallback
- **WHEN** no saved `UserModelConfig` exists for the current `apiFormat`
- **THEN** official catalog presets MUST NOT appear as direct selectable options in the profile model selector

### Requirement: Empty profile model state shows create-first guidance
When a profile has no compatible saved `UserModelConfig`, the page SHALL show an empty-state `StatusNotice` and an action that leads the user to create a model config.

#### Scenario: Empty add page model state
- **WHEN** user opens `SettingsAddPage` and there is no compatible `UserModelConfig`
- **THEN** the page MUST show a `StatusNotice` explaining that a model config must be created first
- **AND** it MUST provide a direct action to open `ModelConfigurationPage`

#### Scenario: Empty detail page model state
- **WHEN** user opens `SettingsDetailPage` and there is no compatible `UserModelConfig`
- **THEN** the page MUST show a `StatusNotice` explaining that the current profile has no selectable model yet
- **AND** it MUST provide a direct action to open `ModelConfigurationPage`

### Requirement: Profile-selected model persists as the profile's current model
The selected model control SHALL persist the current profile model using the existing profile model-selection fields, while presenting a single-select UI semantics to the user.

#### Scenario: Saving selected model from add page
- **WHEN** user selects a model in `SettingsAddPage` and saves the profile
- **THEN** the profile save payload MUST persist that model as the current selected model for the profile

#### Scenario: Saving selected model from detail page
- **WHEN** user changes the selected model in `SettingsDetailPage` and saves the profile
- **THEN** the persisted profile MUST reopen with that same model shown as the current selected model
