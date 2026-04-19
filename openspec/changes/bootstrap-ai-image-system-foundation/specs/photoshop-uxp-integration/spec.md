## ADDED Requirements

### Requirement: UXP host submits only eligible active-layer targets
The Photoshop UXP integration SHALL require exactly one active document and one readable active layer target before job submission. V1 SHALL treat unsupported or unreadable active targets as host-side submission failures rather than implicit fallbacks.

#### Scenario: User submits the active layer
- **WHEN** a user invokes generation from the UXP panel with an active layer selected
- **THEN** the integration verifies there is one active document and one eligible active layer target
- **THEN** the integration reads that layer through Photoshop-supported APIs and converts it into the shared binary payload format before job submission
- **THEN** the submitted payload represents the selected layer target rather than an implicit full-document flattening fallback

#### Scenario: No active document or layer is available
- **WHEN** the plugin is invoked without an active document or without a readable active layer target
- **THEN** the integration fails before runtime job submission
- **THEN** the panel shows an actionable host-specific message instead of a generic execution failure

#### Scenario: Multiple or unsupported layer targets are selected
- **WHEN** the active target is multi-selected or resolves to an unsupported layer type for v1
- **THEN** the integration refuses submission
- **THEN** the user is told to select one supported readable layer target

### Requirement: UXP host submits jobs without violating host constraints
The Photoshop UXP integration SHALL submit jobs using only APIs and permissions available in the UXP runtime, including declared network and filesystem permissions when required.

#### Scenario: UXP plugin performs provider-backed execution
- **WHEN** the plugin needs network access or local file access during job submission
- **THEN** the integration uses manifest-approved capabilities and avoids Node.js-only APIs

#### Scenario: Required host capability is missing
- **WHEN** the plugin lacks a required manifest permission or host capability for the requested operation
- **THEN** the integration does not submit the job
- **THEN** the panel surfaces a structured host-capability failure with an actionable explanation

### Requirement: UXP host writes completed output back as a non-destructive new layer
The Photoshop UXP integration SHALL write a completed output asset back into the current document as a new layer or equivalent non-destructive result. Successful engine completion and Photoshop writeback SHALL remain distinguishable outcomes.

#### Scenario: Job completes in Photoshop
- **WHEN** the shared runtime returns a completed output for a Photoshop-submitted job
- **THEN** the integration creates a new layer or equivalent result target in the active document
- **THEN** the original source layer remains available for user comparison

#### Scenario: Runtime output completes but Photoshop writeback fails
- **WHEN** the shared runtime returns a completed output but Photoshop cannot create or insert the new layer
- **THEN** the integration preserves the completed runtime result reference when available
- **THEN** the panel surfaces writeback failure separately from execution failure

### Requirement: UXP host surfaces execution status and errors to the user
The Photoshop UXP integration SHALL display job progress and terminal errors inside the plugin UI.

#### Scenario: Job fails in Photoshop
- **WHEN** a submitted job reaches `failed`
- **THEN** the plugin displays the failure reason to the user within the panel UI
