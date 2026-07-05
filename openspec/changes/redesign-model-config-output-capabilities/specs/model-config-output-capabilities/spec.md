## ADDED Requirements

### Requirement: ModelConfigurationPage SHALL edit model capabilities by dimensions instead of matrix cells
`ModelConfigurationPage` SHALL present official preset output capabilities through the three user-facing dimensions `Output Format`, `Aspect Ratio`, and `Resolution`. The page MUST NOT expose raw `outputMatrix` cell rows or raw `operation · imageSize · ratio · outputFormat` labels as the primary editing UI.

#### Scenario: Shared capability editor uses dimension labels
- **WHEN** a user opens a model configuration editor for an official preset
- **THEN** the page shows dimension-based controls for `Output Format`, `Aspect Ratio`, and `Resolution`
- **THEN** the page does not render a flat checkbox list of raw matrix cells as the main editing surface

### Requirement: ModelConfigurationPage SHALL render operation sections based on semantic equality
The page SHALL group editable capabilities by `operation`. If `text_to_image` and `image_edit` are semantically equal in supported `imageSizes`, `ratios`, `outputFormats`, valid `(imageSize, ratio, outputFormat)` combinations, and default combination semantics, the page SHALL render one shared section and apply edits to both operations. Otherwise, the page SHALL render separate `Text to Image` and `Edit Image` sections.

#### Scenario: Equal operations render one shared section
- **WHEN** an official preset has semantically equal `text_to_image` and `image_edit` matrices
- **THEN** the editor shows one shared capability section
- **THEN** the section indicates that the configuration applies to both operations

#### Scenario: Different operations render separate sections
- **WHEN** an official preset has different `text_to_image` and `image_edit` capability sets
- **THEN** the editor shows separate `Text to Image` and `Edit Image` sections
- **THEN** both sections keep the same field order of `Output Format`, `Aspect Ratio`, and `Resolution`

### Requirement: Dimension selections SHALL filter the original sparse matrix instead of rebuilding combinations
Saving dimension selections SHALL derive `outputMatrix` by filtering the official preset's original sparse cells. The system MUST keep a cell only when its `outputFormat`, `ratio`, and `imageSize` are all selected for that operation. The system MUST NOT synthesize new combinations from the cartesian product of selected dimensions.

#### Scenario: Removing one ratio removes all matching sparse cells for that operation
- **WHEN** a user deselects `16:9` in an operation section
- **THEN** every original preset cell with `ratio === 16:9` is removed from the saved subset for that operation
- **THEN** cells with other ratios remain unchanged if their other dimensions are still selected

#### Scenario: Sparse combinations remain sparse after save
- **WHEN** a preset supports `PNG + 4K + 16:9` but does not support `JPEG + 4K + 16:9`
- **THEN** selecting both `PNG` and `JPEG`, selecting `4K`, and selecting `16:9` does not create a new `JPEG + 4K + 16:9` cell
- **THEN** the saved subset only contains combinations that existed in the original preset matrix

### Requirement: ModelConfigurationPage SHALL use capability-appropriate control patterns
`Output Format` SHALL use detached multi-select chips. `Aspect Ratio` SHALL use a selectable tile grid with ratio-shaped visuals for graphic ratios and text chips for `Auto` or `Source` values. `Resolution` SHALL use compact ordered multi-select chips. Labels SHALL appear above the option groups and the layout SHALL support wrapping within the UXP panel width.

#### Scenario: Ratio field displays visible ratio shapes
- **WHEN** a ratio field contains graphic ratios such as `16:9`, `4:3`, `1:1`, or `9:16`
- **THEN** each ratio option is shown as a selectable tile with a ratio-shaped visual and a compact textual label
- **THEN** `Auto` and `Source` are presented as text-only options separate from the graphic ratio tiles

### Requirement: Legacy non-rectangular cell subsets SHALL disclose normalization before save
If an existing saved `UserModelConfig` cannot be represented exactly as shared `Output Format` / `Aspect Ratio` / `Resolution` selections for an operation, the page SHALL detect that condition and show a normalization warning before save. Saving such a config SHALL normalize it to the dimension-filter semantics.

#### Scenario: Legacy sparse hole configuration warns before save
- **WHEN** a saved config contains a cell-level sparse hole that cannot be represented by dimension-only selections
- **THEN** the editor shows a warning that saving will normalize the configuration to shared dimension rules
- **THEN** saving replaces the legacy subset with the normalized dimension-filtered subset

### Requirement: ModelConfigurationPage SHALL disclose sparse-matrix limits without exposing raw cells
The editor SHALL communicate that selected dimensions do not imply every cross-product combination is valid. The page SHALL display a valid combination count summary and SHALL show explanatory helper text when the selected dimensions map to a sparse capability set.

#### Scenario: Sparse combination helper appears for non-complete combinations
- **WHEN** the selected dimensions correspond to a sparse set of valid output combinations
- **THEN** the editor shows the count of valid output combinations
- **THEN** the editor explains that some selected values are not available in every combination
