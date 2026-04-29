## MODIFIED Requirements

### Requirement: Provider profile persistence model

The system SHALL define provider profile as the persisted representation of a user-configured provider instance, separate from provider implementation registration. A provider profile MUST include a stable `profileId`, `providerId`, `family`, `displayName`, `enabled` state, non-secret `config`, optional `secretRefs`, optional `models` (typed as `readonly ProviderModelInfo[]`), `createdAt`, and `updatedAt`. Persisted provider profiles MUST NOT contain secret values such as API keys or access tokens. `config` MUST be a JSON object containing only non-secret, family-specific settings; secret-bearing command inputs such as API keys MUST be written to secret storage and referenced from `secretRefs`.

`ProviderProfile.models` MUST have exactly one source of truth: the most recent successful `refreshProfileModels(profileId)` invocation. It SHALL NOT be written by `saveProviderProfile`, by direct user editing in lifecycle commands, or by any provider implementation invocation path. It SHALL NOT be read by the dispatch path or by `model-selection` priority resolution; it exists solely to back `listProfileModels` and surface-side model picker rendering.

The persisted profile MUST NOT carry any model fetch metadata such as `modelsFetchedAt`, `modelsFetchStatus`, `lastFetchError`, or `modelsSource`. A failed `refreshProfileModels` MUST leave the existing `profile.models` value unchanged and MUST NOT introduce any failure-state field.

This change does not require read-time migration for early local CLI config files.

#### Scenario: Persist profile without secret values

- **WHEN** a provider profile is saved with API key input
- **THEN** the persisted provider profile MUST contain a secret reference instead of the API key value
- **AND** the API key value MUST NOT appear in the ordinary profile JSON

#### Scenario: Multiple profiles use same implementation

- **WHEN** two provider profiles both use `family: 'openai-compatible'` with different profile ids and base URLs
- **THEN** the system SHALL treat them as two distinct provider profiles
- **AND** both profiles SHALL resolve through the same compiled provider implementation family

#### Scenario: Save secret input as reference

- **WHEN** a provider profile is saved with both non-secret settings and an `apiKey` secret input
- **THEN** `ProviderProfile.config` SHALL persist only non-secret settings
- **AND** the API key value SHALL be persisted through secret storage referenced by `ProviderProfile.secretRefs.apiKey`

#### Scenario: Profile models field is discovery cache only

- **WHEN** `saveProviderProfile(input)` is called and the surface attempts to populate `models`
- **THEN** the persisted profile MUST NOT carry any user-supplied model entries
- **AND** the persisted `models` field MUST remain unchanged from its previous value (or absent if the profile is new)

#### Scenario: Discovery cache persists only via refresh

- **WHEN** `refreshProfileModels(profileId)` succeeds and returns a non-empty list
- **THEN** the persisted profile `models` field MUST be set to that list
- **AND** subsequent `getProviderProfile(profileId)` MUST return that list as `profile.models`

#### Scenario: Profile carries no fetch status fields

- **WHEN** any caller reads a persisted provider profile
- **THEN** the profile object MUST NOT contain `modelsFetchedAt`, `modelsFetchStatus`, `lastFetchError`, `modelsSource`, or any equivalent fetch-state field

#### Scenario: Dispatch ignores profile.models

- **WHEN** a job is dispatched against a profile whose `models` cache is non-empty
- **THEN** dispatch path and `model-selection` priority resolution MUST NOT read `profile.models`
- **AND** model selection MUST continue to follow the documented three-tier priority (`request.providerOptions.model` > `config.defaultModel` > implementation-internal default)
