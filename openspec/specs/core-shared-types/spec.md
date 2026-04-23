## Purpose

定义 `core-engine` 的共享运行时类型契约，包括 Job、Workflow、Step、ProviderRef、Asset 等核心类型。为 store、events、runner、dispatch 提供稳定的类型地基。

## ADDED Requirements

### Requirement: Job state model covers full lifecycle
The system SHALL provide a `Job` type that represents a unit of work with a defined lifecycle status.

#### Scenario: Job status transitions
- **WHEN** a job is created
- **THEN** its `status` field SHALL be assignable to `'created' | 'running' | 'completed' | 'failed'`

#### Scenario: Job carries input and output
- **WHEN** a job is defined
- **THEN** it SHALL have an `input` field of type `Record<string, unknown>`
- **AND** it SHALL have an `output` field that is either `Record<string, unknown>` or `undefined`

### Requirement: Workflow model supports declarative step ordering
The system SHALL provide a `Workflow` type that defines an ordered sequence of steps.

#### Scenario: Workflow contains named steps
- **WHEN** a workflow is defined
- **THEN** it SHALL have a `steps` array
- **AND** each step SHALL have a `name` and a `kind`

#### Scenario: Step kind identifies execution type
- **WHEN** a step is defined
- **THEN** its `kind` field SHALL be assignable to `'provider' | 'transform' | 'io'`
- **AND** `'transform'` and `'io'` SHALL be treated as reserved values without execution semantics at this stage

### Requirement: Provider dispatch boundary is abstract
The system SHALL provide a `ProviderRef` type and a `ProviderDispatcher` type that form an abstract boundary for provider invocation.

#### Scenario: ProviderRef identifies a provider
- **WHEN** a provider reference is created
- **THEN** it SHALL contain a `provider` name of type `string`
- **AND** it SHALL contain a `params` object of type `Record<string, unknown>`

#### Scenario: ProviderDispatcher is a callable abstraction
- **WHEN** a provider dispatcher is defined
- **THEN** it SHALL be a function type that accepts a `ProviderRef` and returns a serializable result
- **AND** it SHALL NOT contain provider-specific HTTP or validation logic

### Requirement: Asset model supports image resources
The system SHALL provide an `Asset` type that represents a host-agnostic resource.

#### Scenario: Asset has a type and data
- **WHEN** an asset is defined
- **THEN** it SHALL have a `type` field (e.g., `'image'`)
- **AND** it SHALL have a data field that can hold a URL string or binary data placeholder
- **AND** it SHALL NOT reference DOM, UXP, or Photoshop-specific types

### Requirement: Types are serializable and host-agnostic
All types defined in `core-engine` SHALL be serializable and free of host-specific dependencies.

#### Scenario: Types contain no functions or host objects
- **WHEN** inspecting any exported type from `packages/core-engine/src/types/`
- **THEN** it SHALL NOT contain function types in its public fields
- **AND** it SHALL NOT reference `Document`, `Layer`, `Window`, `FileSystem`, or network types

#### Scenario: Types are immutable-friendly
- **WHEN` a job or workflow object is constructed
- **THEN** its fields SHOULD be read-only or shallow-frozen compatible
- **AND** step output handoff between steps SHALL be treated as immutable in type design

### Requirement: Types are exported from module entry
All public types SHALL be re-exported from `packages/core-engine/src/index.ts`.

#### Scenario: Consumers import from module root
- **WHEN** a consumer imports from `@imagen-ps/core-engine`
- **THEN** it SHALL be able to access `Job`, `Workflow`, `Step`, `ProviderRef`, `Asset`, and their associated types
- **AND** the module SHALL compile without errors after the export update
