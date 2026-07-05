## ADDED Requirements

### Requirement: ModelConfigurationPage supports profile-originated create flow
`ModelConfigurationPage` SHALL support entry from a profile settings page with source profile context so that creation can be prefilled for the current profile and return to that profile after save.

#### Scenario: Add-page entry seeds apiFormat
- **WHEN** user opens `ModelConfigurationPage` from `SettingsAddPage`
- **THEN** the editor MUST prefill the current profile draft `apiFormat`
- **AND** it MUST preserve that source context for post-save navigation

#### Scenario: Add-page entry returns without auto-select
- **WHEN** user creates and saves a new model config from `SettingsAddPage`
- **THEN** the app MUST return to the add-profile form
- **AND** it MUST refresh the model selector options
- **AND** it MUST NOT auto-select the newly created model for the profile draft

#### Scenario: Detail-page entry seeds profile context
- **WHEN** user opens `ModelConfigurationPage` from `SettingsDetailPage`
- **THEN** the editor MUST receive the source `profileId` and `apiFormat`
- **AND** it MUST use that context to prefill creation options when applicable

#### Scenario: Save returns to source profile page
- **WHEN** user saves a new model config from a profile-originated entry flow
- **THEN** the app MUST navigate back to the originating profile settings page
- **AND** that page MUST refresh its selectable model options

## MODIFIED Requirements

### Requirement: ModelConfigurationPage only exposes preset-derived subset editing
`ModelConfigurationPage` SHALL load an official preset matrix and expose controls that disable or enable preset cells/formats; it MUST NOT expose free aggregate editing that can add unsupported output capability. The page SHALL support both standalone asset-library entry and profile-originated entry, but saving a config SHALL still create or update only the reusable `UserModelConfig` asset itself.

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

#### Scenario: Standalone entry stays in config workspace
- **WHEN** user opens `ModelConfigurationPage` from the standalone model-configuration workspace
- **THEN** saving MUST return the user to that standalone workspace flow
- **AND** it MUST NOT force navigation to a profile settings page

#### Scenario: Profile-originated entry returns to source profile
- **WHEN** user opens `ModelConfigurationPage` from a profile settings page and saves successfully
- **THEN** the app MUST return to the originating profile settings page
- **AND** the new config MUST become available in that profile's model selector
