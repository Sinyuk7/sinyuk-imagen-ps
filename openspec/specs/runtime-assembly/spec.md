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

### Requirement: Runtime dispatch resolves provider profile config at call time
Runtime provider dispatch SHALL support resolving provider profile config at dispatch time instead of requiring all provider configs to be fixed during runtime initialization. Dispatch-time resolution SHALL use an injected provider config resolver and SHALL pass only resolved runtime config to provider validation and invocation.

#### Scenario: Saved profile update takes effect
- **WHEN** a provider profile is updated in repository storage before a workflow dispatch
- **THEN** the next dispatch for that profile SHALL resolve the latest profile config
- **AND** it SHALL not require reconstructing the entire runtime solely for config changes

#### Scenario: Dispatch with missing profile
- **WHEN** workflow dispatch targets a provider profile id that does not exist
- **THEN** runtime dispatch SHALL fail with a validation error
- **AND** the provider invoke function MUST NOT be called

### Requirement: Provider config resolver injection point
Runtime assembly SHALL provide an explicit injection point for provider config resolution in the shared runtime layer. The implementation MUST document whether the resolver is injected through setter-style shared-commands configuration or through a runtime assembly options object. Existing static provider adapter injection MUST remain compatible unless a separate breaking-change proposal removes it.

#### Scenario: Resolver injected before dispatch
- **WHEN** a provider config resolver is injected before a profile-targeted workflow dispatch
- **THEN** dispatch SHALL use that resolver to resolve the targeted profile config

#### Scenario: Static adapter path remains compatible
- **WHEN** existing tests or callers create runtime with static provider dispatch adapters
- **THEN** that path SHALL continue to work during this change
- **AND** profile-targeted resolution SHALL be additive rather than a silent breaking change

### Requirement: Runtime must not retain secret-bearing config as long-lived adapter state
Runtime assembly SHALL avoid storing secret-bearing resolved provider config in long-lived provider dispatch adapter state. Secret-bearing config SHOULD be scoped to validation and invocation for a dispatch, and MUST NOT be included in job input, provider descriptor output, or lifecycle events.

#### Scenario: Runtime lists providers
- **WHEN** runtime or shared commands list provider implementations or profiles
- **THEN** the returned descriptors/profiles MUST NOT include API key values or other secret values

#### Scenario: Provider invocation uses resolved secret
- **WHEN** dispatch invokes a provider that requires an API key
- **THEN** the API key MAY exist in memory only as part of the resolved config used for that invocation
- **AND** it MUST NOT be persisted into runtime adapter state after invocation completes

### Requirement: Dispatch target includes provider profile selection
Workflow dispatch input SHALL provide an explicit provider profile target when invoking a configured provider profile. The dispatch layer SHALL distinguish profile id from provider implementation id to support multiple profiles for the same provider family.

#### Scenario: Two profiles share same family
- **WHEN** two configured profiles use the same `openai-compatible` family
- **AND** workflow dispatch targets the second profile id
- **THEN** runtime dispatch SHALL resolve and invoke using the second profile's config
- **AND** it MUST NOT accidentally use the first profile's config

### Requirement: Provider config resolver cache invalidation
A provider config resolver MAY cache non-secret provider profile metadata. If it caches profile data, it MUST invalidate or bypass cached entries for a profile before the next successful `resolve(profileId)` result after that profile is saved or deleted. Secret values MUST NOT be cached as long-lived resolver state.

#### Scenario: Resolve after profile save
- **WHEN** a profile is saved with updated non-secret config
- **AND** the resolver previously cached that profile's metadata
- **THEN** the next successful `resolve(profileId)` SHALL reflect the updated profile config

#### Scenario: Resolve after profile delete
- **WHEN** a profile is deleted
- **AND** the resolver previously cached that profile's metadata
- **THEN** the next `resolve(profileId)` SHALL fail with a validation error rather than returning the deleted profile

