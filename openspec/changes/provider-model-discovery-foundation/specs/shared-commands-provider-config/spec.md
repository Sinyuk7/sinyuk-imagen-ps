## MODIFIED Requirements

### Requirement: Provider profile lifecycle commands

`@imagen-ps/shared-commands` SHALL expose provider profile lifecycle commands for listing, reading, saving, deleting, and testing configured provider profiles. These commands MUST use injected repository and secret abstractions and MUST NOT directly access UXP APIs, DOM APIs, Node filesystem, `path`, `os`, or environment variables.

`saveProviderProfile(input)` MUST NOT accept `models` as part of `ProviderProfileInput`. The compile-time `ProviderProfileInput` type MUST NOT declare a `models` field. The runtime implementation MUST NOT read any `models` value from the input object even when callers bypass typing; if a previously persisted profile has a `models` value, the implementation SHALL preserve that value as-is and SHALL NOT replace it from input. `ProviderProfile.models` SHALL remain typed as `readonly ProviderModelInfo[] | undefined` and is populated exclusively by `refreshProfileModels`.

#### Scenario: List provider profiles

- **WHEN** `listProviderProfiles()` is called
- **THEN** it SHALL return configured provider profiles from the injected provider profile repository
- **AND** returned values MUST NOT include secret values

#### Scenario: Get provider profile

- **WHEN** `getProviderProfile(profileId)` is called for an existing profile
- **THEN** it SHALL return that provider profile without secret values

#### Scenario: Save provider profile

- **WHEN** `saveProviderProfile(input)` is called with valid non-secret config and secret input
- **THEN** it SHALL persist non-secret profile data through the provider profile repository
- **AND** it SHALL persist sensitive values through the injected secret storage abstraction
- **AND** it SHALL return a `CommandResult` without secret values

#### Scenario: Save provider profile rejects models field at compile time

- **WHEN** TypeScript code attempts to pass a `models` property as part of `ProviderProfileInput` to `saveProviderProfile`
- **THEN** the type system MUST reject the call as a type error
- **AND** the published `ProviderProfileInput` type MUST NOT declare a `models` field

#### Scenario: Save provider profile preserves existing models cache

- **WHEN** `saveProviderProfile(input)` updates an existing profile whose persisted `models` cache is `[{ id: 'mock-image-v1' }]`
- **AND** the input does not (and per typing cannot) carry any `models` field
- **THEN** the persisted profile after save MUST still have `models = [{ id: 'mock-image-v1' }]`

#### Scenario: Delete provider profile

- **WHEN** `deleteProviderProfile(profileId)` is called for an existing profile
- **THEN** it SHALL delete the profile from the provider profile repository
- **AND** it SHALL delete associated secrets by default unless the caller explicitly requests retain-secrets mode

## ADDED Requirements

### Requirement: listProfileModels command

`@imagen-ps/shared-commands` SHALL expose `listProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>>` for surface-agnostic retrieval of the model candidate list of a provider profile.

The command MUST resolve candidates via a fixed fallback chain, returning the first non-empty array:

1. The persisted `profile.models` discovery cache.
2. The `ProviderDescriptor.defaultModels` of the implementation referenced by `profile.providerId`.
3. The empty array `[]`.

The command MUST NOT perform any network or upstream call. It MUST NOT mutate the persisted profile. It MUST NOT annotate the result with `source`, `fetchedAt`, `fetchStatus`, or any equivalent provenance metadata; the return value SHALL be exactly `readonly ProviderModelInfo[]`.

If the profile id does not resolve to a persisted profile, the command MUST return `{ ok: false, error: JobError }` with `error.category === 'validation'`. If the profile resolves but its `providerId` does not map to any registered provider implementation, the command MUST return the same shape of validation error.

#### Scenario: Returns persisted discovery cache when present

- **WHEN** `listProfileModels(profileId)` is called and `profile.models` is `[{ id: 'gpt-image-1' }]`
- **THEN** it SHALL return `{ ok: true, value: [{ id: 'gpt-image-1' }] }`
- **AND** it SHALL NOT consult `descriptor.defaultModels`

