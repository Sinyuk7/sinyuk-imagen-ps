## ADDED Requirements

### Requirement: Engine manages deterministic job lifecycle
The system SHALL create a job envelope with a unique identifier, selected provider, selected workflow, opaque input payload, and optional metadata before execution begins. The engine SHALL transition jobs through an explicit lifecycle of `created`, `running`, `completed`, or `failed`.

#### Scenario: Job starts execution
- **WHEN** a host submits a valid job envelope to the engine
- **THEN** the engine records the job in the `created` state before workflow execution starts
- **THEN** the engine transitions the job to `running` when the first workflow step begins

#### Scenario: Job finishes successfully
- **WHEN** all workflow steps complete without error
- **THEN** the engine transitions the job to `completed`
- **THEN** the engine stores the final workflow output for host consumption

#### Scenario: Job fails during execution
- **WHEN** any workflow step throws or returns a failure
- **THEN** the engine transitions the job to `failed`
- **THEN** the engine stores error details that hosts can inspect

### Requirement: Engine exposes execution state independent of UI frameworks
The engine SHALL maintain execution state in a runtime store that can be consumed without React, browser DOM APIs, or Photoshop APIs.

#### Scenario: Non-UI consumer reads job state
- **WHEN** a consumer subscribes to or reads engine state outside a UI framework
- **THEN** the consumer can inspect current job status, workflow progress, and terminal error details

### Requirement: Engine emits lifecycle events for observable execution
The engine SHALL emit `job:created`, `job:running`, `job:completed`, and `job:failed` events as lifecycle transitions occur.

#### Scenario: Host listens for job completion
- **WHEN** a job reaches a terminal state
- **THEN** the engine emits the corresponding lifecycle event with the job identifier and state payload
- **THEN** hosts can update status views without directly controlling engine internals

### Requirement: Engine enforces host-agnostic execution boundaries
The engine SHALL NOT require direct access to browser-only, Node.js-only, or Photoshop-specific APIs in order to execute jobs.

#### Scenario: Shared runtime is reused across hosts
- **WHEN** the engine package is loaded in Web and UXP hosts
- **THEN** execution behavior remains consistent because host-specific dependencies are supplied through adapters outside the engine
