# Builtin Workflow Contract

## Purpose

Define the stable minimal contract exposed by builtin provider workflows so upper layers can rely on a consistent request shape, output key, and adapter compatibility baseline.

## Requirements

### Requirement: Builtin generate workflow exposes a stable minimal request contract
The system SHALL provide a builtin workflow named `provider-generate` whose single `provider` step binds a stable minimal request contract for image generation.

#### Scenario: Generate workflow binds provider and prompt
- **WHEN** a consumer loads the exported `provider-generate` workflow
- **THEN** the workflow MUST contain exactly one `provider` step
- **THEN** that step MUST bind `${provider}` to the dispatched provider identifier
- **THEN** that step MUST bind `${prompt}` to `request.prompt`
- **THEN** that step MUST set `request.operation` to `generate`

### Requirement: Builtin edit workflow exposes a stable minimal request contract
The system SHALL provide a builtin workflow named `provider-edit` whose single `provider` step binds a stable minimal request contract for image editing.

#### Scenario: Edit workflow binds provider, prompt, and input assets
- **WHEN** a consumer loads the exported `provider-edit` workflow
- **THEN** the workflow MUST contain exactly one `provider` step
- **THEN** that step MUST bind `${provider}` to the dispatched provider identifier
- **THEN** that step MUST bind `${prompt}` to `request.prompt`
- **THEN** that step MUST bind `${inputAssets}` to `request.inputAssets`
- **THEN** that step MUST set `request.operation` to `edit`

### Requirement: Tentative fields are explicitly excluded from the current stable contract
The system SHALL NOT claim the following fields as stable in the current builtin workflow contract. They MAY exist in underlying provider schemas but are not guaranteed by this contract until a subsequent change converges them.

#### Scenario: Tentative fields are documented
- **WHEN** a consumer inspects the stable contract for `provider-generate` or `provider-edit`
- **THEN** `maskAsset`, `output`, and `providerOptions` MUST be listed as tentative
- **AND** the contract MUST NOT require callers to supply them
- **AND** the contract MUST NOT guarantee their binding behavior or output semantics at this stage

### Requirement: Builtin provider workflows publish results under a stable output key
The system SHALL publish the primary result of both builtin provider workflows under the same stable output key so upper layers can consume them without workflow-specific branching.

#### Scenario: Generate workflow uses stable output key
- **WHEN** `provider-generate` completes successfully
- **THEN** its provider step output MUST be published under `image`

#### Scenario: Edit workflow uses stable output key
- **WHEN** `provider-edit` completes successfully
- **THEN** its provider step output MUST be published under `image`

### Requirement: Builtin workflow contracts remain directly consumable by runtime and bridge adapters
The system SHALL keep builtin workflow contracts compatible with the existing `core-engine` runtime assembly and provider dispatch bridge without introducing host-specific transformation logic inside `packages/workflows`.

#### Scenario: Runtime accepts builtin workflows directly
- **WHEN** builtin workflows are registered through `createRuntime({ initialWorkflows })`
- **THEN** the runtime MUST accept them without additional workflow normalization outside `packages/workflows`

#### Scenario: Provider bridge accepts dispatched request shape
- **WHEN** a builtin workflow dispatches its minimal request contract through a provider bridge adapter
- **THEN** the dispatched `params` MUST contain `provider` equal to the bound provider identifier
- **AND** `params.request.operation` MUST equal the workflow's declared operation (`generate` or `edit`)
- **AND** `params.request.prompt` MUST equal the bound prompt value
- **AND** for `provider-edit`, `params.request.inputAssets` MUST equal the bound input assets
- **AND** the adapter MUST be able to consume these fields without additional workflow-side transformation
