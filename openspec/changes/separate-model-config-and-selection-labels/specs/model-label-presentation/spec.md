## ADDED Requirements

### Requirement: Model configuration rows SHALL present preset identity and saved config identity separately
The system SHALL render saved model configurations in the model configuration page as preset-oriented rows. Each row SHALL use the official preset `displayName(baseModelId)` as the primary title when available. Each row SHALL show the saved `config.modelId` in secondary metadata. The row MAY append an API-format label after the `config.modelId` as a lower-priority fact.

#### Scenario: Two configs share one preset but remain distinguishable
- **WHEN** two saved model configs have different `modelId` values and the same `baseModelId`
- **THEN** both rows show the same preset-friendly title
- **AND** each row shows its own `config.modelId` in metadata so the user can distinguish the configs

#### Scenario: Missing preset display name falls back conservatively
- **WHEN** a saved model config has no resolved official preset `displayName`
- **THEN** the row title falls back to the best available preset identity fact instead of hiding the row

#### Scenario: Narrow layout preserves config identity before protocol detail
- **WHEN** the model configuration row metadata cannot fully fit in the available width
- **THEN** the saved `config.modelId` remains visible before the API-format fact is truncated or omitted

### Requirement: Selection surfaces SHALL prioritize saved config identity for user-configured models
The system SHALL treat saved user model configs as configuration instances on selection and active-model surfaces outside the model configuration page. For those entries, the primary visible label SHALL be `config.modelId` rather than catalog `displayName`.

#### Scenario: Provider selector shows saved config identity
- **WHEN** a provider add or provider detail page lists user-configured model options
- **THEN** each option label uses the saved `config.modelId` as its primary visible label

#### Scenario: Main page selected model reflects saved config identity
- **WHEN** the active selected model comes from a saved user model config
- **THEN** the main page selected-model label shows that saved config's `modelId`

#### Scenario: Settings summary reflects selected saved config identity
- **WHEN** a provider profile default model resolves to a saved user model config
- **THEN** settings summary surfaces show that config's `modelId` as the visible selected-model label

### Requirement: Catalog-only models SHALL keep preset-friendly display names
The system SHALL preserve catalog `displayName` as the primary visible label for model entries that do not correspond to a saved user model config.

#### Scenario: Catalog-only selector option remains friendly
- **WHEN** a model entry is catalog-backed and not user-configured
- **THEN** the visible label uses the catalog `displayName` when available

#### Scenario: No saved config still allows friendly selected label
- **WHEN** the current selected model resolves only through catalog data and not through a saved user model config
- **THEN** the visible label remains the friendly preset display name instead of exposing raw internal fallback ids unless no friendly label exists

### Requirement: App-surface model labels SHALL use shared mode-specific presentation rules
The system SHALL derive model labels for configuration and selection surfaces through shared mode-specific presentation helpers or viewmodels instead of page-local fallback ordering.

#### Scenario: Same model info renders differently by surface mode
- **WHEN** the same saved user model config is shown in the model configuration list and in a provider model selector
- **THEN** the model configuration list uses preset-oriented presentation
- **AND** the selector uses configuration-instance presentation

#### Scenario: New selection surface inherits configuration-instance labeling
- **WHEN** a future app-surface selection view consumes the shared configuration-instance presentation helper
- **THEN** it renders user-configured models with `config.modelId` as the primary label without duplicating page-specific fallback logic
