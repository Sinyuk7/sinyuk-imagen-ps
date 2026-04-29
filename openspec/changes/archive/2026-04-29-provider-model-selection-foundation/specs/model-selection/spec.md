## ADDED Requirements

### Requirement: Model selection three-tier priority
The system SHALL resolve the effective model for a provider dispatch using a three-tier priority chain: (1) job input explicit model via `request.providerOptions.model`, (2) provider profile `config.defaultModel`, (3) provider implementation fallback default. A higher-priority tier SHALL always override a lower-priority tier.

#### Scenario: Job input explicit model overrides profile default
- **WHEN** job input provides `providerOptions.model` as `"explicit-model"`
- **AND** the targeted provider profile has `config.defaultModel` set to `"profile-default"`
- **THEN** the effective model for dispatch SHALL be `"explicit-model"`

#### Scenario: Profile default model used when no explicit model in job input
- **WHEN** job input does not provide `providerOptions.model`
- **AND** the targeted provider profile has `config.defaultModel` set to `"profile-default"`
- **THEN** the effective model for dispatch SHALL be `"profile-default"`

#### Scenario: Provider fallback default used when no explicit or profile default model
- **WHEN** job input does not provide `providerOptions.model`
- **AND** the targeted provider profile does not have `config.defaultModel`
- **THEN** the effective model for dispatch SHALL be the provider implementation's hardcoded fallback default

#### Scenario: Different profiles select different default models
- **WHEN** profile A has `config.defaultModel` set to `"model-a"`
- **AND** profile B has `config.defaultModel` set to `"model-b"`
- **AND** two dispatches target profile A and profile B respectively without explicit model in job input
- **THEN** the first dispatch SHALL use `"model-a"` as the effective model
- **AND** the second dispatch SHALL use `"model-b"` as the effective model

### Requirement: Profile-aware dispatch adapter injects defaultModel into providerOptions
The profile-aware dispatch adapter SHALL inject the resolved provider config's `defaultModel` into the request's `providerOptions.model` when dispatching a profile-targeted request. The adapter reads `defaultModel` from `resolvedConfig.providerConfig` (the result of `ProviderConfigResolver.resolve()`). Injection SHALL only occur when the job input does not already provide an explicit `providerOptions.model`. The adapter MUST NOT mutate the original params object. The adapter MUST handle both params structures: (a) params containing a `request` key whose value is the request object, and (b) params where the entire object (excluding `signal`) is treated as the request.

#### Scenario: Inject defaultModel when providerOptions.model is absent
- **WHEN** profile-aware dispatch adapter dispatches a request for a profile whose resolved `providerConfig.defaultModel` is `"injected-model"`
- **AND** the request's `providerOptions.model` is not provided
- **THEN** the adapter SHALL create a new params object with `providerOptions.model` set to `"injected-model"` in the request portion

#### Scenario: Preserve explicit providerOptions.model
- **WHEN** profile-aware dispatch adapter dispatches a request for a profile with `config.defaultModel` set to `"profile-model"`
- **AND** the request params contain `providerOptions.model` set to `"explicit-model"`
- **THEN** the adapter SHALL NOT overwrite `providerOptions.model`
- **AND** the effective `providerOptions.model` SHALL remain `"explicit-model"`

#### Scenario: No defaultModel in profile config
- **WHEN** profile-aware dispatch adapter dispatches a request for a profile without `config.defaultModel`
- **AND** the request params do not contain `providerOptions.model`
- **THEN** the adapter SHALL NOT inject any model value into `providerOptions`

### Requirement: Profile update takes effect on next dispatch
When a provider profile's `config.defaultModel` is updated, the next dispatch targeting that profile SHALL use the updated default model without requiring runtime reconstruction.

#### Scenario: Updated profile defaultModel reflects immediately
- **WHEN** profile A has `config.defaultModel` set to `"model-v1"`
- **AND** a dispatch targeting profile A returns result with effective model `"model-v1"`
- **AND** profile A is updated to set `config.defaultModel` to `"model-v2"`
- **THEN** the next dispatch targeting profile A SHALL return result with effective model `"model-v2"`
