## ADDED Requirements

### Requirement: Engine creates canonical job records from submitted job requests
The engine SHALL accept a `JobRequest` containing a selected provider, selected workflow reference or inline workflow spec, opaque input payload, optional asset references, and optional metadata. The engine SHALL generate a unique `jobId` and persist a `JobRecord` containing the request snapshot, lifecycle state, timestamps, active step identifier, monotonic event sequence, terminal result, and terminal error fields.

#### Scenario: Host submits a valid job request
- **WHEN** a host submits a valid `JobRequest`
- **THEN** the engine creates a `JobRecord` in the `created` state before any workflow step begins
- **THEN** the `JobRecord` includes the generated `jobId`, the original request snapshot, and an initial event sequence value

### Requirement: Engine enforces legal lifecycle transitions and pre-run rejection paths
The engine SHALL transition each job only through `created -> running -> completed` or `created -> running -> failed`, and MAY transition directly from `created -> failed` when request validation or dependency resolution fails before execution begins. V1 SHALL NOT introduce a `cancelled` terminal state.

#### Scenario: Job starts execution
- **WHEN** a created job is ready to run
- **THEN** the engine transitions that job to `running` when the first workflow step begins
- **THEN** no other lifecycle state is emitted before `running` for that job

#### Scenario: Request references an unknown provider or workflow
- **WHEN** a host submits a job whose provider identifier is not registered or whose workflow cannot be resolved
- **THEN** the engine does not begin workflow execution
- **THEN** the engine transitions the job from `created` to `failed`
- **THEN** the terminal error is machine-readable and identifies the failure category and reason

#### Scenario: Request fails envelope validation before execution
- **WHEN** a submitted job request is missing required fields or contains an invalid shape
- **THEN** the engine does not transition the job to `running`
- **THEN** the engine stores a structured validation error that hosts can inspect

### Requirement: Engine stores inspectable terminal payloads
The engine SHALL store a `JobTerminalResult` for completed jobs and a structured `JobError` for failed jobs. Terminal payloads SHALL remain inspectable after event delivery.

#### Scenario: Job finishes successfully
- **WHEN** all workflow steps complete without error
- **THEN** the engine transitions the job to `completed`
- **THEN** the `JobRecord` stores the final declared workflow output, output asset descriptors, and diagnostics for host consumption

#### Scenario: Job fails during execution
- **WHEN** any workflow step throws or returns a failure
- **THEN** the engine transitions the job to `failed`
- **THEN** the `JobRecord` stores a structured terminal error containing code, category, message, and evidence or diagnostics

### Requirement: Engine exposes execution state independent of UI frameworks
The engine SHALL maintain execution state in a runtime store that can be consumed without React, browser DOM APIs, or Photoshop APIs.

#### Scenario: Non-UI consumer reads job state
- **WHEN** a consumer subscribes to or reads engine state outside a UI framework
- **THEN** the consumer can inspect current job status, active step identifier, progress snapshot, and terminal result or error details

### Requirement: Engine isolates per-job state without defining cross-job scheduling guarantees
The engine SHALL track lifecycle state independently for each submitted job record. This change SHALL NOT require a shared scheduler, fairness policy, or provider interruption model across multiple running jobs.

#### Scenario: Host submits multiple jobs to one engine instance
- **WHEN** more than one job record exists in the engine store
- **THEN** each job retains its own lifecycle state, event sequence, and terminal payload
- **THEN** hosts do not depend on unspecified cross-job ordering guarantees beyond each individual job's legal lifecycle order

### Requirement: Engine emits ordered lifecycle events with execution evidence
The engine SHALL emit `job:created`, `job:running`, `job:completed`, and `job:failed` events as lifecycle transitions occur. Each event payload SHALL include the `jobId`, lifecycle state, timestamp, monotonic sequence number, active step identifier when available, a job-envelope summary, and diagnostics or evidence trace data.

#### Scenario: Host listens for job completion
- **WHEN** a job reaches a terminal state
- **THEN** the engine emits the corresponding lifecycle event after the job store reflects that state
- **THEN** the event payload includes the job identifier, state payload, sequence number, and execution evidence needed for inspection
- **THEN** hosts can update status views without directly controlling engine internals

#### Scenario: Host receives multiple lifecycle events for one job
- **WHEN** the engine emits successive lifecycle events for the same job
- **THEN** the sequence number increases monotonically
- **THEN** hosts can reconstruct the legal transition order from the event payloads

### Requirement: Engine enforces host-agnostic execution boundaries
The engine SHALL NOT require direct access to browser-only, Node.js-only, or Photoshop-specific APIs in order to execute jobs.

#### Scenario: Shared runtime is loaded outside a browser or Photoshop host
- **WHEN** the engine package is imported in a non-React test environment without DOM globals or UXP APIs
- **THEN** the package loads successfully
- **THEN** workflow execution can begin as long as required shared adapters and provider registrations are supplied externally
