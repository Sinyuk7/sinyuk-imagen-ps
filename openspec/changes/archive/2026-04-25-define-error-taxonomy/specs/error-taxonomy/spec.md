## ADDED Requirements

### Requirement: JobError provides a unified error structure
The system SHALL provide a `JobError` type that represents a serializable, categorized error within the runtime.

#### Scenario: JobError contains category, message, and optional details
- **WHEN** a `JobError` is constructed
- **THEN** it SHALL have a `category` field of type `ErrorCategory`
- **AND** it SHALL have a `message` field of type `string`
- **AND** it MAY have a `details` field of type `Record<string, unknown>`

### Requirement: ErrorCategory covers common runtime failure domains
The system SHALL provide an `ErrorCategory` union type that classifies failures into distinct domains.

#### Scenario: ErrorCategory includes validation, provider, runtime, workflow, and unknown
- **WHEN** an error category is assigned
- **THEN** it SHALL be assignable to `'validation' | 'provider' | 'runtime' | 'workflow' | 'unknown'`

### Requirement: Factory functions ensure consistent error construction
The system SHALL provide factory functions for each `ErrorCategory` to ensure consistent `JobError` creation.

#### Scenario: createValidationError constructs a validation error
- **WHEN** `createValidationError` is called with a message and optional details
- **THEN** it SHALL return a `JobError` with `category` set to `'validation'`

#### Scenario: createProviderError constructs a provider error
- **WHEN** `createProviderError` is called with a message and optional details
- **THEN** it SHALL return a `JobError` with `category` set to `'provider'`

#### Scenario: createRuntimeError constructs a runtime error
- **WHEN** `createRuntimeError` is called with a message and optional details
- **THEN** it SHALL return a `JobError` with `category` set to `'runtime'`

#### Scenario: createWorkflowError constructs a workflow error
- **WHEN** `createWorkflowError` is called with a message and optional details
- **THEN** it SHALL return a `JobError` with `category` set to `'workflow'`

#### Scenario: createUnknownError constructs an unknown error
- **WHEN** `createUnknownError` is called with a message and optional details
- **THEN** it SHALL return a `JobError` with `category` set to `'unknown'`

### Requirement: JobError remains serializable and host-agnostic
All error types and factory functions defined in `core-engine` SHALL remain serializable and free of host-specific dependencies.

#### Scenario: JobError contains no functions or host objects
- **WHEN** inspecting any exported `JobError` or factory function from `packages/core-engine/src/errors.ts`
- **THEN** `JobError` SHALL NOT contain function types in its public fields
- **AND** it SHALL NOT reference `Document`, `Layer`, `Window`, `FileSystem`, or network types

#### Scenario: Factory functions return plain objects
- **WHEN** a factory function is invoked
- **THEN** it SHALL return a plain object satisfying the `JobError` interface
- **AND** the result SHALL be safe to pass through `JSON.stringify` / `JSON.parse`

### Requirement: Error types are exported from module entry
All public error types and factory functions SHALL be re-exported from `packages/core-engine/src/index.ts`.

#### Scenario: Consumers import error utilities from module root
- **WHEN** a consumer imports from `@imagen-ps/core-engine`
- **THEN** it SHALL be able to access `JobError`, `ErrorCategory`, and all factory functions
- **AND** the module SHALL compile without errors after the export update
