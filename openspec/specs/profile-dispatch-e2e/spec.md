# Profile Dispatch E2E

## Purpose

Define the end-to-end profile dispatch contract: how `submitJob` auto-routes `profileId`-based input to the profile-aware adapter, how the adapter handles template literal placeholders, and how profile dispatch preserves the three-tier model selection chain.

## Requirements

### Requirement: submitJob auto-routes profileId-based input to profile-aware adapter
The system SHALL detect when a job input contains `profileId` or `providerProfileId` without an explicit `provider` field, and automatically inject `provider: 'profile'` to route the dispatch through `createProfileAwareDispatchAdapter`.

#### Scenario: Job submit with profileId only
- **WHEN** a consumer calls `submitJob` with input containing `profileId` but no `provider` field
- **THEN** the system MUST inject `provider: 'profile'` into the enriched input before executing the workflow
- **AND** the workflow MUST be dispatched through the profile-aware adapter
- **AND** the job MUST complete with status `'completed'` if the profile exists and is valid

#### Scenario: Job submit with explicit provider takes precedence
- **WHEN** a consumer calls `submitJob` with input containing both `profileId` and `provider: 'mock'`
- **THEN** the explicit `provider` field MUST be preserved
- **AND** the system MUST NOT override it with `provider: 'profile'`
- **AND** the job MUST route to the adapter matching the explicit provider identifier

#### Scenario: Job submit without profileId proceeds normally
- **WHEN** a consumer calls `submitJob` with input containing neither `profileId` nor `providerProfileId`
- **THEN** the system MUST NOT inject `provider: 'profile'`
- **AND** the workflow MUST proceed with the provided input unchanged

### Requirement: Profile-aware adapter ignores template literal placeholders
The system SHALL ensure `createProfileAwareDispatchAdapter` correctly resolves `profileId` even when `providerProfileId` in params is an unresolved template literal placeholder (e.g., `'${providerProfileId}'`).

#### Scenario: Adapter falls back from providerProfileId template literal to profileId
- **WHEN** `createProfileAwareDispatchAdapter.dispatch` receives params where `providerProfileId` equals `'${providerProfileId}'` and `profileId` equals a valid profile identifier
- **THEN** the adapter MUST ignore the template literal placeholder
- **AND** it MUST use the `profileId` value to resolve the provider profile

#### Scenario: Adapter uses explicit providerProfileId when present
- **WHEN** `createProfileAwareDispatchAdapter.dispatch` receives params containing a non-placeholder `providerProfileId` string
- **THEN** the adapter MUST use that `providerProfileId` value for profile resolution
- **AND** it MUST take precedence over any `profileId` value in the same params

#### Scenario: Adapter rejects when both fields are placeholders
- **WHEN** `createProfileAwareDispatchAdapter.dispatch` receives params where both `providerProfileId` and `profileId` are template literal placeholders
- **THEN** the adapter MUST reject the dispatch with a clear error indicating that a profile identifier is required

### Requirement: Profile dispatch preserves three-tier model selection
The system SHALL ensure profile dispatch does not interfere with the existing three-tier model priority chain (`request.providerOptions.model` → `profile.defaultModel` → `config.defaultModel` → hardcoded default).

#### Scenario: Default model from profile is injected when request lacks explicit model
- **WHEN** a profile-generate job is submitted with `profileId` pointing to a profile that has `defaultModel` set
- **AND** the job input does not specify `providerOptions.model`
- **THEN** the profile's `defaultModel` MUST be injected into `providerOptions.model` before provider invocation

#### Scenario: Explicit model in request takes priority over profile default
- **WHEN** a profile-generate job is submitted with `profileId` and explicit `providerOptions.model`
- **THEN** the explicit `providerOptions.model` MUST NOT be overwritten by the profile's `defaultModel`
