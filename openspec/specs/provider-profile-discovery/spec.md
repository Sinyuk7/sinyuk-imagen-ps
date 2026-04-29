# provider-profile-discovery Specification

## Purpose
TBD - created by archiving change provider-storage-discovery-foundation. Update Purpose after archive.
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

### Requirement: Provider profile repository
The system SHALL provide a provider profile repository abstraction for listing, reading, saving, and deleting provider profiles. The repository contract MUST be host-agnostic and MUST NOT expose UXP `File`, `Folder`, `Entry`, token objects, Node filesystem, DOM, or Photoshop-specific types.

#### Scenario: List configured profiles
- **WHEN** provider profile discovery lists profiles from repository storage
- **THEN** it SHALL return all persisted provider profiles visible to the injected repository adapter
- **AND** returned profiles MUST NOT include secret values

#### Scenario: Delete configured profile
- **WHEN** a provider profile is deleted by `profileId`
- **THEN** subsequent repository reads for that `profileId` SHALL return no profile
- **AND** associated secret cleanup SHALL follow the provider profile secret deletion policy

### Requirement: Provider profile secret deletion policy
The system SHALL define explicit secret deletion behavior for provider profile deletion. `deleteProviderProfile(profileId)` MUST default to deleting all secrets directly referenced by that profile. A caller MAY explicitly request `retain-secrets` mode; in that mode the profile is deleted while referenced secret values are retained. Retained secret values MUST NOT be returned in the command result.

#### Scenario: Delete profile and associated secrets by default
- **WHEN** `deleteProviderProfile(profileId)` is called without a retain-secrets option
- **THEN** the system SHALL delete the provider profile
- **AND** it SHALL delete all secrets directly referenced by that profile's `secretRefs`

#### Scenario: Delete profile while retaining secrets
- **WHEN** `deleteProviderProfile(profileId, { retainSecrets: true })` is called
- **THEN** the system SHALL delete the provider profile
- **AND** it SHALL NOT delete the secret values referenced by that profile
- **AND** the command result MUST NOT include retained secret values

### Requirement: Secret references and resolution
The system SHALL store sensitive provider values through secret references. A secret resolver SHALL resolve secret references only when runtime configuration is required for validation, test, or invocation. Secret values MUST NOT be returned by profile list or profile get commands.

#### Scenario: Resolve runtime config with secret
- **WHEN** a provider config resolver resolves a profile that contains `secretRefs.apiKey`
- **THEN** it SHALL read the corresponding secret value through the injected secret resolver
- **AND** it SHALL produce a runtime provider config usable by `provider.validateConfig()`

#### Scenario: Missing secret value
- **WHEN** a provider config resolver resolves a profile whose required secret reference has no stored secret value
- **THEN** it SHALL fail with a validation error
- **AND** the error message MUST NOT include the missing secret value or any previously stored secret value

### Requirement: Provider implementation and profile discovery separation
The system SHALL distinguish provider implementation discovery from provider profile discovery. Provider implementation discovery SHALL identify compiled provider families/implementations available in the application, while provider profile discovery SHALL identify user-configured provider instances stored through repository adapters.

#### Scenario: Implementation exists but no profile configured
- **WHEN** `openai-compatible` implementation is registered but no profile exists for it
- **THEN** provider implementation listing MAY show the implementation as configurable
- **AND** provider profile listing SHALL NOT report a configured provider profile

#### Scenario: Profile references unsupported family
- **WHEN** a persisted profile references a provider family that is not registered in the provider implementation registry
- **THEN** profile discovery SHALL mark or report that profile as unavailable
- **AND** runtime config resolution for that profile SHALL fail with a validation error

### Requirement: Host storage adapter boundary
The system SHALL keep host-specific storage implementations behind injected adapters. The Photoshop UXP host SHALL implement provider profile persistence against UXP `localFileSystem.getDataFolder()` by default and provider secret persistence against UXP `secureStorage` by default. These UXP implementations SHALL live in the Photoshop surface/app adapter layer and MUST NOT be imported by `packages/providers`, `packages/core-engine`, `packages/workflows`, or shared command contracts.

#### Scenario: Photoshop UXP adapter persists app-owned profile config
- **WHEN** Photoshop UI starts with a UXP provider profile repository adapter
- **THEN** the adapter SHALL read and write provider profile JSON under the plugin data folder
- **AND** the shared repository contract MUST NOT expose UXP entry or token objects

#### Scenario: Photoshop UXP adapter resolves provider secrets
- **WHEN** a provider profile references `secretRefs.apiKey` in Photoshop UXP
- **THEN** the injected secret adapter SHALL resolve the secret through UXP `secureStorage` by default
- **AND** missing secure storage entries SHALL be handled as a re-entry flow rather than falling back to ordinary JSON secret storage

### Requirement: Cross-surface storage boundary
The system SHALL express cross-surface provider profile sharing through repository and adapter injection. It MUST NOT assume that CLI and Photoshop UXP can access the same physical storage unless the injected adapters are configured to use a shared backing store. By default, CLI Node file storage and Photoshop UXP data-folder storage are separate backing stores.

#### Scenario: Shared backing store injected
- **WHEN** CLI and Photoshop UI are configured with adapters that point to the same provider profile backing store
- **THEN** a profile saved by CLI SHALL be discoverable by Photoshop UI on the next repository read

#### Scenario: Separate backing stores injected
- **WHEN** CLI uses Node file storage and Photoshop UI uses UXP data-folder storage
- **THEN** a profile saved by CLI MUST NOT be assumed to appear in Photoshop UI automatically
- **AND** the system SHALL require an explicit import, export, migration, or shared adapter strategy for cross-surface sharing

#### Scenario: Shared external backing store requires UXP authorization
- **WHEN** Photoshop UI is configured to read provider profiles from an external shared file or folder
- **THEN** the UXP adapter SHALL obtain access through picker or persistent token authorization
- **AND** token resolution failure SHALL be handled by prompting the user to reselect or re-import the profile source

