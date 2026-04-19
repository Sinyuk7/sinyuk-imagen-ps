## ADDED Requirements

### Requirement: UXP host reads active Photoshop content as engine input
The Photoshop UXP integration SHALL read the currently selected document or layer content and convert it into the binary payload expected by the shared runtime.

#### Scenario: User submits the active layer
- **WHEN** a user invokes generation from the UXP panel with an active layer selected
- **THEN** the integration reads that layer through Photoshop-supported APIs
- **THEN** the integration converts the layer data into the shared binary payload format before job submission

### Requirement: UXP host submits jobs without violating host constraints
The Photoshop UXP integration SHALL submit jobs using only APIs and permissions available in the UXP runtime, including declared network and filesystem permissions when required.

#### Scenario: UXP plugin performs provider-backed execution
- **WHEN** the plugin needs network access or local file access during job submission
- **THEN** the integration uses manifest-approved capabilities and avoids Node.js-only APIs

### Requirement: UXP host writes completed output back as a new layer
The Photoshop UXP integration SHALL write a completed output asset back into the current document as a new layer or equivalent non-destructive result.

#### Scenario: Job completes in Photoshop
- **WHEN** the shared runtime returns a completed output for a Photoshop-submitted job
- **THEN** the integration creates a new layer or equivalent result target in the active document
- **THEN** the original source layer remains available for user comparison

### Requirement: UXP host surfaces execution status and errors to the user
The Photoshop UXP integration SHALL display job progress and terminal errors inside the plugin UI.

#### Scenario: Job fails in Photoshop
- **WHEN** a submitted job reaches `failed`
- **THEN** the plugin displays the failure reason to the user within the panel UI