#### Scenario: Falls back to implementation defaultModels

- **WHEN** `listProfileModels(profileId)` is called and `profile.models` is `undefined` or `[]`
- **AND** the implementation declares `defaultModels: [{ id: 'mock-image-v1' }]`
- **THEN** it SHALL return `{ ok: true, value: [{ id: 'mock-image-v1' }] }`

#### Scenario: Returns empty array when neither source has candidates

- **WHEN** `listProfileModels(profileId)` is called and both `profile.models` and `descriptor.defaultModels` are absent or empty
- **THEN** it SHALL return `{ ok: true, value: [] }`

#### Scenario: Profile id does not exist

- **WHEN** `listProfileModels('does-not-exist')` is called
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Provider implementation missing for profile

- **WHEN** `listProfileModels(profileId)` is called and `profile.providerId` is not registered in the provider registry
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Result carries no provenance metadata

- **WHEN** any successful `listProfileModels(profileId)` result is inspected
- **THEN** the value MUST be exactly `readonly ProviderModelInfo[]`
- **AND** it MUST NOT carry `source`, `fetchedAt`, `fetchStatus`, or any equivalent annotation

### Requirement: refreshProfileModels command

`@imagen-ps/shared-commands` SHALL expose `refreshProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>>` to drive a single discovery attempt against the provider implementation and persist the result into `profile.models`.

The command MUST resolve the profile's runtime `ProviderConfig` through the same path as `testProviderProfile` (via the injected `ProviderConfigResolver`). It MUST then look up the registered provider implementation via `profile.providerId` and invoke its `discoverModels(config)` method.

On success, the command MUST overwrite `profile.models` with the returned list (including writing an empty list if discovery legitimately returns no candidates) and MUST return `{ ok: true, value: <returnedList> }`.

If the implementation does not implement `discoverModels`, the command MUST return `{ ok: false, error: JobError }` with `error.category === 'validation'` and MUST NOT modify `profile.models`. If `discoverModels` throws, the command MUST return `{ ok: false, error: JobError }` with `error.category === 'provider'` and MUST NOT modify `profile.models`. The error MUST NOT include any secret value resolved during runtime config assembly.

The command MUST NOT persist any failure metadata onto the profile (no `lastFetchError`, no `fetchStatus`, no `fetchedAt`).

#### Scenario: Discovery succeeds and overwrites cache

- **WHEN** `refreshProfileModels(profileId)` is called and the implementation returns `[{ id: 'gpt-image-1' }, { id: 'dall-e-3' }]`
- **THEN** the command SHALL return `{ ok: true, value: [{ id: 'gpt-image-1' }, { id: 'dall-e-3' }] }`
- **AND** the persisted `profile.models` SHALL equal that list afterwards

#### Scenario: Implementation does not support discovery

- **WHEN** `refreshProfileModels(profileId)` is called and the implementation does not implement `discoverModels`
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** the persisted `profile.models` SHALL remain unchanged from before the call

#### Scenario: Discovery throws

