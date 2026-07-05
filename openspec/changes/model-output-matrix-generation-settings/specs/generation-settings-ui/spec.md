## ADDED Requirements

### Requirement: MainPage output controls use selected model matrix
MainPage SHALL derive output control options and selected values from the current selected profile, model, operation, and model output matrix rather than local static output lists.

#### Scenario: MainPage options come from matrix
- **WHEN** user opens MainPage with a selected executable model
- **THEN** output controls MUST show only `imageSize`, `ratio`, and `outputFormat` options present in that model operation matrix

#### Scenario: Ratio options follow image size
- **WHEN** user changes selected `imageSize`
- **THEN** ratio control MUST show only ratios that have at least one matrix cell for that `imageSize`

#### Scenario: MainPage blocks unavailable matrix
- **WHEN** the selected profile/model/operation has no executable output matrix
- **THEN** MainPage MUST prevent Send for that model
- **AND** it MUST surface a validation state instead of falling back to static default output values

#### Scenario: Composer readiness validates executable matrix
- **WHEN** composer readiness is computed for the selected profile/model/operation
- **THEN** readiness MUST check the executable model output matrix
- **AND** it MUST return an unsupported or blocking state when no matrix is available instead of `unknown` that still allows Send

### Requirement: GlobalGenerationSettingsPage follows selected model context
`GlobalGenerationSettingsPage` SHALL present the generation settings for the current selected profile, model, and operation; it MUST no longer behave as an app-wide global output preference page.

#### Scenario: Settings follows selected profile and model
- **WHEN** user switches from profile A/model A to profile B/model B and opens Generation Settings
- **THEN** the page MUST display profile B/model B/current operation matrix options and resolved preference

#### Scenario: Settings follows operation
- **WHEN** the composer operation changes between text-to-image and image-edit
- **THEN** Generation Settings MUST display the matrix and resolved preference for the current operation

#### Scenario: Settings has no synthetic composer context
- **WHEN** Generation Settings is opened without a real shared composer draft context
- **THEN** it MUST surface a missing-context validation state
- **AND** it MUST NOT use a page-local, synthetic, or `no-composer-context` fallback branch

#### Scenario: Settings shows invalid preference as default
- **WHEN** saved preference is invalid for the current matrix
- **THEN** Generation Settings MUST display the matrix default selection
- **AND** it MUST NOT display stale removed option values as selected

### Requirement: MainPage and Settings share one controller
MainPage output controls and `GlobalGenerationSettingsPage` SHALL use one shared resolver/controller for loading matrix options, resolved preference, saving selection, and exposing exact resolved request output.

#### Scenario: Both pages expose same options
- **WHEN** MainPage and Generation Settings are opened for the same `profileId + apiFormat + modelId + operation`
- **THEN** both entry points MUST expose the same ordered `imageSize`, `ratio`, and `outputFormat` options

#### Scenario: Selecting either page updates same preference
- **WHEN** user changes `imageSize`, `ratio`, or `outputFormat` in either MainPage or Generation Settings
- **THEN** the shared controller MUST save the same model-scoped preference
- **AND** the other page MUST reflect that selection when shown for the same context

#### Scenario: Settings change affects next Send
- **WHEN** user changes output selection in Generation Settings, returns to MainPage, and clicks Send
- **THEN** the next Submit input MUST use the exact `requestOutput` for the Settings-selected matrix cell

#### Scenario: MainPage change affects Settings
- **WHEN** user changes output selection from MainPage quick controls
- **THEN** Generation Settings MUST show that same selection for the same context

### Requirement: Send uses controller resolved output
The app Send path SHALL pass the shared controller's resolved output selection to application Submit; it MUST NOT rebuild output from old `AppGenerationSettings` fields or local static defaults.

#### Scenario: Send has resolved output
- **WHEN** user clicks Send with a valid selected model matrix
- **THEN** Submit input MUST contain the selected cell's resolved exact `requestOutput`

#### Scenario: Send keeps provider input resize separate
- **WHEN** user clicks Send for image edit
- **THEN** Submit input MAY include app-local provider input resize settings separately
- **AND** output settings MUST come from the selected matrix cell
