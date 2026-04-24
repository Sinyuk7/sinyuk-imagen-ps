# Runtime Assembly

## Purpose

定义 runtime 的组装行为：把 job store、event bus、workflow registry、provider dispatcher 和 runner 组装为统一可执行入口。

## Requirements

### Requirement: Runtime assembles all engine components
The system SHALL provide a `createRuntime` function that assembles job store, event bus, workflow registry, provider dispatcher, and runner into a single executable runtime.

#### Scenario: Runtime creation
- **WHEN** `createRuntime` is called with optional initial workflows and provider adapters
- **THEN** it MUST return a runtime object with a `runWorkflow` method

### Requirement: Runtime exposes runWorkflow
The system SHALL expose a `runWorkflow` method that accepts a workflow name and job input, submits a job, executes the workflow, and returns the final job state.

#### Scenario: Successful workflow run
- **WHEN** `runWorkflow` is called with a registered workflow name and valid input
- **THEN** it MUST return a completed job with status `completed`

#### Scenario: Workflow not found
- **WHEN** `runWorkflow` is called with an unregistered workflow name
- **THEN** it MUST throw a `JobError` with category `workflow`

#### Scenario: Job failure propagation
- **WHEN** a step fails during `runWorkflow` execution
- **THEN** it MUST return a failed job with status `failed` and a populated `error` field

### Requirement: Runtime manages job lifecycle
The system SHALL manage the full job lifecycle from `created` through `running` to `completed` or `failed` within `runWorkflow`.

#### Scenario: State transitions
- **WHEN** `runWorkflow` executes
- **THEN** the job MUST transition through states in order: `created` → `running` → (`completed` | `failed`)

### Requirement: Runtime forwards events
The system SHALL emit job lifecycle events through the internal event bus during `runWorkflow` execution.

#### Scenario: Event emission during run
- **WHEN** `runWorkflow` transitions a job state
- **THEN** corresponding lifecycle events MUST be emitted via the event bus
