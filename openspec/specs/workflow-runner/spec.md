# Workflow Runner

## Purpose

定义 workflow runner 的执行行为：顺序执行 `provider` step、input binding、output handoff、生命周期事件发射、immutability 保证。

## Requirements

### Requirement: Workflow runner executes provider steps sequentially
The system SHALL execute workflow steps in declaration order. Each step MUST complete before the next step begins.

#### Scenario: Successful sequential execution
- **WHEN** a workflow with two provider steps is submitted
- **THEN** the second step MUST start only after the first step completes

### Requirement: Input binding resolves prior step outputs
The system SHALL resolve input values that reference prior step outputs using binding syntax before passing them to the step execution.

#### Scenario: Binding resolution
- **WHEN** a step input contains a reference to a prior step's outputKey
- **THEN** the referenced value MUST be substituted into the input before execution

#### Scenario: Unbound keys pass through unchanged
- **WHEN** a step input contains no matching prior outputKey
- **THEN** the input value MUST pass through without modification

### Requirement: Output handoff publishes step results
The system SHALL publish each step's execution result under its configured outputKey for downstream binding.

#### Scenario: Named outputKey
- **WHEN** a step defines an explicit outputKey
- **THEN** the result MUST be published under that key

#### Scenario: Default outputKey
- **WHEN** a step omits outputKey
- **THEN** the result MUST be published under the step's name

### Requirement: Job lifecycle events are emitted
The system SHALL emit job lifecycle events at state transitions during workflow execution.

#### Scenario: Execution starts
- **WHEN** workflow execution begins for a job
- **THEN** a `running` event MUST be emitted for that job

#### Scenario: Execution succeeds
- **WHEN** all workflow steps complete successfully
- **THEN** a `completed` event MUST be emitted for that job

#### Scenario: Execution fails
- **WHEN** any step fails during execution
- **THEN** a `failed` event MUST be emitted for that job

### Requirement: Only provider steps are executable
The system SHALL reject or skip step kinds other than `provider`.

#### Scenario: Unsupported step kind
- **WHEN** a workflow contains a step with kind `transform` or `io`
- **THEN** the system MUST throw a `JobError` with category `workflow`

### Requirement: All outputs remain immutable
The system SHALL ensure that step outputs and final job outputs are immutable after creation.

#### Scenario: Output immutability
- **WHEN** a step produces an output object
- **THEN** the output MUST be frozen before handoff to downstream steps
