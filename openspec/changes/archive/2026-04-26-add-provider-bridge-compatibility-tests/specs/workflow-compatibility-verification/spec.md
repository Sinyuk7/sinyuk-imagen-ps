## ADDED Requirements

### Requirement: Workflow compatibility verification SHALL cover boundary input shapes
`packages/workflows/tests/` MUST 提供跨包兼容性测试，覆盖 builtin workflow 在边界输入下的 shape 行为，以便尽早暴露 workflow contract 与 runtime / provider bridge 的不一致。

#### Scenario: Generate workflow boundary inputs are covered
- **WHEN** the compatibility suite runs for `provider-generate`
- **THEN** it MUST cover missing optional fields such as `providerOptions` and `output`
- **AND** it MUST cover extra job input fields being passed through or ignored according to the current contract

#### Scenario: Edit workflow boundary inputs are covered
- **WHEN** the compatibility suite runs for `provider-edit`
- **THEN** it MUST cover an empty `inputAssets` array
- **AND** it MUST cover missing optional fields without treating them as contract violations

### Requirement: Workflow compatibility verification SHALL cover deep-freeze and immutability after runtime assembly
The compatibility suite MUST verify that builtin workflows remain immutable after being registered and executed through `core-engine` runtime assembly.

#### Scenario: Runtime assembly preserves frozen workflow specs
- **WHEN** `builtinWorkflows` are passed to `createRuntime({ initialWorkflows })`
- **THEN** the registered workflow objects MUST remain frozen
- **AND** runtime execution MUST NOT mutate the registered workflow registry entries

### Requirement: Workflow compatibility verification SHALL cover mock provider error paths
The compatibility suite MUST verify the current error-path behavior of the `mock provider` bridge adapter.

#### Scenario: Dispatch failure is covered
- **WHEN** `mock provider` is configured with `failMode: { type: 'always' }`
- **THEN** the suite MUST observe a structured provider error for `provider-generate`

#### Scenario: Validation failure is covered
- **WHEN** job input is missing required fields such as `prompt`
- **THEN** the suite MUST observe a structured validation error

#### Scenario: Provider lookup failure is covered
- **WHEN** the runtime executes `provider-generate` without a registered `mock` adapter
- **THEN** the suite MUST observe a clear provider-not-found failure

### Requirement: Workflow compatibility verification SHALL cover one real provider bridge happy path and current edit rejection boundary
The compatibility suite MUST include at least one real provider bridge adapter scenario and MUST NOT treat unsupported operations as success coverage.

#### Scenario: OpenAI-compatible generate path is covered
- **WHEN** the suite runs `provider-generate` through an `openai-compatible` bridge adapter
- **THEN** it MUST verify that the workflow-emitted request shape is consumable without triggering real HTTP

#### Scenario: OpenAI-compatible edit boundary is covered
- **WHEN** the suite runs `provider-edit` through the current `openai-compatible` provider
- **THEN** it MUST observe the existing pre-transport rejection
- **AND** it MUST record that result as a compatibility boundary, not as a happy path
