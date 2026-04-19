## ADDED Requirements

### Requirement: Web host assembles valid job requests from browser-safe state
The Web application SHALL run the shared runtime through browser-safe adapters and SHALL allow a user to upload an image input, select a workflow or provider path, and edit provider-specific parameters before job submission. Invalid local form state SHALL NOT produce runtime job submission.

#### Scenario: User prepares a job in the browser
- **WHEN** a user selects an input image and fills in provider parameters
- **THEN** the application validates the local state needed to construct a `JobRequest`
- **THEN** the application assembles a valid job request that can be submitted to the shared engine

#### Scenario: Provider schema rejects local input before submission
- **WHEN** a user leaves required provider parameters invalid or incomplete
- **THEN** the Web host blocks submission
- **THEN** the UI surfaces validation feedback without creating a runtime job

### Requirement: Web host renders parameter editors from provider contracts
The Web application SHALL render provider-specific parameter inputs from the selected provider schema or contract metadata rather than hard-coded cross-provider field assumptions.

#### Scenario: User switches providers in the browser
- **WHEN** the selected provider changes
- **THEN** the parameter editor updates to the newly selected provider contract
- **THEN** the host does not normalize incompatible provider-specific semantics into a fake shared form

### Requirement: Web host surfaces execution progress and terminal inspection state
The Web application SHALL display job status transitions and terminal results or errors for submitted jobs by reading shared runtime state and lifecycle events.

#### Scenario: Job is running in the browser
- **WHEN** the engine emits lifecycle updates for a submitted job
- **THEN** the Web application updates the visible job status to reflect `created`, `running`, `completed`, or `failed`

#### Scenario: Job fails in the browser
- **WHEN** execution ends in a failed state
- **THEN** the Web application displays actionable error information instead of a silent failure
- **THEN** the failure view distinguishes local validation errors from runtime execution failures

### Requirement: Web host keeps preview failures separate from job failures
The Web application SHALL render or expose the generated result of a completed job in a form users can inspect. Preview or rendering failures in the browser SHALL NOT overwrite the underlying runtime job state.

#### Scenario: Job completes successfully in the browser
- **WHEN** a submitted job reaches `completed`
- **THEN** the Web application renders the returned output asset or preview for the user

#### Scenario: Browser preview cannot be rendered
- **WHEN** the runtime job is `completed` but the browser cannot render the preview artifact
- **THEN** the job remains `completed` in shared runtime state
- **THEN** the Web UI surfaces preview rendering failure separately from execution failure
