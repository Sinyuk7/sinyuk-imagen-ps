## MODIFIED Requirements

### Requirement: Builtin generate workflow exposes a stable minimal request contract
The system SHALL provide a builtin workflow named `provider-generate` whose single `provider` step binds a stable minimal request contract for image generation. The step SHALL bind `providerOptions` from job input to support model selection and other provider-specific options.

#### Scenario: Generate workflow binds provider, prompt, and providerOptions
- **WHEN** a consumer loads the exported `provider-generate` workflow
- **THEN** the workflow MUST contain exactly one `provider` step
- **THEN** that step MUST bind `${provider}` to the dispatched provider identifier
- **THEN** that step MUST bind `${prompt}` to `request.prompt`
- **THEN** that step MUST set `request.operation` to `generate`
- **THEN** that step MUST bind `${providerOptions}` to `request.providerOptions`

### Requirement: Tentative fields are explicitly excluded from the current stable contract
The system SHALL NOT claim the following fields as stable in the current builtin workflow contract. They MAY exist in underlying provider schemas but are not guaranteed by this contract until a subsequent change converges them. `providerOptions` is promoted from tentative to stable for the `provider-generate` workflow as part of this change.

#### Scenario: Tentative fields are documented
- **WHEN** a consumer inspects the stable contract for `provider-generate` or `provider-edit`
- **THEN** `maskAsset` and `output` MUST be listed as tentative
- **AND** the contract MUST NOT require callers to supply them
- **AND** the contract MUST NOT guarantee their binding behavior or output semantics at this stage
- **AND** `providerOptions` SHALL be considered stable for `provider-generate` binding
