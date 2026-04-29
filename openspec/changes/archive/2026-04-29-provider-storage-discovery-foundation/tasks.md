## 1. Documentation Foundation

- [x] 1.1 Update `docs/STORAGE_DESIGN.md` with provider implementation discovery vs provider profile discovery definitions.
- [x] 1.2 Add provider profile persisted schema, secret reference rules, and resolved runtime config shape to `docs/STORAGE_DESIGN.md`.
- [x] 1.3 Add cross-surface storage strategy to `docs/STORAGE_DESIGN.md`, explicitly distinguishing shared backing store from separate CLI/UXP stores.
- [x] 1.4 Add provider profile lifecycle and dispatch-time config resolution diagrams to `docs/STORAGE_DESIGN.md`.
- [x] 1.5 Align storage decisions with `docs/storage/UXP_STORAGE_STRATEGY.md`: UXP data folder for app-owned config, UXP `secureStorage` for secrets, temp folder only for recoverable intermediates, and no UXP objects in shared contracts.
- [x] 1.6 Document that this change's delta specs merge into `openspec/specs/` on archive, and that implementation follows `openspec/changes/provider-storage-discovery-foundation/specs/` until archive.

## 2. Shared Commands Contracts

- [x] 2.1 Define `ProviderProfile`, `ProviderProfileInput`, `ProviderProfileRepository`, `SecretStorageAdapter`, `SecretResolver`, `ProviderConfigResolver`, and `ResolvedProviderConfig` types in `packages/shared-commands` without host-specific imports.
- [x] 2.2 Define `ProviderProfile.config` as non-secret family-specific config and document migration from legacy `ProviderConfig.apiKey` to `secretRefs.apiKey`.
- [x] 2.3 Add default in-memory implementations for provider profile repository and secret storage for tests and non-configured runtime.
- [x] 2.4 Add dependency injection functions for provider profile repository and secret storage, following the existing `setConfigAdapter` pattern.
- [x] 2.5 Ensure shared contracts do not expose UXP `File`, `Folder`, `Entry`, session token, persistent token, Node fs/path/os, DOM, or Photoshop-specific types.
- [x] 2.6 Ensure all profile-facing exported types and commands avoid returning secret values.

## 3. Provider Profile Commands

- [x] 3.1 Implement `listProviderProfiles()` using the injected provider profile repository.
- [x] 3.2 Implement `getProviderProfile(profileId)` with validation-style errors for missing profiles.
- [x] 3.3 Implement `saveProviderProfile(input)` to split non-secret profile data from secret inputs and validate through the registered provider implementation.
- [x] 3.4 Implement save compensation for secret storage failure, provider validation failure, and profile repository save failure so partial writes do not produce successful but unusable profiles.
- [x] 3.5 Implement `deleteProviderProfile(profileId, options?)` with default delete-associated-secrets behavior and explicit retain-secrets mode.
- [x] 3.6 Implement `testProviderProfile(profileId)` or a minimal validation-only equivalent covering success, missing profile, missing secret, provider validation failure, and optional connectivity failure.
- [x] 3.7 Keep existing `getProviderConfig` / `saveProviderConfig` behavior working during migration.

## 4. Runtime Config Resolution

- [x] 4.1 Implement `ProviderConfigResolver.resolve(profileId)` that loads profile, resolves required secrets, finds provider implementation, builds runtime config, and validates it.
- [x] 4.2 Define the resolver injection point in `packages/shared-commands` runtime assembly, either setter-style (`setProviderConfigResolver`) or runtime assembly options, and document why it was chosen.
- [x] 4.3 Preserve existing static provider dispatch adapter injection compatibility while adding profile-targeted dispatch-time resolution.
- [x] 4.4 Update the dispatch path so profile-targeted invocations extract an explicit profile id, call `ProviderConfigResolver.resolve(profileId)`, and invoke the provider with resolved config.
- [x] 4.5 Ensure runtime dispatch distinguishes provider profile id from provider implementation id when multiple profiles share a family.
- [x] 4.6 Ensure resolved secret-bearing config is scoped to a dispatch and is not emitted in descriptors, job input, lifecycle events, or command results.
- [x] 4.7 Implement or explicitly omit resolver caching; if caching is implemented, invalidate profile cache entries on save/delete before the next successful resolve.

## 5. CLI Adapter Migration

- [x] 5.1 Update CLI file config adapter or add a provider profile file adapter using a versioned provider profiles schema.
- [x] 5.2 Do not implement legacy `~/.imagen-ps/config.json` provider config migration for this pre-release app; use only the new versioned provider profiles schema for CLI profile persistence.
- [x] 5.3 Add CLI command coverage for listing, saving, deleting, and validating provider profiles when applicable.
- [x] 5.4 Make CLI behavior explicit: profiles saved to the CLI default file store do not automatically appear in Photoshop UXP unless a shared backing store/import-export flow is configured.
- [x] 5.5 Keep Node fs/path/os usage confined to `apps/cli` adapter code.

## 6. Photoshop UXP Adapter Scope

- [x] 6.1 Document the future UXP adapter placement in `apps/app` or app-local storage service, not in `packages/providers`, `packages/core-engine`, or `packages/shared-commands`.
- [x] 6.2 Define the expected UXP adapter responsibilities: provider profile JSON under `localFileSystem.getDataFolder()` and provider secrets through `secureStorage`.
- [x] 6.3 Document that external shared profile sources require picker or persistent token authorization and must handle token failure with fallback UX.

## 7. Spec Sync and Verification

- [x] 7.1 After implementation, ensure this change's delta specs are ready to archive into main `openspec/specs/` and do not conflict with existing `runtime-assembly` static adapter requirements.
- [x] 7.2 Add unit tests for provider profile repository and secret storage memory implementations.
- [x] 7.3 Add shared-commands tests proving profile commands never return secret values.
- [x] 7.4 Add resolver tests for missing profile, unsupported family, missing secret, valid resolved config, and cache invalidation if caching exists.
- [x] 7.5 Add runtime tests for dispatch-time profile resolution and multiple profiles sharing the same provider family.
- [x] 7.6 Add CLI adapter tests for versioned profile persistence and atomic writes if applicable; do not add old config compatibility tests in this change.
- [x] 7.7 Run package tests and typecheck for affected packages.
