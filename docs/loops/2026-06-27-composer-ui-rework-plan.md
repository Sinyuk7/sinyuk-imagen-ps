# Loop: Composer UI Rework Plan

## Status

Status: executed (repo-side validation complete; manual UXP host verification still outstanding)
Authority: current user authorization (2026-06-27)
Owner: `apps/app`
Created: `2026-06-27`
Superseded by: `No follow-up`
Context docs:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `apps/app/README.md`
- `.test-output/manual/产品经理 reviews.md` (user-provided planning input, not authority)

## Goal

Rework the `apps/app` Composer into a clearer three-layer creation surface for
both Chrome and Photoshop UXP, using more of the Spectrum component stack where
practical, while preserving the existing owner boundary and proving the result
through app-package tests plus explicit manual UXP evidence.

## Non-goals

- Rebuilding the entire main page or message list.
- Adding new top-level pages or routes.
- Changing provider/application/core-engine ownership or semantics.
- Shipping real behavior for prompt optimization, target mode, or aspect-ratio
  selection beyond UI/state scaffolding.
- Treating browser evidence as proof of real Photoshop host behavior.
- Solving unrelated Settings / Providers page layout issues in this Loop.

## Scope

Allowed:

- `apps/app/src/shared/ui/**`
- `apps/app/src/shared/domain/**` only if the Composer needs a small app-local
  display helper and the ownership remains UI-local
