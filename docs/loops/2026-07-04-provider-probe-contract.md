Status: draft
Authority: current user authorization in this turn
Owner: packages/providers + packages/application + apps/app
Created: 2026-07-04

# Context docs

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/TESTING.md`
- `docs/ENGINEERING_CONTEXT.md`
- `apps/app/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`

# Goal

Define and land a bounded probe contract that separates provider technical probe capability, probe facts/evidence, profile readiness policy, and app action exposure so the app can distinguish network/auth/discovery/inference states, allow manual-model profiles without `/models`, and decouple endpoint health checks from model refresh.

# Non-goals

- Do not redesign provider invocation payloads or runtime dispatch.
- Do not intentionally invoke chat, image generation, image edit, or other inference operations in the default profile/endpoint probe.
- Do not change Photoshop/UXP host IO ownership.
- Do not broaden product support for new provider families beyond the probe contract.
- Do not retain completed Loop records after durable outcomes are merged into authority docs.

# Scope

- Allowed
  - `packages/providers/src/providers/*`
  - `packages/providers/src/contract/*`
  - `packages/application/src/commands/*`
  - `packages/application/src/commands/types.ts`
  - `apps/app/src/shared/ui/pages/*settings*`
  - `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
  - `apps/app/src/shared/ui/provider-status.ts`
  - focused tests under `packages/providers/tests`, `packages/application/src/commands/*.test.ts`, `apps/app/tests/*settings*`
  - canonical docs if durable contract knowledge must be written back
- Forbidden
  - `packages/core-engine/**`
  - `apps/app/src/adapters/uxp/**`
  - unrelated docs cleanup
  - release/live-provider test additions unless explicitly approved

# Ownership boundary

- `packages/providers`
  - owns probe stage vocabulary, provider technical capability declaration, evidence-bearing probe report shape, discovery strategy, and endpoint-specific health observations
- `packages/application`
  - owns command facade, draft-aware probe orchestration, profile readiness derivation, profile-mode gating, and action-policy inputs for the surface
- `apps/app`
  - owns action exposure, labels, status presentation, action separation, and non-ambiguous user messaging
- Forbidden boundary crossings
  - no React/UI logic in `packages/application` or `packages/providers`
  - no provider transport semantics in `apps/app`
  - no core-engine lifecycle changes for this slice

# Contract split

- Layer 1: `ProviderProbeCapabilities`
  - answers only what a provider can technically probe
  - example dimensions:
    - supported stages: `transport | authentication | discovery | inference`
    - endpoint-probe support
    - latency-observation support
  - must not decide UI exposure
- Layer 2: `ProviderProbeReport`
  - returns facts and evidence for one profile or one endpoint probe
  - must not return collapsed booleans like `connected`, `usable`, or `healthy`
  - must distinguish stage result states:
    - `not-requested`
    - `unsupported`
    - `passed`
    - `failed`
    - `indeterminate`
    - `skipped`
    - `cancelled`
- Layer 3: `ProfileReadiness`
  - derived in `packages/application` from probe facts plus profile mode and policy
  - expected values:
    - `ready`
    - `ready-with-warnings`
    - `blocked`
    - `unverified`
- Layer 4: surface action exposure
  - decides whether app UI shows profile test, endpoint probe, inference test, or related notices
  - may intentionally hide an action even when the provider technically supports the underlying stage

# Baseline

- Current `chat-image` and `image-endpoint` treat `testConnection()` as `discoverModels()`.
- Current endpoint probe also depends on `discoverModels` / `/models`.
- Current code path conflates provider technical support with product-exposed actions.
- `gemini-generate-content` should be treated as evidence that technical capability and product action exposure are separate concerns.
- `Prompt Optimizer` must not be treated as a special probe family; for probe contract purposes it follows `openai-chat-completions` semantics.
- `apps/app` detail-page refresh flow currently couples model refresh with endpoint measurement.
- Baseline validation before edits:
  - inspect current provider probe tests
  - run focused current-state tests for probe-related suites
- If baseline focused tests already fail, stop and report whether failure blocks attribution.

# Slices

## Slice 1

- Goal
  - Define the four-layer probe contract and the shared stage/status/evidence vocabulary.
- Allowed scope
  - `packages/providers/src/contract/*`
  - `packages/application/src/commands/types.ts`
- Validation
  - provider/application unit tests for type-level contract consumers
  - explicit tests for `ProbeStageStatus` semantics and report normalization
- Stop rule
  - stop with Decision Packet if probe stages cannot fit current provider boundary without leaking UI semantics

## Slice 2

- Goal
  - Refactor `chat-image` and `image-endpoint` so default probing yields stage facts/evidence instead of collapsing connection testing into model discovery.
- Allowed scope
  - `packages/providers/src/providers/chat-image/**`
  - `packages/providers/src/providers/image-endpoint/**`
  - related provider tests
- Validation
  - provider contract tests for:
    - manual-model profile without `/models`
    - discovery-supported profile
    - auth failure
    - `/models` route-not-found reported as discovery failure, not provider unsupported
    - 429 reported as stage failure with transport passed, not connection collapse
    - auth evidence inferred from protected operations, not assumed from a dedicated auth route
- Stop rule
  - stop if a non-inference probe cannot evidence the requested stage split for these provider families

## Slice 3

- Goal
  - Add application-level readiness derivation so manual-model profiles may remain usable when discovery is unsupported.
- Allowed scope
  - `packages/application/src/commands/*profile*`
  - related command tests
- Validation
  - command tests for `2C` behavior:
    - auto discovery requires discovery support
    - manual model does not require discovery support
    - readiness derives from stage facts rather than provider booleans
    - inference `not-requested` does not block readiness
- Stop rule
  - stop if current persisted profile shape cannot distinguish manual-model vs discovery-required behavior without unrelated schema expansion

## Slice 4

- Goal
  - Decouple endpoint health observation from model refresh and keep app action exposure separate from provider technical support.
- Allowed scope
  - `apps/app/src/shared/ui/pages/*settings*`
  - `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
  - `apps/app/src/shared/ui/provider-status.ts`
  - related app tests
- Validation
  - app tests proving:
    - refresh-models only targets the intended endpoint
    - endpoint probe action remains separate
    - partial results render distinct user-visible states
    - endpoint probe does not refresh the model catalog
    - endpoint probe does not mutate selected endpoint or runtime endpoint selection
- Stop rule
  - stop if UI requirements require new copy/state taxonomy not representable with current i18n/status surface without broader design approval

## Slice 5

- Goal
  - Write durable contract knowledge into canonical docs and close validation.
- Allowed scope
  - `docs/ENGINEERING_CONTEXT.md`
  - `docs/TESTING.md`
  - matching package `AGENTS.md` only if ownership guidance changed
- Validation
  - `pnpm check:policy`
  - final closeout command set for touched workspaces
- Stop rule
  - stop if durable facts are still provisional or depend on unapproved live-provider behavior

# Validation

- Quick
  - `pnpm check:policy`
- Per-slice
  - `pnpm --filter @imagen-ps/providers test`
  - `pnpm --filter @imagen-ps/application test`
  - `pnpm --filter @imagen-ps/app test`
- Final
  - `pnpm validate`
- Manual-only
  - none required for the contract slice
- Live-provider
  - not required by default; if proposed, must be an explicit follow-up and not the default gate

# Decision Packet triggers

- Probe stages need incompatible meanings between provider families.
- Manual-model support without discovery requires persisted schema or product-state changes outside allowed scope.
- A meaningful inference stage cannot be represented without introducing paid default behavior.
- Endpoint-specific capability results require per-endpoint secrets/headers/path ownership changes.
- UI needs a new status grammar that current app status surfaces cannot express cleanly.
- Provider technical capability and product action exposure cannot be separated without unauthorized surface-policy changes.

# Completion report

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
- Decision Packet, if blocked:

# Memory note candidate

- yes: decision
- Promote only stable probe-contract rules into canonical docs after implementation.
