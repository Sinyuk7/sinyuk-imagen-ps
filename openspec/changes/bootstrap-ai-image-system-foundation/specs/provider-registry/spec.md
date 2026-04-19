## ADDED Requirements

### Requirement: Providers are registered by stable identifiers with declared capabilities
The system SHALL register providers under unique identifiers that hosts and workflows can reference at job submission time. Each provider definition SHALL declare its supported capability set and expose a stable lookup contract.

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

### Requirement: Provider outputs normalize into a stable shared result envelope
The provider contract SHALL return a stable `ProviderResult` envelope containing declared output payload, output asset descriptors when produced, and diagnostics. Provider-specific remote response shapes SHALL NOT leak past the provider boundary without conversion into that envelope.

#### Scenario: Provider receives a remote response with provider-specific structure
- **WHEN** the remote API returns provider-specific fields or transport wrappers
- **THEN** the provider converts that response into the shared `ProviderResult` envelope before returning to the workflow runtime

### Requirement: Provider boundary transforms are optional and tightly scoped
The provider contract SHALL support optional `transformInput` and `transformOutput` hooks to adapt payloads at the provider boundary only. These transforms SHALL NOT mutate engine state, rewrite workflow definitions, or normalize cross-provider semantics on behalf of the engine.

#### Scenario: Provider needs payload adaptation before remote invocation
- **WHEN** a provider receives a validated workflow payload that requires reshaping before remote invocation
- **THEN** `transformInput` converts the validated provider input into the provider call payload
- **THEN** the original validated provider input remains unchanged for diagnostics

#### Scenario: Provider needs payload adaptation after remote invocation
- **WHEN** a provider returns raw remote response data
- **THEN** `transformOutput` converts that response into the shared `ProviderResult` envelope expected by downstream workflow steps
- **THEN** the engine does not reinterpret provider-specific semantics after the transform

### Requirement: Provider failures remain distinct from engine failures
Timeout, retry, and remote failure behavior SHALL be owned by the provider implementation or its configuration. The engine SHALL surface resulting failures as structured provider failures rather than reclassifying them as workflow or host failures.

#### Scenario: Provider remote call times out
- **WHEN** a provider invocation exceeds its configured timeout or exhausts retry policy
- **THEN** the provider returns or throws a structured provider failure
- **THEN** the engine records that failure with a provider-specific category rather than a generic unknown error