- `apps/app/tests/**`
- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/README.md` only if a narrow app-surface note is needed

Forbidden:

- `packages/application/**`
- `packages/core-engine/**`
- `packages/providers/**`
- `apps/cli/**`
- Photoshop host bridge behavior outside the UI-local controls needed to expose
  Composer-only placeholder state
- New pages or route-level expansion under `apps/app/src/shared/ui/pages`

Ownership boundary:

- CLI: no changes
- Provider: no changes
- Application: no changes unless a documented Decision Packet authorizes a new
  cross-boundary contract
- Core: no changes
- UXP: shared UI may add controls and local state; real host IO remains in
  existing adapters and manual validation

## Baseline

Quick:

- `pnpm check:policy`

Known failing baseline:

- Unknown from this planning turn; execution should verify before feature work.

Decision if baseline fails:

- Stop and report unless the failure is already documented, unrelated to the
  Composer slice, and attributable before continuing.

## Product Decisions Already Confirmed

- The Composer remains on the existing main page; no new page is introduced.
- Composer becomes the main visual/interaction focus of this sprint.
- Composer uses three layers:
  - top layer: attachment tray when attachments exist
  - middle layer: text input
  - bottom layer: controls and actions
- Bottom-left controls:
  - add attachment
  - model selection
  - target selection
- Bottom-right controls:
  - aspect-ratio selection
  - prompt optimization button
  - send button
- `Provider` switching/editing remains a Settings concern, not a Composer
  concern.
- `target` is the accepted label for the new control.
- Target options are:
  - `图层`
  - `选区`
- Target is always visible.
- Aspect ratio is always visible.
- Aspect-ratio options are:
  - `智能`
  - `1:1`
- Aspect ratio defaults to `智能`.
- Prompt optimization is UI-only for now; clicking it may show a lightweight
  “即将支持” notice.
- During a running task, all non-send Composer actions are disabled.

## Open Technical Questions To Resolve Inside The Loop

- Which SWC selection control chain is the best fit for Composer:
  - `menu + popover + custom trigger`
  - `action-menu`
  - `picker`
  - another SWC combination already compatible with UXP
- Whether the required SWC component chain has matching
  `@swc-uxp-wrappers/*` coverage; if not, whether the team accepts a
  controlled dual-runtime fallback inside `apps/app` without broadening the
  boundary.
- Whether additional workflow icons need app-local aliases when moving to
  `magic-wand`, `selection`, `layers`, `image-auto-mode`, `resize`, or
  adjacent names.
- Whether the current Composer state model can remain entirely UI-local, or if
  placeholder controls need a narrow app-local persistence decision.

## Baseline UX/Architecture Reading Of The Current Composer

- The current Composer already has the rough three-part shape:
  attachment tray, `UxpTextArea`, and a bottom control row.
- The current bottom row is under-specified for future growth: one attach
  button, one model chip, and a send button make the control hierarchy look
  incomplete.
- The existing custom menu behavior is functional but not yet converged onto a
  more reusable SWC-backed selection pattern.
- The next iteration should improve information hierarchy first, then replace
  control primitives where justified by runtime proof.

## Slices

### Slice 1: SWC selection-chain spike and boundary decision

Goal:

- Determine the most appropriate SWC-based selection control strategy for
  Composer and prove whether it is practical in both Chrome and UXP without
  guessing.

Allowed:

- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/src/shared/ui/primitives/**`
- focused scratch usage inside `apps/app/src/shared/ui/pages/main-page.tsx`
- focused tests under `apps/app/tests/**`

Forbidden:

- Broad main-page redesign before the selection-chain decision is evidenced
- Cross-package work

Validation:

- `pnpm --filter @imagen-ps/app test`
- if the spike adds build-time dependencies, also
  `pnpm --filter @imagen-ps/app build`

Stop:

- Stop and produce a Decision Packet if the required selection controls do not
  have a viable UXP path and the fallback would materially fork the UI contract.

Report evidence:

- Exact SWC packages chosen or rejected
- Exact UXP alias / wrapper facts
- Why the chosen control chain fits Composer better than a generic form picker

### Slice 2: Shared Composer selection primitive

Goal:

- Introduce one reusable Composer-local selection primitive that visually fits
  the bottom control row and supports model / target / aspect-ratio selection.

Allowed:

- `apps/app/src/shared/ui/primitives/**`
- `apps/app/src/shared/ui/components/**`
- `apps/app/src/shared/ui/panel-css.ts`
- `apps/app/tests/**`

Forbidden:

- Editing application/session contracts
- Designing separate control behavior per runtime

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop:

- Stop if the primitive requires host/runtime branching inside shared UI that
  cannot be expressed through the allowed SWC/UXP seam.

Report evidence:

- Primitive API
- Disabled/open/selected/tooltip behavior
- Why it remains UXP-safe

### Slice 3: Composer information-architecture refactor

Goal:

- Rebuild the main-page Composer layout into the confirmed three-layer
  structure, with the attachment tray, input layer, and dual-sided control row.

Allowed:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/panel-css.ts`
- related i18n copy in `apps/app/src/shared/ui/i18n/messages.ts`
- focused tests under `apps/app/tests/**`

Forbidden:

- New page creation
- Main-page concerns unrelated to the Composer slice
- History semantic redesign beyond what Composer state needs

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:chrome`

Stop:

- Stop if the new layout requires route-level expansion or a provider/app-layer
  contract change.

Report evidence:

- Final layer structure
- Final left/right control grouping
- Final label/tooltip/icon decisions

### Slice 4: Placeholder control behavior and local state

Goal:

- Wire the new target / aspect-ratio / prompt-optimization UI so that they have
  coherent local state, disabled rules, and placeholder behavior without
  claiming unfinished backend functionality.

Allowed:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/components/toast-host.tsx`
- `apps/app/src/shared/ui/i18n/messages.ts`
- focused tests under `apps/app/tests/**`

Forbidden:

- Changing real request payloads sent through `packages/application`
- Shipping partial host behavior under ambiguous semantics

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop:

- Stop if placeholder controls require a new cross-package request contract or a
  hidden host behavior change.

Report evidence:

- Default values
- Running-state disable rules
- “即将支持” placeholder behavior
- Send/reset persistence rules for each control

### Slice 5: Chrome evidence and manual UXP verification

Goal:

- Prove the new Composer contract with automated repo-side evidence and then
  record manual-only UXP observations separately.

Allowed:

- `apps/app/tests/**`
- `.test-output/manual/**` only for ignored local screenshots or notes if
  needed during execution
- narrow doc note updates if the chosen SWC pattern needs durable mention

Forbidden:

- Claiming repo-side tests prove real Photoshop host behavior

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm validate`

Stop:

- Stop if the only remaining proof is real UXP host behavior and no manual
  validation window is available.

Report evidence:

- Test coverage added
- Chrome/browser observations
- Separate manual-only UXP observations

## Detailed Development Plan

### Composer structure

- Keep the existing footer ownership and reuse the current attachment tray.
- Make the text input the visual center of gravity.
- Standardize the bottom row into two groups:
  - left group: add attachment, model, target
  - right group: aspect ratio, prompt optimization, send
- Ensure all three selection controls share one visual language.

### Selection controls

- Prefer an SWC-backed selection chain over the current ad hoc chip-only model.
- Do not require the UX to look like a generic enterprise form picker.
- The trigger may stay visually custom if the open state and option list are
  backed by SWC menu/popover primitives.
- The selected value shown in the trigger should stay short.
- Full explanations live in tooltip and option list text.

### Labels and copy

- Target control label in code/docs: `target`
- Target visible options:
  - `图层`
  - `选区`
- Aspect-ratio visible options:
  - `智能`
  - `1:1`
- Prompt optimization tooltip: `优化提示词`
- Prompt optimization placeholder toast: `即将支持`
- Model trigger shows the full current model name unless truncation becomes
  necessary inside the layout.

### Icon direction

- Reuse existing SWC workflow icon infrastructure.
- Candidate icon mapping to verify:
  - prompt optimization -> `magic-wand`
  - target option `图层` -> `layers`
  - target option `选区` -> `selection` or `region-select`
  - aspect-ratio `智能` -> `image-auto-mode`
  - aspect-ratio generic trigger -> short text first, icon optional

### State rules

- Only one Composer dropdown/select surface may be open at a time.
- Running task state disables:
  - add attachment
  - model selection
  - target selection
  - aspect-ratio selection
  - prompt optimization
  - attachment removal
- Send button remains the active execution affordance and shows spinner while
  running.
- After send:
  - clear prompt input
  - clear attachments
  - retain model
  - retain target
  - retain aspect ratio

### Animation and motion

- Keep motion lightweight and structural:
  - attachment tray expand/collapse: opacity + height
  - select surfaces: opacity + small vertical translation
  - Composer focus: border/accent only
- Avoid decorative motion on the send button or repeated hover flourishes.

## Acceptance Plan

### Product/UX acceptance

- Composer visibly reads as three layers.
- Attachments, input, parameters, and actions are easy to distinguish at a
  glance.
- The bottom row no longer looks like an unfinished one-off control strip.
- Full model names remain legible enough to identify the current model.
- Target and aspect ratio are always visible and clearly part of “this send”.
- Prompt optimization looks intentionally unavailable rather than broken.

### Automated acceptance

Add or update tests to cover at minimum:

- attachment tray still works and remains removable
- model / target / aspect-ratio controls open, select, close, and disable
  correctly
- only one select surface opens at a time
- running state disables all non-send Composer controls
- prompt optimization click shows placeholder feedback
- selected target and aspect ratio persist across sends while attachments/input
  clear
- keyboard and outside-click close behavior for the new select surfaces
- layout/contract checks for the new control row structure

### Manual-only UXP acceptance

Run after `pnpm --filter @imagen-ps/app build` and loading `apps/app/dist/manifest.json`
into UXP Developer Tool:

- panel loads without SWC/runtime boot failure
- all new Composer controls render in the real Photoshop panel
- open/close/select interactions work in the host
- tooltip behavior is acceptable or degrades predictably in host
- no host-only rect/invisible-icon regressions appear
- no picker/menu surface is clipped or visually broken at practical panel sizes

Record these as manual evidence only.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- if Chrome-only visual checks matter during execution:
  `pnpm --filter @imagen-ps/app build:chrome`

Final:

- `pnpm validate`

Manual-only:

- Build app package, load `apps/app/dist/manifest.json` in UXP Developer Tool,
  and verify the new Composer in real Photoshop

Live-provider:

- none required for this Loop

## Decision Packet Triggers

- The chosen SWC select/menu path does not have a viable UXP route and a
  fallback would materially fork the shared UI contract.
- The new Composer controls require a cross-package request contract before
  placeholder UI is useful.
- Real Photoshop host behavior is needed to choose between incompatible control
  implementations and no manual validation is available.
- A required SWC wrapper is missing and the replacement plan would broaden the
  owner boundary beyond `apps/app`.
- Baseline failures block attribution of the Composer work.

## Completion Report

- Goal executed:
  Reworked the `apps/app` Composer into a three-layer creation surface (attachment
  tray / text input / dual-sided control row) backed by one reusable SWC-based
  selection primitive (`ComposerSelect`), covering model / target / aspect-ratio
  selection plus a placeholder prompt-optimization affordance, for both Chrome and
  Photoshop UXP, without crossing the `apps/app` owner boundary.

- Slice 1 (SWC selection-chain decision):
  Chosen chain = `sp-action-button` (custom chip trigger) + `sp-popover` +
  `sp-menu` + `sp-menu-item`. Verified via `@swc-uxp-wrappers/utils` `aliases`
  (36 entries) that `action-button` / `menu` / `popover` all have UXP wrappers,
  while `sp-action-menu` has 0 wrapper entries and core `sp-picker` has no wrapper
  (only `picker-button` does). `picker` / `action-menu` therefore rejected. No
  Decision Packet needed — the viable UXP path exists inside the boundary.

- Slice 2 (shared primitive):
  `apps/app/src/shared/ui/components/composer-select.tsx` — controlled single-select
  with custom trigger appearance, `sp-popover` + `sp-menu` surface, disabled / open /
  selected / Escape / outside-click behavior, UXP-safe through the SWC alias seam.

- Slice 3 (information-architecture refactor):
  `main-page.tsx` Composer rebuilt into `cmp-top` (attachments) / `cmp-body` (input) /
  `cmp-bottom` with `cmp-left` (add-image, model, target) and `cmp-right`
  (aspect-ratio, prompt-optimize, send).

- Slice 4 (placeholder behavior + local state):
  `target` (default `图层`/`layer`), `aspectRatio` (default `智能`/`auto`), and
  prompt-optimization (`即将支持` toast) wired with UI-local state; running state
  disables every non-send Composer control; after send, input + attachments clear
  while model / target / aspect-ratio persist.

- Slice 5 (evidence):
  Repo-side automated evidence complete. Manual UXP host verification (load
  `apps/app/dist/manifest.json` in UXP Developer Tool) is the only remaining proof
  and is left for a human validation window per this Loop's stop rule.

- Files inspected:
  `apps/app/src/shared/ui/{app-shell.tsx, pages/main-page.tsx, components/composer-select.tsx,
  components/icons.tsx, components/toast-host.tsx, primitives/spectrum-controls.tsx,
  i18n/messages.ts, panel-css.ts, hooks/use-conversation.ts}`,
  `apps/app/{package.json, vite.uxp.config.ts}`, `apps/app/tests/{fakes.ts, main-page.test.tsx,
  composer-select.test.tsx}`, `@swc-uxp-wrappers/utils` alias table.

- Files changed this turn:
  - `apps/app/src/shared/ui/components/composer-select.tsx` — fixed listener-attachment
    timing bug (added `position` to the menu listener effect deps so `change` / `click`
    / `keydown` handlers attach once the popover is actually in the DOM).
  - `apps/app/tests/composer-select.test.tsx` — added Escape-key close case.
  - `apps/app/tests/main-page.test.tsx` — added 8 acceptance cases (control-row
    contract, target/aspect open-select-close, only-one-open, running-disables,
    prompt-optimize placeholder, persist-after-send, attachment removable,
    outside-click close).
  - `docs/dev-memory/composer-select-swc-chain.md` — new memory note.
  - `MEMORY.md` — index pointer.
  - `docs/loops/2026-06-27-composer-ui-rework-plan.md` — this report + status.
  (The Composer layout, primitive, i18n, icons, CSS, and package/config changes
  were produced earlier on this branch and are validated as part of this Loop.)

- Commands run:
  - `pnpm --filter @imagen-ps/app test` → 115 passed (25 files)
  - `pnpm --filter @imagen-ps/app build` → tsc --noEmit + build:uxp + build:chrome all green
  - `pnpm check:policy` → passed
  - `pnpm validate` → 12/12 tasks successful

- Result:
  All automated gates green. Composer contract proven by tests; manual UXP host
  verification pending.

- Behavior changed:
  - `ComposerSelect` menu items now respond to selection on the *first* open. Before
    the fix, the listener effect ran in the commit where the popover was not yet in
    the DOM (position still null) and never re-ran, so the first open of each select
    was silently dead — model selection fell back to the default and target/aspect
    clicks did nothing. This also restored the “model selection preserved” contract.
  - No cross-package or host-bridge behavior changed.

- Validation evidence:
  - 115 app tests pass, including the new acceptance matrix and the pre-existing
    model-preservation test.
  - `tsc --noEmit` clean (test code incl. deferred-promise override typechecks).
  - Both UXP and Chrome production bundles build.

- Boundary evidence:
  - No edits under `packages/application`, `packages/core-engine`,
    `packages/providers`, or `apps/cli`.
  - No new pages or routes; Composer stays on the main page.
  - Placeholder controls hold UI-local state only; no new request payload contract
    sent through `packages/application`.
  - `pnpm check:policy` passes.

- Risk:
  - Repo-side tests use happy-dom SWC stubs, not real SWC menu/popover behavior, and
    cannot prove real Photoshop host rendering. Manual UXP verification is required
    before claiming the host contract holds (rect/invisible-icon/clipping checks).
  - A never-resolving promise is used in the running-state test; it is cleaned up by
    component unmount and does not affect other tests.

- Follow-up:
  - Manual UXP acceptance pass per the “Manual-only UXP acceptance” checklist.
  - If a future SWC version adds `picker` / `action-menu` UXP wrappers, re-evaluate
    whether the Composer chain should converge further (re-verify with the command
    in the memory note).

- Memory note candidate:
  Recorded → `docs/dev-memory/composer-select-swc-chain.md` (which SWC selection
  chain is safe/reusable across Chrome and UXP, and why picker/action-menu are not).

- Decision Packet, if blocked:
  None. No boundary was crossed and a viable UXP path was found inside `apps/app`.

## Memory Note Candidate

Record if:

- The turn produces a durable engineering fact about which SWC selection
  components are safe/reusable across Chrome and Photoshop UXP for shared
  Composer controls.

Do not record:

- Temporary UI copy choices, transitory screenshots, or unfinished implementation
  plans.
