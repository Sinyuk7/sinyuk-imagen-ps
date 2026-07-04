Status: draft
Authority: current user request; root `AGENTS.md` still declares Active Loop: none
Owner: `apps/app` shared UI settings surface
Created: 2026-07-05

# Status Notice Contract Reset

## Context docs

- `AGENTS.md`: current-state, harness-first loop contract; no active loop.
- `docs/agent/LOOP.md`: Loop metadata, scope, validation, stop rules, completion report.
- `docs/TESTING.md`: mock-only development gates; `pnpm check:policy`, focused `@imagen-ps/app` tests, final `pnpm validate`.
- `apps/app/AGENTS.md`: shared UI theme source, toast contract, motion system, UXP CSS contract, i18n boundary.
- `docs/ENGINEERING_CONTEXT.md`: only for shared UI theme/token ownership and UXP-safe CSS boundaries.

Narrow current-state probes:

- `apps/app/src/shared/ui/components/status-notice.tsx`: thin inline wrapper over `NoticeView`.
- `apps/app/src/shared/ui/components/notice.tsx`: shared notice state, default role/icon/live semantics, copy behavior, inline/toast rendering.
- `apps/app/src/shared/ui/styles/pages.ts`: current inline notice visuals and mixed `color-mix(...)` surface styling.
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- `apps/app/src/shared/ui/provider-status.ts`

## Goal

Split stable field guidance from dynamic inline status in `apps/app`, then land a token-backed inline notice contract that matches current settings usage, UXP CSS limits, and toast separation.

Observable outcome:

- stable capability/help copy no longer depends on `StatusNotice`;
- `StatusNotice` only owns dynamic inline status semantics;
- inline notice defaults restore icon / role / `aria-live` behavior instead of silently omitting them;
- inline notice visuals use generated app semantic notice tokens instead of ad hoc border + `color-mix(...)`;
- current settings pages keep working under mock-only tests.

## Non-goals

- No `packages/application`, `packages/providers`, `packages/core-engine`, or Photoshop host IO changes.
- No toast contract rewrite or toast token redesign.
- No new browser-only CSS patterns outside the documented UXP CSS contract.
- No main-page prompt/composer redesign.
- No live Photoshop, UDT, or provider validation.
- No broad design-system rewrite outside the touched notice/help surfaces.

## Scope

Allowed:

- `apps/app/src/shared/ui/components/notice.tsx`
- `apps/app/src/shared/ui/components/status-notice.tsx`
- new shared UI component files under `apps/app/src/shared/ui/components/` for field help / field hint if needed
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- `apps/app/src/shared/ui/styles/generated/theme-css.ts` only through generator output
- `apps/app/scripts/generate-theme-css.mjs`
- `apps/app/src/shared/ui/i18n/messages.ts` only if copy shifts require new localized strings
- focused `apps/app/tests/` coverage for settings UI / notice semantics / theme source

Forbidden:

- `packages/**`
- `apps/app/src/adapters/**`
- `apps/app/src/shared/ui/styles/overlays.ts` except if a final test requires a harmless type/export alignment with unchanged toast behavior
- `apps/app/src/shared/ui/pages/main-page.tsx`
- unrelated settings/product copy cleanups
- docs outside this Loop before implementation proves a durable design-system rule worth promoting

## Ownership boundary

- `apps/app/src/shared/ui/components`: owns field-help vs inline-status component semantics and rendering contracts.
- `apps/app/src/shared/ui/styles` plus `apps/app/scripts/generate-theme-css.mjs`: own app semantic notice token generation and UXP-safe styling.
- `apps/app/src/shared/ui/pages` and `provider-status.ts`: own usage classification for current settings flows.
- Toast remains owned by existing shared toast primitives; this Loop must not collapse toast and inline status back into one product shape.

## Baseline

Before implementation, run:

- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`

If baseline fails before edits:

- record the failing command and first relevant failure;
- continue only if the failure is clearly unrelated to notice/help surfaces;
- stop with a Decision Packet if baseline blocks attribution.

Current repository status note:

- user changes already exist in `apps/app/src/shared/ui/pages/settings-add-page.tsx` and `apps/app/src/shared/ui/pages/settings-detail-page.tsx`;
- `apps/app/src/shared/ui/pages/main-page.tsx` is also dirty but out of scope;
- executing agents must re-read touched files before editing and must not revert unrelated user work.

## Slices

### 1. Usage classification and field-help split

Goal:

- classify current `StatusNotice` usages into `FieldHint`-style stable guidance vs dynamic inline status, and move the stable settings guidance path to a lighter component contract.

Allowed scope:

- `apps/app/src/shared/ui/components/`
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- settings pages listed in Scope
- focused app tests for affected settings flows

Required outcomes:

- define a narrow field-help component or equivalent pattern for stable control-group guidance;
- move the model-discovery / capability-limitation messaging away from `StatusNotice`;
- keep dynamic warnings/errors on `StatusNotice`.

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- stop if a usage cannot be classified without product-direction ambiguity, and produce a Decision Packet listing each candidate semantic (`FieldHint` / `StatusNotice` / `Toast`) with evidence.

### 2. StatusNotice contract cleanup

Goal:

- make inline notice props match real inline behavior instead of inheriting toast-only options.

Allowed scope:

- `apps/app/src/shared/ui/components/notice.tsx`
- `apps/app/src/shared/ui/components/status-notice.tsx`
- direct call sites in Scope
- focused tests

Required outcomes:

- restore default icon / role / `aria-live` behavior for inline notices;
- remove or narrow props that are misleading for inline usage, especially auto-dismiss semantics;
- split copy behavior so message/detail actions are explicit if both are needed;
- keep UXP-safe inline layout for multiline content and trailing actions.

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- stop if preserving backward compatibility for current callers requires keeping contradictory prop semantics; produce A/B/C choices for deprecate vs preserve vs dual-mode contract.

### 3. Notice semantic tokens and visual reset

Goal:

- replace the current border-heavy, ad hoc mixed inline notice surface with generated semantic notice tokens and one consistent anatomy for dynamic inline status.

Allowed scope:

- `apps/app/scripts/generate-theme-css.mjs`
- `apps/app/src/shared/ui/styles/pages.ts`
- generated theme output through the generator
- focused tests checking theme/source or CSS contract if needed

Required outcomes:

- introduce generated app semantic notice tokens for background / foreground / icon by tone;
- remove inline notice dependence on ad hoc `color-mix(...)` surfaces where tokenized values should exist;
- keep toast on `--toast-*` and avoid accidental toast style regressions;
- stay within the documented UXP CSS contract.

Validation:

- `pnpm --filter @imagen-ps/app theme:generate`
- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`

Stop rule:

- stop if the desired token layer cannot be generated without broad theme-system redesign outside `apps/app`; produce a Decision Packet for minimal token patch vs broader theme contract change.

### 4. Final settings-surface verification

Goal:

- verify the refactor as one bounded `apps/app` UI slice with no toast or main-page regression claims.

Allowed scope:

- no new product work; only fixes needed for touched tests/policy gates

Validation:

- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`
- `pnpm validate`

Manual-only:

- optional human visual spot-check in Chrome harness or UXP after implementation, but not required proof for this Loop

Stop rule:

- stop if final verification failures land outside touched shared UI notice/help surfaces and cannot be attributed locally.

## Validation

- quick:
  - `pnpm check:policy`
- per-slice:
  - `pnpm --filter @imagen-ps/app test`
  - `pnpm --filter @imagen-ps/app theme:generate`
- final:
  - `pnpm validate`
- manual-only:
  - optional Chrome/UXP visual spot-check of affected settings pages; cite only as human observation, not as automated proof
- live-provider:
  - none

## Decision Packet triggers

- a current usage has multiple plausible product semantics and code/tests/docs do not settle it;
- token extraction needs a theme-system redesign broader than notice/help surfaces;
- inline notice backward compatibility conflicts with removing misleading props;
- a requested layout/animation pattern would violate the UXP CSS or motion contract;
- baseline or final failures prevent attributing changes to the touched `apps/app` surface.

## Completion report

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

## Memory note candidate

- yes: `decision`, if the implementation lands a durable product rule separating field help, inline status, and toast in `apps/app` shared UI authority;
- otherwise no.
