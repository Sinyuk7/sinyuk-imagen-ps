Status: active
Authority: current user authorization
Owner: `packages/providers`, `packages/application`, `apps/app`
Created: 2026-07-05

# Profile Model Discovery Reset

## Context Docs

- `AGENTS.md`: current-state, harness-first loop contract; zero-user reset allowed.
- `docs/agent/LOOP.md`: Loop metadata, scope, validation, stop rules.
- `docs/TESTING.md`: mock-only package tests and final `pnpm validate`.
- `packages/providers/AGENTS.md`: provider layer owns provider contracts and transport; no app/session state or host IO.
- `packages/application/AGENTS.md`: application owns profile/model coordination; no React/DOM/host IO.
- `apps/app/AGENTS.md`: app surface owns React UI and host adapters; no provider transport semantics.
- `docs/ENGINEERING_CONTEXT.md`: current provider/application/app boundaries and current model-selection note, to update after behavior changes.

## Goal

Reset profile model discovery and model configuration for the zero-user phase:

- provider discovery returns only remote model facts;
- unknown discovered IDs survive into application reconciliation;
- profile model selection uses `selectedModelIds` plus `defaultModelId`;
- global user model config resolves before submit;
- request builders consume explicit resolved model config instead of using model ID alone as the capability source;
- UI can select configured models and route unconfigured models to configuration.

## Non-Goals

- No migration or compatibility for old model-selection data.
- No arbitrary request-body editor, JSON schema editor, alias database, learned capabilities, or profile-specific model override.
- No live provider proof or Photoshop/UXP host proof.
- No unrelated UI redesign.

## Scope

Allowed:

- `packages/providers/src/contract/**`
- `packages/providers/src/transport/**/models.ts`
- provider descriptors/providers/tests needed for discovery and request builder contracts
- `packages/application/src/commands/**`
- `packages/application/src/runtime.ts`
- `packages/application/src/requests/**`
- `packages/application/src/session/**`
- `apps/app/src/shared/ui/**`
- app adapters/repositories only for new host-injected repositories
- focused tests under touched packages
- `docs/ENGINEERING_CONTEXT.md` and `docs/TESTING.md` if durable behavior or validation authority changes

Forbidden:

- `packages/core-engine` job lifecycle changes unless a compile break proves a narrow type alignment is required
- Photoshop/UXP host IO behavior changes beyond repository persistence adapters
- live provider smoke
- broad docs cleanup or deletion of unrelated completed loop files

## Ownership Boundary

- `packages/providers`: pure provider discovery types, official model catalog/template contract, request strategies, transport request encoding.
- `packages/application`: discovery cache repository contract, user model config repository contract, profile model reconciliation, profile selection validation, model config resolution before dispatch.
- `apps/app`: React selection/configuration UI, host repository adapters, no provider transport logic.

## Baseline

Run before edits:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm --filter @imagen-ps/application test`

If baseline fails, record failure and continue only if unrelated to model discovery/profile selection.

## Slices

### 1. Provider Discovery Pure Contract

Goal:

- replace discovery-chain `ProviderModelInfo` with a pure discovered model fact;
- parser keeps unknown IDs and performs only transport-owned normalization;
- remove catalog filtering from provider discovery.

Allowed scope:

- `packages/providers/src/contract/model.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/transport/**/models.ts`
- provider implementations and focused provider/application tests needed for compile.

Validation:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm --filter @imagen-ps/application test`

Stop rule:

- stop if provider discovery requires application/user config or host persistence.

### 2. Catalog Template And Request Strategy Contract

Goal:

- split official catalog from picker filtering;
- expose model config templates keyed by `(apiFormat, modelId)`;
- give current `variants` / `constraintStrategy` stable `requestStrategyId` values.

Allowed scope:

- provider catalog contract/rules/strategies
- provider request builders and contract tests

Validation:

- `pnpm --filter @imagen-ps/providers test`

Stop rule:

- stop if a strategy cannot be represented without guessing live provider behavior.

### 3. Application Repositories And Reconcile

Goal:

- add `ModelDiscoveryCacheRepository` and `UserModelConfigRepository`;
- implement pure `reconcileProfileModels`;
- make `refreshProfileModels()` write cache only;
- make `listProfileModels()` read local cache + user configs + catalog + selected IDs only.

Allowed scope:

- `packages/application/src/commands/**`
- application runtime repository injection
- focused application tests

Validation:

- `pnpm --filter @imagen-ps/application test`

Stop rule:

- stop if persistence must be owned by providers or shared packages below application.

### 4. Profile Selection And Dispatch

Goal:

- replace profile `config.defaultModel` product semantics with `selectedModelIds/defaultModelId`;
- runtime dispatch uses explicit request model, then `defaultModelId`, then provider fallback;
- submit path resolves model config and includes it in canonical request.

Allowed scope:

- application profile commands/runtime/request builders/session
- provider request contracts/builders
- focused app seam updates only when types require.

Validation:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm --filter @imagen-ps/application test`

Stop rule:

- stop if dispatch would need React/UI or host IO state in application/provider.

### 5. App UI And Persistence Adapters

Goal:

- update settings and main UI to the new `ProfileModelItem` contract;
- add host adapters for discovery cache and user model config;
- let unknown discovered models open configuration;
- save config auto-selects that model.

Allowed scope:

- `apps/app/src/shared/ui/**`
- app adapters/composition harnesses
- app tests

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- stop if real Photoshop/UXP behavior is required for proof.

### 6. Final Verification And Docs

Goal:

- update durable docs to match new model architecture;
- run package and final validation.

Validation:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy`
- `pnpm validate`

## Validation

- quick: `pnpm check:policy`
- per-slice: focused package tests above
- final: `pnpm validate`
- live-provider: none
- manual-only: optional app UI observation only, not proof

## Decision Packet Triggers

- provider behavior cannot be represented without live API evidence;
- request strategy needs application/user repository access inside providers;
- `requestStrategyId` cannot encode existing builder behavior without broad transport redesign;
- app persistence requires UXP host proof not available to default tests;
- baseline failures block attribution.

## Completion Report

Report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
