## ADDED Requirements

### Requirement: Providers are registered by stable identifiers
The system SHALL register providers under unique identifiers that hosts and workflows can reference at job submission time.

#### Scenario: Job references a registered provider
- **WHEN** a job specifies a provider identifier that exists in the registry
- **THEN** the engine resolves the matching provider implementation before execution begins

#### Scenario: Job references an unknown provider
- **WHEN** a job specifies a provider identifier that is not registered
- **THEN** the engine rejects execution and marks the job as failed with an unknown-provider error

### Requirement: Providers validate runtime inputs with owned schemas
Each provider SHALL expose a runtime validation schema, and the system SHALL validate provider inputs against that schema before invoking the provider.

#### Scenario: Provider input is valid
- **WHEN** a job payload satisfies the selected provider schema
- **THEN** the provider invocation proceeds

#### Scenario: Provider input is invalid
- **WHEN** a job payload does not satisfy the selected provider schema
- **THEN** provider invocation does not begin
- **THEN** the job surfaces validation errors to the host

### Requirement: Provider parameter semantics remain provider-owned
The engine SHALL treat provider input as opaque data beyond schema validation and SHALL NOT normalize or reinterpret provider-specific parameter meaning.

#### Scenario: Different providers use different parameter shapes
- **WHEN** two providers define incompatible input schemas for similar generation tasks
- **THEN** each provider receives its own validated input shape without engine-level normalization

### Requirement: Providers may transform inputs or outputs at integration boundaries
The provider contract SHALL support optional `transformInput` and `transformOutput` hooks to adapt host or workflow payloads without changing engine behavior.

#### Scenario: Provider needs host payload adaptation
- **WHEN** a provider receives a payload that requires reshaping before remote invocation
- **THEN** `transformInput` can convert the validated engine payload into the provider call payload

#### Scenario: Provider returns host-facing result metadata
- **WHEN** a provider returns raw remote response data
- **THEN** `transformOutput` can normalize it into the workflow output expected by downstream steps
