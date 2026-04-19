## ADDED Requirements

### Requirement: Workflows execute steps in declared order
The system SHALL execute workflow steps sequentially in the order declared by `WorkflowSpec.steps`.

#### Scenario: Multi-step workflow runs
- **WHEN** a workflow contains multiple provider, transform, or IO steps
- **THEN** the runtime executes each step one at a time in declaration order
- **THEN** the next step does not begin until the previous step has completed

### Requirement: Step inputs are immutable and step state is isolated
The runtime SHALL pass each step an immutable input value and SHALL NOT expose transient state from one step directly to another except through explicit step outputs.

#### Scenario: Step attempts hidden state sharing
- **WHEN** a workflow step completes
- **THEN** only its declared output is eligible to become the next step input
- **THEN** no hidden mutable state is shared across subsequent steps

### Requirement: Workflow runtime supports provider, transform, and IO steps
The runtime SHALL support step kinds for provider invocation, pure data transformation, and adapter-backed IO operations.

#### Scenario: Workflow mixes step kinds
- **WHEN** a workflow includes provider, transform, and IO steps in one pipeline
- **THEN** the runtime dispatches each step according to its declared kind
- **THEN** the final workflow result reflects the ordered composition of all step outputs

### Requirement: Runtime cleans up resources on completion or failure
The runtime SHALL require step execution to release temporary resources after completion and SHALL stop further execution after a terminal step failure.

#### Scenario: Mid-pipeline failure occurs
- **WHEN** a step fails after earlier steps have allocated temporary resources
- **THEN** the runtime marks the workflow as failed
- **THEN** later steps are not executed
- **THEN** cleanup hooks or equivalent release logic are invoked before control returns to the engine
