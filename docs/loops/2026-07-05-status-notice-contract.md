Status: active
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

- stable capability/help copy no longer depends on `StatusNotice` and instead uses a field-associated `FieldHelp`;
- `StatusNotice` only owns dynamic inline status semantics;
- inline notice defaults restore icon behavior but do not infer announcement semantics from tone;
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
- `apps/app/src/shared/ui/components/field-help.tsx` if needed
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

## Usage classification

- stable capability, requirement, or control-group explanation -> `FieldHelp`
- field-level validation associated with one control or control group -> `FieldHelp` with `negative` tone
- dynamic page-local result produced by an operation -> `StatusNotice`
- transient global operation confirmation -> existing `Toast`
- blocking form errors remain visible and must not auto-dismiss
- the current model-discovery limitation copy in provider settings is explicitly a `FieldHelp`, not a `StatusNotice`

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

### 1. Usage classification and FieldHelp split

Goal:

- classify current `StatusNotice` usages using the rules above, and move the stable settings guidance path to a lighter `FieldHelp` contract.

Allowed scope:

- `apps/app/src/shared/ui/components/`
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- settings pages listed in Scope
- focused app tests for affected settings flows

Required outcomes:

- define a narrow `FieldHelp` component or equivalent pattern for stable control-group guidance;
- move the model-discovery / capability-limitation messaging away from `StatusNotice`;
- `FieldHelp` is visually lighter than `StatusNotice`: no background block, no status-banner container treatment, text-first with optional small icon only;
- `FieldHelp` exposes a stable `id` so the owning field or field group can reference it via `aria-describedby`;
- keep dynamic warnings/errors on `StatusNotice`.

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- stop if a new usage outside the explicit rules cannot be classified without product-direction ambiguity, and produce a Decision Packet listing each candidate semantic (`FieldHelp` / `StatusNotice` / `Toast`) with evidence.

### 2. StatusNotice contract cleanup

Goal:

- make inline notice props match real inline behavior instead of inheriting toast-only options.

Allowed scope:

- `apps/app/src/shared/ui/components/notice.tsx`
- `apps/app/src/shared/ui/components/status-notice.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- direct call sites in Scope
- focused tests

Required outcomes:

- default icon is derived from tone unless explicitly overridden;
- announcement semantics are independent from tone and default to none;
- prefer one explicit announcement contract such as `announcement?: 'none' | 'polite' | 'assertive'`; do not expose contradictory inline combinations of `role` and `ariaLive`;
- remove inline auto-dismiss and duration props from inline notice usage;
- replace ambiguous `copyable` / `detailCopyable` props with one optional explicit `copyText`;
- render at most one copy action and one product action;
- presentation mappings used by inline notices must not expose or consume `durationMs`;
- existing toast mappings and toast duration behavior remain unchanged;
- split helpers only if the current shared mapping cannot preserve that boundary clearly;
- preserve existing toast behavior unchanged;
- notice root uses flex layout without a fixed height;
- multiline alignment is top-aligned, not vertically centered; keep icon/content/actions aligned with `flex-start`, not `center`;
- content column uses `min-width: 0`;
- message/detail allow normal wrapping and breaking of long URLs or IDs;
- trailing actions do not shrink;
- narrow layout may wrap actions below content without truncating the message.

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

- introduce generated app semantic notice tokens for at least background / foreground / icon / border by tone;
- generated tokens must be the only source of tone-specific inline notice colors;
- enforce a solid subtle background for dynamic inline status banners and remove component-level border drawing; do not reintroduce border-heavy banner styling;
- if a border token exists for compatibility, it must not lead to visible banner-style outlines by default;
- remove inline notice dependence on ad hoc `color-mix(...)` surfaces where tokenized values should exist;
- keep toast on `--toast-*` and avoid accidental toast style regressions;
- `pages.ts` must not retain inline notice `color-mix(...)` or tone-specific hard-coded color values;
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

- required human observation in Chrome harness after implementation:
  - inspect affected settings surfaces at approximately `220`, `280`, `320`, and `480` px container widths;
  - cover one-line, multiline, long URL/model ID, detail, copy action, and dismiss action states;
  - record observations in the completion report;
  - Photoshop/UDT observation remains optional extra evidence, not required proof

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
  - required Chrome harness visual observation at `220`, `280`, `320`, and `480` px container widths for one-line, multiline, long token/URL, copy, and dismiss states; cite as human observation, not automated proof
  - optional UXP/Photoshop spot-check as extra evidence only
- live-provider:
  - none

## Decision Packet triggers

- a current usage has multiple plausible product semantics and code/tests/docs do not settle it;
- token extraction needs a theme-system redesign broader than notice/help surfaces;
- inline notice backward compatibility conflicts with removing misleading props;
- a requested layout/animation pattern would violate the UXP CSS or motion contract;
- baseline or final failures prevent attributing changes to the touched `apps/app` surface.
- the current shared `provider-status.ts` mapping cannot stop leaking toast-only semantics such as `durationMs` into inline notice usage without a clearer split.

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
- Human observation:
- Decision Packet, if blocked:

## Memory note candidate

- yes: `decision`, if the implementation lands a durable product rule separating field help, inline status, and toast in `apps/app` shared UI authority;
- otherwise no.
