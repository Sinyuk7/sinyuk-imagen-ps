## MODIFIED Requirements

### Requirement: Builtin edit workflow exposes a stable minimal request contract
The system SHALL provide a builtin workflow named `provider-edit` whose single `provider` step binds a stable minimal request contract for image editing. The step SHALL also bind `providerProfileId` and `profileId` from job input to support profile-based dispatch.

#### Scenario: Edit workflow binds provider, prompt, and input assets
- **WHEN** a consumer loads the exported `provider-edit` workflow
- **THEN** the workflow MUST contain exactly one `provider` step
- **THEN** that step MUST bind `${provider}` to the dispatched provider identifier
- **THEN** that step MUST bind `${prompt}` to `request.prompt`
- **THEN** that step MUST bind `${inputAssets}` to `request.inputAssets`
- **THEN** that step MUST set `request.operation` to `edit`

#### Scenario: Edit workflow binds profile identifiers for dispatch
- **WHEN** a consumer loads the exported `provider-edit` workflow
- **THEN** that step MUST bind `${providerProfileId}` to `providerProfileId`
- **AND** that step MUST bind `${profileId}` to `profileId`
- **AND** the binding MUST resolve to the literal placeholder string when the corresponding job input field is absent (handled by adapter-time logic in `createProfileAwareDispatchAdapter`)

## ADDED Requirements

### Requirement: Profile dispatch works for provider-edit through submitJob
The system SHALL allow `submitJob({ workflow: 'provider-edit', input: { profileId: 'xxx', prompt: '...', inputAssets: [...] } })` to successfully route through the profile-aware dispatch adapter, using the same `resolveProfileId` + `createProfileAwareDispatchAdapter` chain as `provider-generate`.

#### Scenario: Submit edit job with only profileId
- **WHEN** a consumer calls `submitJob({ workflow: 'provider-edit', input: { profileId: 'test-profile', prompt: 'edit test', inputAssets: [...] } })`
- **THEN** the `submit-job` command MUST auto-detect profile dispatch and inject `provider: 'profile'`
- **AND** the profile-aware adapter MUST resolve the profile
- **AND** the job MUST complete with `status: 'completed'`

#### Scenario: Submit edit job with explicit providerProfileId
- **WHEN** a consumer calls `submitJob({ workflow: 'provider-edit', input: { provider: 'profile', providerProfileId: 'test-profile', prompt: 'edit test', inputAssets: [...] } })`
- **THEN** the profile-aware adapter MUST prefer `providerProfileId` over `profileId`
- **AND** the job MUST complete with `status: 'completed'`
