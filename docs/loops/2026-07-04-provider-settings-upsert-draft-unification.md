Status: draft
Authority: current user authorization in this turn
Owner: apps/app
Created: 2026-07-04

# Context docs

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`
- `docs/loops/2026-07-04-provider-probe-contract.md` as adjacent draft reference only

# Goal

Refactor provider settings so create and edit are treated as one shared Provider Profile Draft / Upsert workflow, with one authoritative app-owned state machine and one consistent model/connection behavior contract; persisted-resource differences should appear only as explicit capabilities, not as separate page semantics.

# Non-goals

- Do not redesign provider transport or discovery semantics in `packages/providers`.
- Do not move React/ViewModel ownership into `packages/application`.
- Do not keep two independent page-specific form state machines and merely wrap them with a common component.
- Do not do a cosmetic-only merge that leaves model-list semantics inconsistent.
- Do not add Photoshop/UXP host-specific behavior.

# Scope

- Allowed
  - `apps/app/src/shared/ui/pages/settings-add-page.tsx`
  - `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
  - `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
  - `apps/app/src/shared/ui/components/provider-billing-settings.tsx`
  - `apps/app/src/shared/ui/hooks/*provider*`
  - `apps/app/src/shared/ui/i18n/messages.ts`
  - focused tests under `apps/app/tests/*settings*`
  - canonical docs only if durable ownership guidance changes
- Forbidden
  - `packages/core-engine/**`
  - `apps/app/src/adapters/uxp/**`
  - unrelated docs/theme/motion cleanup
  - provider/API contract changes without separate approval
  - release/live-provider validation additions

# Ownership boundary

- `apps/app`
  - owns provider-settings draft state, field update actions, page composition, capability gating, messaging, and mapping user intent to existing application commands
- `packages/application`
  - owns `saveProviderProfile` upsert semantics, draft-aware probe/test commands, persisted-profile lookup, persisted model refresh, delete, and billing state commands
- `packages/providers`
  - owns provider descriptor defaults, config validation, discovery behavior, endpoint measurement, and connection-test capability declaration
- Forbidden boundary crossings
  - no React/UI state in `packages/application`
  - no UI copy/state branching in `packages/providers`
  - no host IO ownership changes

# Current-state analysis

- The real command model is already upsert-shaped
  - `saveProviderProfile(input)` in `packages/application` is not split into create/update commands.
  - `ProviderProfileInput` is explicitly upsert-style: create may send full fields, update may rely on existing state.
  - This means the lower-level domain already treats “create” and “edit” as one save concept.

- The real probe/test model is already draft-shaped
  - `measureProfileEndpoints(...)` and `testProviderProfileConnection(...)` both accept optional `profileId`, `apiFormat`, `config`, `secretValues`, and `removedSecretNames`.
  - These commands already support a not-yet-saved draft and an existing persisted profile through the same input shape.
  - This means the lower-level connectivity/model-discovery domain also already treats both flows as one draft concept.

- The UI is where the split was introduced
  - `settings-add-page.tsx` and `settings-detail-page.tsx` each own their own state machine.
  - Both pages duplicate core draft concerns:
    - `connection`
    - `paths`
    - `apiKey`
    - `defaultModel`
    - `billing`
    - `measurementResults`
    - `resolvedEndpointId`
    - `modelMode`
    - draft command assembly through `providerConfigFromForm(...)`
  - Both pages also duplicate endpoint/path classification and draft invalidation behavior in slightly different forms.

- The biggest architectural mismatch is not just stale handling
  - The deeper issue is that add/edit are treated as different products rather than different states of the same provider-profile draft.
  - Example:
    - edit page model list is draft/persisted aware via `useProfileModels(...)` and draft probe replacement
    - add page model list is only `selected?.defaultModels`
  - So the same “Default model” section has different data meaning across pages.

- Persisted-resource differences are real, but secondary
  - edit has capabilities add cannot have before first save:
    - delete profile
    - hydrate from persisted profile
    - remove saved secrets
    - refresh persisted model cache
    - read persisted billing state
  - But these are capability differences on top of one draft/upsert concept, not evidence for two separate form models.

- Existing shell split is thin enough to be demoted
  - `AppShell` routes to `settings-add` and `settings-detail`, but the difference is mostly page entry/exit behavior and a few actions after save/delete.
  - This suggests the primary abstraction should be one shared draft/upsert ViewModel, with shell-specific wrappers if still needed.

# Baseline

- Current behavior evidence
  - `packages/application/src/commands/types.ts` documents `ProviderProfileInput` as upsert-style.
  - `packages/application/src/commands/provider-profiles.ts` implements `saveProviderProfile(...)` as one command for create/update.
  - `packages/application/src/commands/types.ts` draft probe/test inputs already support both unsaved and persisted contexts.
  - `settings-add-page.tsx` and `settings-detail-page.tsx` both own overlapping form state and draft command assembly.

- Baseline validation before edits
  - inspect:
    - `apps/app/tests/settings-add-page.test.tsx`
    - `apps/app/tests/settings-detail-model-list.test.tsx`
    - `apps/app/tests/settings-detail-connectivity.test.tsx`
    - `apps/app/tests/settings-detail-profile-editing.test.tsx`
    - `apps/app/tests/settings-detail-billing.test.tsx`
  - run focused app tests before implementation if execution is approved

- If baseline focused tests already fail
  - stop and report whether failures block attribution of the refactor slice

# Target architecture

- Primary abstraction
  - one app-owned `ProviderProfileDraft` / `ProviderProfileUpsert` ViewModel hook
  - not “create mode vs edit mode” as the first-class design axis
  - first-class axis should be:
    - draft state
    - capabilities derived from current context

- Core ViewModel responsibilities
  - own one normalized provider-profile draft state
  - expose one update API for fields and derived state
  - assemble one save payload for `saveProviderProfile(...)`
  - assemble one draft-aware probe/test payload
  - own one model-list state contract
  - own one dirty-state partition contract
  - expose one capability object for shell/action differences

- Capability examples
  - `canDeleteProfile`
  - `canRemoveSavedApiKey`
  - `canRemoveSavedBillingToken`
  - `canRefreshPersistedModelCache`
  - `canReadBillingState`
  - `canShowPromptOptimizerInstruction`

- Required convergence
  - “Default model” must mean the same thing in both flows.
  - Probe/test/model-list state must be updated through one path.
  - Descriptor defaults are allowed only as fallback evidence, not as a separate create-only semantics.
  - Stale/refresh policy must be shared and compare only the minimal discovery-critical fields.
  - Draft invalidation and endpoint classification must not be duplicated across pages.

- Shell outcome
  - It is acceptable to keep two route entries temporarily.
  - But both routes must consume the same ViewModel and same section contract.
  - A later simplification may collapse them into one page component with different entry props, but the refactor should first unify behavior, not route names.

# Slices

## Slice 1

- Goal
  - Define the authoritative `ProviderProfileDraft` / `ProviderProfileUpsert` contract and capability model.
- Allowed scope
  - `apps/app/src/shared/ui/hooks/**`
  - settings page files only for contract lock-in
  - focused tests if needed
- Deliverable
  - typed ViewModel interface plus capability matrix
- Validation
  - focused app tests compile/run
- Stop rule
  - stop with Decision Packet if the contract cannot stay app-owned without pulling persistence semantics into generic field components

## Slice 2

- Goal
  - Extract one shared draft state machine and one shared command-input assembly path.
- Allowed scope
  - `apps/app/src/shared/ui/hooks/**`
  - page files only to adopt the shared hook
- Validation
  - focused settings tests for save/probe/test/classification behavior
- Stop rule
  - stop if extraction requires new application commands instead of reusing the existing upsert/draft-aware command surfaces

## Slice 3

- Goal
  - Unify model-list semantics around one evidence ladder for both unsaved and persisted drafts.
- Allowed scope
  - `apps/app/src/shared/ui/hooks/**`
  - `settings-add-page.tsx`
  - `settings-detail-page.tsx`
  - `messages.ts`
  - focused tests
- Expected outcome
  - one model-list state contract for both flows
  - descriptor defaults are only fallback, not create-only truth
  - draft probe/test can populate the picker in both flows
  - persisted refresh remains an extra capability, not a different semantic model
- Validation
  - tests proving aligned behavior under:
    - untouched draft
    - endpoint/api-key change
    - default-model-only change
    - successful draft probe/test
    - persisted-profile refresh
- Stop rule
  - stop if create-flow alignment requires unauthorized provider/application behavior changes rather than app-side state unification

## Slice 4

- Goal
  - Move persisted-resource-only behavior behind explicit capabilities and thin page shells.
- Allowed scope
  - `settings-add-page.tsx`
  - `settings-detail-page.tsx`
  - shared app hooks/components
- Expected outcome
  - delete/secret-removal/billing-refresh/persisted-model-refresh are capability-driven add-ons
  - page files mostly compose shell/header/footer/route aftermath
  - no second independent form state machine remains
- Validation
  - focused app tests plus code inspection
- Stop rule
  - stop if cleanup starts changing unrelated UX/visual structure rather than consolidating semantics

## Slice 5

- Goal
  - Finalize validation and write durable ownership guidance only if it materially changed.
- Allowed scope
  - `apps/app/AGENTS.md`
  - `docs/ENGINEERING_CONTEXT.md`
  - final validation commands
- Validation
  - `pnpm check:policy`
  - `pnpm --filter @imagen-ps/app test`
  - `pnpm validate` for closeout after implementation
- Stop rule
  - stop if proposed writeback is implementation detail rather than stable architecture guidance

# Validation

- Quick
  - `pnpm check:policy`
- Per-slice
  - `pnpm --filter @imagen-ps/app test`
  - targeted settings tests as needed
- Final
  - `pnpm validate`
- Manual-only
  - none required
- Live-provider
  - not required

# Decision Packet triggers

- A single draft/upsert ViewModel has incompatible interpretations:
  - pure field state
  - field state plus persisted-resource orchestration
  - field state plus shell/navigation policy
- Model-list unification for unsaved drafts cannot be achieved with current app-side command surfaces.
- Secret-removal or billing-state handling cannot be represented as explicit capabilities without leaking persistence semantics through generic field components.
- Existing provider probe contract work should land first because current model/connection semantics are still unstable.

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

- yes: architecture
- Promote only stable app ownership guidance for provider-profile draft/upsert architecture after implementation.