- **WHEN** `refreshProfileModels(profileId)` is called and `implementation.discoverModels(config)` throws
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'provider'`
- **AND** the persisted `profile.models` SHALL remain unchanged from before the call
- **AND** the error MUST NOT include any secret value

#### Scenario: Discovery returns empty list

- **WHEN** `refreshProfileModels(profileId)` is called and the implementation returns `[]`
- **THEN** the command SHALL return `{ ok: true, value: [] }`
- **AND** the persisted `profile.models` SHALL be set to `[]` afterwards

#### Scenario: Profile id does not exist

- **WHEN** `refreshProfileModels('does-not-exist')` is called
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

### Requirement: setProfileDefaultModel command

`@imagen-ps/shared-commands` SHALL expose `setProfileDefaultModel(profileId: string, modelId: string): Promise<CommandResult<ProviderProfile>>` to assign a profile's `config.defaultModel` under strict candidate validation.

The command MUST first call `listProfileModels(profileId)` to obtain the authoritative candidate list (via the fallback chain). It MUST then assert `modelId` is the `id` of one of those candidates. If the candidate list is empty, every `modelId` value MUST be rejected.

On candidate match, the command MUST persist the updated profile via `saveProviderProfile`-equivalent semantics (preserving all other config fields, secret refs, models cache, timestamps), with `config.defaultModel` set to `modelId`. It MUST return `{ ok: true, value: <updatedProfile> }`.

On candidate miss, the command MUST return `{ ok: false, error: JobError }` with `error.category === 'validation'`. The error message MUST identify the offending `modelId` and SHOULD reference how to obtain a valid candidate list. The persisted profile MUST NOT be modified on failure.

This command MUST NOT provide any bypass mechanism (no force flag, no override option). Surface-side adaptations such as CLI command wrappers MUST NOT add such a bypass.

#### Scenario: Sets default model that exists in cache

- **WHEN** `setProfileDefaultModel(profileId, 'gpt-image-1')` is called
- **AND** `listProfileModels(profileId)` returns `[{ id: 'gpt-image-1' }, { id: 'dall-e-3' }]`
- **THEN** the command SHALL return `{ ok: true, value: <updatedProfile> }`
- **AND** the persisted `profile.config.defaultModel` SHALL be `'gpt-image-1'`

#### Scenario: Sets default model that exists only via implementation defaultModels

- **WHEN** `setProfileDefaultModel(profileId, 'mock-image-v1')` is called
- **AND** `profile.models` is `undefined`
- **AND** the implementation declares `defaultModels: [{ id: 'mock-image-v1' }]`
- **THEN** the command SHALL return `{ ok: true, value: <updatedProfile> }`
- **AND** the persisted `profile.config.defaultModel` SHALL be `'mock-image-v1'`

#### Scenario: Rejects model not in candidate list

- **WHEN** `setProfileDefaultModel(profileId, 'unknown-model')` is called
- **AND** `listProfileModels(profileId)` returns `[{ id: 'gpt-image-1' }]`
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** the persisted profile SHALL NOT be modified

#### Scenario: Rejects every model when candidate list is empty

- **WHEN** `setProfileDefaultModel(profileId, 'anything')` is called
- **AND** `listProfileModels(profileId)` returns `[]`
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Profile id does not exist

- **WHEN** `setProfileDefaultModel('does-not-exist', 'gpt-image-1')` is called
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

### Requirement: setProfileEnabled command

`@imagen-ps/shared-commands` SHALL expose `setProfileEnabled(profileId: string, enabled: boolean): Promise<CommandResult<ProviderProfile>>` to flip the `enabled` flag of a profile without otherwise changing it.

The command MUST resolve the existing profile, set `enabled` to the given boolean, preserve all other fields including `config`, `secretRefs`, `models` cache, `createdAt`, and timestamps semantics consistent with `saveProviderProfile`. It MUST persist the updated profile through the injected repository.

If the profile id does not resolve to a persisted profile, the command MUST return `{ ok: false, error: JobError }` with `error.category === 'validation'`. The command MUST return `{ ok: true, value: <updatedProfile> }` on success.

#### Scenario: Enables a previously disabled profile

- **WHEN** `setProfileEnabled(profileId, true)` is called and `profile.enabled` is currently `false`
- **THEN** the command SHALL return `{ ok: true, value: <updatedProfile> }`
- **AND** the persisted `profile.enabled` SHALL be `true`
- **AND** all other persisted fields MUST be unchanged

#### Scenario: Disables a previously enabled profile

- **WHEN** `setProfileEnabled(profileId, false)` is called and `profile.enabled` is currently `true`
- **THEN** the command SHALL return `{ ok: true, value: <updatedProfile> }`
- **AND** the persisted `profile.enabled` SHALL be `false`

#### Scenario: Idempotent toggle when already in target state

- **WHEN** `setProfileEnabled(profileId, true)` is called and `profile.enabled` is already `true`
- **THEN** the command SHALL return `{ ok: true, value: <profile> }`
- **AND** the persisted `profile.enabled` SHALL remain `true`

#### Scenario: Profile id does not exist

- **WHEN** `setProfileEnabled('does-not-exist', true)` is called
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
