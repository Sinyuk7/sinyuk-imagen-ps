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

Establish one app-level Composer draft owner inside `apps/app` so `MainPage` and `GlobalGenerationSettingsPage` resolve output-size availability from the same real draft context, while preserving current send/fill/clear semantics and proving the ownership change through mock-only app tests.

# Non-goals

- No provider capability contract changes in `packages/providers`.
- No request-shape or runtime-session architecture rewrite in `packages/application`.
- No `TaskRecord`, `DurableJobRecord`, or `useConversation()` protocol redesign outside the minimal draft-consumer touch points needed by this Loop.
- No broad settings or main-page visual redesign beyond what the shared-state wiring requires.
- No durable persistence for the draft itself across app reload or Photoshop restart.
- No live-provider or real-Photoshop validation as part of this Loop.

# Scope

Allowed files/packages:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/hooks/*`
- `apps/app/src/shared/ui/output-size.ts`
- `apps/app/src/shared/ui/components/*` only when needed to keep selector contracts stable
- `apps/app/tests/main-page-*.test.tsx`
- `apps/app/tests/global-generation-settings-page.test.tsx`
- `apps/app/tests/app-shell.test.tsx`
- `apps/app/tests/*harness*`
- `docs/ENGINEERING_CONTEXT.md` only if implementation produces stable architecture knowledge
- `docs/TESTING.md` only if validation guidance materially changes

Forbidden files/packages:

- `packages/application/**`
- `packages/core-engine/**`
- `packages/providers/**`
- `packages/foundation/**`
- `apps/app/src/adapters/chrome/**`
- `apps/app/src/adapters/uxp/**` except import/wiring touch-ups proved necessary by `app-shell` composition
- broad theme/style work unrelated to state ownership
- broad history/settings navigation changes

# Ownership boundary

Primary owner boundary: `apps/app`

- `apps/app` owns React UI composition, page-local vs shared draft state, selector context wiring, attachment disposal ownership, restore/fill UI behavior, and tests.
- `packages/application` must not learn about UI-local draft state or attachment preview lifetime.
- `output-size` availability remains an app/UI concern derived from selected model plus draft-derived operation.

# Baseline

Current observed state:

- `AppShell` already owns app-level UI state such as `selectedModelId`, `selectedImageProfileId`, `highlightedRoundId`, and `restoreFailedRoundId`.
- `MainPage` still owns `input`, `attachments`, `sizeUserSelected`, and `optimizeState` locally.
- `GlobalGenerationSettingsPage` currently has no real composer context; stage 1 uses a temporary `no-composer-context` rejection branch.
- `MainPage` currently owns attachment disposal and releases previews on page unmount. That is incompatible with cross-page shared draft ownership.
- `failed-round` fill/restore currently writes through `MainPage` local setters and is not modeled as a shared-draft operation.

Baseline validation before implementation:

```bash
pnpm --filter @imagen-ps/app test -- \
  tests/main-page-composer-controls.test.tsx \
  tests/main-page-attachment-submission.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/app-shell.test.tsx \
  tests/main-page-placement-writeback.test.tsx

pnpm --filter @imagen-ps/app build
```

If baseline fails:

- Stop and attribute whether the failure is pre-existing or caused by local branch drift.
- Do not treat unrelated host-smoke gaps as proof against this Loop unless they block the touched app files directly.

# Target contract

The shared draft owner for stage 2 is not “more `useState` in `AppShellContent`”.
The target contract is `ComposerDraftProvider + useComposerDraft()` under `apps/app/src/shared/ui/hooks/`.

Required draft API:

```ts
export interface ComposerDraftController {
  readonly prompt: string;
  readonly setPrompt: (prompt: string) => void;

  readonly attachments: readonly ConversationAttachment[];
  readonly addAttachment: (attachment: ConversationAttachment) => void;
  readonly replaceAttachments: (attachments: readonly ConversationAttachment[]) => void;
  readonly removeAttachment: (attachmentId: string) => void;
  readonly removeAllAttachments: () => void;

  readonly operation: ComposerOperation;

  readonly sizeUserSelected: boolean;
  readonly markSizeUserSelected: () => void;
  readonly resetSizeUserSelected: () => void;

  readonly fillFromFailedRound: (round: ConversationRound) => void;
  readonly resetDraft: () => void;
  dispose(): void;
}
```

Required ownership rules:

- `ComposerDraftProvider` is the only owner allowed to dispose draft attachment previews.
- `MainPage` must stop disposing shared draft attachments on page unmount.
- `MainPage` remains responsible only for page-local round/result UI state.
- `AppShell` may host the provider but should not manually inline every draft field as standalone `useState`.

Required `GlobalGenerationSettingsPage` contract change:

```ts
interface GlobalGenerationSettingsPageProps {
  // existing props...
  readonly selectedModel: ProviderModelInfo | undefined;
  readonly composerOperation: ComposerOperation;
}
```

Required `output-size` contract change:

- Once `GlobalGenerationSettingsPage` has real composer context, `output-size.ts`
  must stop relying on the temporary `no-composer-context` path for this page.
- If no in-app consumer still needs that branch after Slice 2, remove it.

Shared vs page-local state boundary:

| State | Owner after Loop | Notes |
|---|---|---|
| `prompt` | shared draft | survives `main -> settings -> main` |
| `attachments` | shared draft | single disposal owner |
| derived `operation` | shared draft | computed from shared attachments |
| `sizeUserSelected` | shared draft | must not reset on page navigation |
| `restoreFailedRoundId` trigger | `AppShell` + shared draft action | trigger remains app-level, fill logic moves into shared draft |
| `optimizeState` | `MainPage` | remains page-local unless a later Loop proves broader need |
| `profileMenuOpen`, `openMenu`, `attachOpen`, `layerOpen` | `MainPage` | page-local view state |
| `captureInFlight` | `MainPage` | page-local view/command state |
| `copied`, `selectedPreviewIndexes`, `placeStatus` | `MainPage` | round/result state, not draft state |
| `highlightKey`, `scrolledAway` | `MainPage` | page-local rendering state |

# Slices

## Slice 0: Freeze the explicit draft and ownership contract

Goal:

- Turn the target contract above into code-level and Loop-level implementation authority before any refactor starts.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- optional new `apps/app/src/shared/ui/hooks/use-composer-draft.ts`
- tests/harness reads only

Required outputs:

- finalize the `ComposerDraftController` API;
- identify the exact `MainPage` state to remove from local ownership;
- identify the exact page-local state to leave untouched;
- confirm `GlobalGenerationSettingsPageProps` additions;
- confirm single-owner attachment disposal rule;
- confirm `failed-round restore` becomes a shared-draft action, not a local setter sequence.

Validation:

- quick:
  ```bash
  pnpm check:policy
  ```
- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/app-shell.test.tsx \
    tests/main-page-composer-controls.test.tsx
  ```

Stop rule:

- Stop and produce a Decision Packet if the contract cannot be expressed entirely within `apps/app` ownership.

## Slice 1: Introduce `ComposerDraftProvider` and move `MainPage` draft consumption

Goal:

- Add `ComposerDraftProvider` and `useComposerDraft()` so `MainPage` reads and writes shared draft state instead of local `input` / `attachments` / `sizeUserSelected`.

Allowed scope:

- `apps/app/src/shared/ui/hooks/use-composer-draft.ts`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- related app tests/harness files

Expected behavior:

- `prompt`, `attachments`, and `sizeUserSelected` survive `main -> settings -> main`.
- successful send clears the shared draft once.
- `MainPage` no longer owns draft attachment disposal.
- profile switch behavior remains explicit and tested; if current behavior clears attachments, preserve that.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/main-page-composer-controls.test.tsx \
    tests/main-page-attachment-submission.test.tsx \
    tests/app-shell.test.tsx
  ```

Stop rule:

- Stop if moving attachments into shared draft causes duplicate preview release, lost preview disposal, or attachment duplication that cannot be proven/fixed with app-local tests.

## Slice 2: Wire `GlobalGenerationSettingsPage` to real composer context

Goal:

- Pass `selectedModel` and `composerOperation` into `GlobalGenerationSettingsPage` and make `output-size` selection use the same real context as `MainPage`.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/output-size.ts`
- selector-related tests

Expected behavior:

- `GlobalGenerationSettingsPage` blocks unsupported sizes using the current selected model plus shared draft-derived operation.
- supported sizes can be selected and saved from settings.
- temporary `no-composer-context` rejection path is removed for settings-page usage; delete the branch completely if no caller still needs it.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/global-generation-settings-page.test.tsx \
    tests/main-page-composer-controls.test.tsx \
    tests/app-shell.test.tsx
  ```

Stop rule:

- Stop and produce a Decision Packet if the product wants settings-page size evaluation to use anything other than the current selected model plus current shared draft operation.

## Slice 3: Rework lifecycle edge cases around restore/fill/disposal

Goal:

- Close the remaining lifecycle gaps introduced by shared draft ownership.

Allowed scope:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-composer-draft.ts`
- related app tests only

Required edge cases:

- `failed-round fill` writes shared draft exactly once;
- restoring a failed round while already editing does not duplicate attachments;
- `main -> settings -> main` keeps draft intact;
- switching away from `main` does not release shared draft attachments;
- `AppShell` / provider owner unmount disposes any remaining shared draft attachments once;
- profile switch attachment semantics stay explicit and tested.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/app test -- \
    tests/app-shell.test.tsx \
    tests/main-page-result-rendering.test.tsx \
    tests/main-page-attachment-submission.test.tsx \
    tests/main-page-placement-writeback.test.tsx
  ```

Stop rule:

- Stop if deterministic mock tests cannot prove single-owner disposal or single-write restore semantics without a new fake harness.

# Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

- Use the commands listed in each slice.
- Prefer direct test files over broad keywords because historical records already note that broad app keywords can pull unrelated suites.

Additional required test cases to add or update during execution:

- `tests/app-shell.test.tsx`
  - `composer draft survives main-settings-main navigation`
- `tests/global-generation-settings-page.test.tsx`
  - `blocks unsupported output size using shared composer context`
  - `allows supported output size using shared composer context`
- `tests/main-page-attachment-submission.test.tsx`
  - `shared draft attachments are not duplicated on failed-round fill`
- `tests/main-page-result-rendering.test.tsx` or `tests/app-shell.test.tsx`
  - `failed-round fill writes shared draft once`
- targeted test for single-owner disposal
  - exact file chosen by implementer once the hook/provider shape is final

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

- none by default

Live-provider:

- none

# Decision Packet triggers

Produce a Decision Packet instead of continuing if:

- the shared draft owner needs to move into `packages/application`;
- the product wants settings-page output-size evaluation to ignore current composer draft state;
- the product now wants draft persistence across app reload/restart;
- single-owner draft attachment disposal cannot be made deterministic inside `apps/app`;
- profile-switch semantics for shared attachments are ambiguous or conflict with existing tested behavior;
- removing the temporary `no-composer-context` branch would break another in-app caller not covered by this plan.

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

yes: `architecture`, if implementation lands a stable `ComposerDraftProvider` contract that future `apps/app` surfaces should treat as the authority for shared draft ownership.
