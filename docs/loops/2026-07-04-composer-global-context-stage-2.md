Status: `draft`
Authority: current user authorization
Owner: `apps/app` composer/global-settings state unification
Created: 2026-07-04

# Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`

Historical reference:

- `docs/loops/2026-07-03-main-page-status-readiness.md`
- `docs/loops/2026-07-03-settings-form-unification.md`

# Goal

Make the main Composer draft state an app-level single source of truth inside `apps/app` so `MainPage` and `GlobalGenerationSettingsPage` can both resolve output-size availability from the same real composer context, with mock-only harness proof and no cross-package ownership leak.

# Non-goals

- No provider capability contract changes in `packages/providers`.
- No request-shape or runtime-session architecture rewrite in `packages/application`.
- No broad settings visual redesign beyond the minimal state wiring needed for this behavior.
- No history/task replay redesign.
- No real Photoshop / live-provider validation as part of this Loop.
- No attempt to unify Chrome and UXP persistence semantics beyond current `apps/app` store contracts.

# Scope

Allowed files/packages:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/hooks/*` if a new app-level composer-draft hook is needed
- `apps/app/src/shared/ui/output-size.ts`
- `apps/app/src/shared/ui/components/*` only if required to pass shared context or keep selector contracts stable
- `apps/app/tests/*main-page*`
- `apps/app/tests/*global-generation-settings*`
- `apps/app/tests/app-shell.test.tsx`
- `apps/app/tests/*harness*`
- `docs/ENGINEERING_CONTEXT.md` only if durable architecture knowledge changes after implementation
- `docs/TESTING.md` only if validation entrypoints materially change after implementation

Forbidden files/packages:

- `packages/application/**`
- `packages/core-engine/**`
- `packages/providers/**`
- `packages/foundation/**`
- `apps/app/src/adapters/uxp/**` except import/wiring touch-ups proved necessary by app-shell composition
- `apps/app/src/adapters/chrome/**`
- broad style/theme work unrelated to state ownership
- broad history/settings navigation changes

# Ownership boundary

Primary owner boundary: `apps/app`

- `apps/app` owns shared React UI composition, page-local vs app-level UI state, selector context wiring, toasts, and tests.
- This Loop must not move React/UI state into `packages/application`.
- This Loop must not teach providers or application about UI-local draft semantics.

# Baseline

Current observed state:

- `MainPage` owns `input`, `attachments`, local menus, and derived `operation` in page-local `useState`.
- `GlobalGenerationSettingsPage` has no composer context.
- Stage 1 already unified `outputSizePreset` storage and selection writeback, but `settings` page currently rejects output-size changes because it lacks composer context.
- `output size` auto-fallback on `main-page` writes back to `generationSettings.outputSizePreset`, establishing one global effective value.

Baseline validation before implementation:

```bash
pnpm --filter @imagen-ps/app test -- \
  tests/main-page-composer-controls.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/app-shell.test.tsx \
  tests/main-page-placement-writeback.test.tsx

pnpm --filter @imagen-ps/app build
```

If baseline fails:

- Stop and attribute whether failure is pre-existing or caused by local branch drift.
- Do not treat unrelated bundle or host-smoke gaps as proof against this Loop unless they block touched files directly.

# Slices

## Slice 0: State-owner audit and target contract

Goal:

- Define the minimal app-level composer-draft contract that must move out of `MainPage` for real shared context, and explicitly keep the rest page-local.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- optional new `apps/app/src/shared/ui/hooks/use-composer-draft.ts`
- tests/harness reads only

Deliverable:

- A documented contract in code comments or Loop execution notes for:
  - draft prompt;
  - draft attachments;
  - derived operation;
  - composer restore path from failed round;
  - reset semantics after successful send;
  - what remains page-local (`openMenu`, `attachOpen`, `layerOpen`, highlight state, copy state, etc.).

Validation:

- quick: targeted code inspection only
- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- tests/app-shell.test.tsx tests/main-page-composer-controls.test.tsx
  ```

Stop rule:

- Stop and produce a Decision Packet if true shared context requires moving session/job/history state out of `useConversation()` or into `packages/application`.

## Slice 1: Lift composer draft state to app-level owner

Goal:

- Introduce one app-level owner for composer draft state and wire `MainPage` to consume it without changing submit semantics.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- new/updated `apps/app/src/shared/ui/hooks/*`
- `apps/app/tests/main-page-*.test.tsx`
- `apps/app/tests/app-shell.test.tsx`

Expected behavior:

- `prompt`, `attachments`, and derived `operation` survive navigation away from `main` and back within the same app session.
- existing failed-round “fill composer” behavior writes into the shared draft owner, not a hidden page-local copy.
- successful send still clears the shared draft.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/main-page-composer-controls.test.tsx \
    tests/main-page-attachment-submission.test.tsx \
    tests/main-page-result-rendering.test.tsx \
    tests/app-shell.test.tsx
  ```

Stop rule:

- Stop if shared draft ownership breaks attachment lifetime/disposal semantics or causes duplicate release/cleanup of `HostImageAsset` previews.

## Slice 2: Resolve settings-page output-size availability from real composer context

Goal:

- Replace the temporary `no-composer-context` branch with real shared composer context so global settings can evaluate output-size availability from the same draft state as `main-page`.

Allowed scope:

- `apps/app/src/shared/ui/output-size.ts`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- related tests

Expected behavior:

- `GlobalGenerationSettingsPage` can evaluate `output size` against the current selected model and current draft-derived operation.
- unsupported sizes no longer fail only because settings lacks context.
- both pages still write to the same `generationSettings.outputSizePreset`.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/global-generation-settings-page.test.tsx \
    tests/main-page-composer-controls.test.tsx \
    tests/app-shell.test.tsx
  ```

Stop rule:

- Stop and produce a Decision Packet if the desired settings-page behavior is ambiguous when the user is not on `main-page` and there is no selected profile/model to evaluate against.

## Slice 3: Codify lifecycle edge cases for the new shared draft owner

Goal:

- Close edge cases introduced by global draft ownership so behavior is deterministic across navigation and retry/fill paths.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- shared hook introduced in Slice 1
- tests only for affected links

Required edge cases:

- navigate `main -> settings -> main` keeps draft intact
- successful send clears draft once
- failed-round fill updates the shared draft once
- restoring a failed round while already editing does not silently duplicate attachments
- output-size auto-fallback still writes back the effective global value after context sharing

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/app-shell.test.tsx \
    tests/main-page-attachment-submission.test.tsx \
    tests/main-page-result-rendering.test.tsx \
    tests/main-page-composer-controls.test.tsx
  ```

Stop rule:

- Stop if deterministic mock tests cannot prove one of these ownership claims without introducing a new fake harness first.

# Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

- Use the commands listed in each slice.
- Prefer direct test files over broad keywords when possible, because historical records note that broad keyword invocations can pull unrelated suites.

Final:

```bash
pnpm --filter @imagen-ps/app test -- \
  tests/main-page-composer-controls.test.tsx \
  tests/main-page-attachment-submission.test.tsx \
  tests/main-page-result-rendering.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/app-shell.test.tsx \
  tests/main-page-placement-writeback.test.tsx

pnpm --filter @imagen-ps/app build
pnpm check:policy
```

Manual-only:

- none required by default for this planning slice

Live-provider:

- none

# Decision Packet triggers

Produce a Decision Packet instead of continuing if:

- shared composer draft ownership needs `packages/application` session changes;
- the team wants settings-page output-size availability to use something other than the current draft-selected model/operation when no draft is present;
- draft persistence across app reload/restart is requested, because that would expand from in-session global state to durable draft storage;
- attachment preview/disposal cannot be made single-owner within `apps/app`;
- the planned hook/controller would force `MainPage` and `GlobalGenerationSettingsPage` into incompatible navigation or restore semantics.

# Completion report

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
- Decision Packet, if blocked:

# Memory note candidate

yes: `architecture`, if implementation lands a stable app-level contract for shared composer draft ownership that future UI work should treat as authority.
