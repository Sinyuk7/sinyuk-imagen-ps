# Motion / Interaction System for Photoshop UXP

## Metadata

- **Status**: active
- **Authority**: root `AGENTS.md` points to this document; current user turn authorizes this rewrite
- **Owner**: `apps/app` shared UI surface
- **Created**: 2026-06-30
- **Superseded by**: (none)

## Context docs

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md` (UXP research authority order)
- `docs/dev-memory/memories/bug/uxp-first-frame-spectrum-geometry.md`
- `apps/app/tests/uxp-css-compat.test.ts` (project policy gate)
- `.local/share/uxp/src/pages/uxp-api/known-issues.md` (CSS transitions / animations unsupported)
- `.local/share/uxp/src/pages/uxp-api/changelog3P.md` (`CSSNextSupport` feature flag)

## Goal

Deliver a `@tweenjs/tween.js` driven Motion System inside `apps/app` that clarifies state, preserves object continuity, and provides consistent async feedback across Main / History / Settings, while strictly respecting the project's CSS policy:

- no CSS transitions, CSS animations, or keyframes;
- no `box-shadow`, `filter`, `backdrop-filter`, `gap`, `margin` shorthand, or `font` shorthand;
- `transform` allowed **only** via JS-driven `style.transform` and **only** for `translateX` / `translateY` / `scale`;
- all motion must degrade to a functional static state if the host cannot render it.

The system must keep the default CI gate green and provide a clear manual Photoshop/UXP smoke checklist for host behavior that cannot be proven in Chrome or unit tests.

## Non-goals

- Do not introduce any animation library other than `@tweenjs/tween.js`.
- Do not use CSS transitions, CSS keyframes, Web Animations API, or SVG SMIL.
- Do not use `transform: rotate`, `skew`, `matrix`, or 3D transforms.
- Do not animate layout properties for in-flow elements (`width`, `height`, `margin`, `padding`, `scrollTop`, `flex-basis`).
- Do not modify runtime, application, provider, or foundation packages.
- Do not make live provider calls part of default validation.
- Do not treat decorative effects (ripple, bounce, strong overshoot, rotated chevrons) as system defaults.

## Scope

### Allowed

- `apps/app/src/shared/ui/motion/` — runtime, controller, presence, tokens, preference, recipes, hooks.
- `apps/app/src/shared/ui/styles/*.ts` — add motion-ready classes and UXP-safe state hooks; no banned properties.
- `apps/app/src/shared/ui/components/*` and `apps/app/src/shared/ui/pages/*` — bind motion recipes to state.
- `apps/app/tests/*` and new motion unit/harness tests.
- `apps/app/package.json` — add `@tweenjs/tween.js` dependency.
- `apps/app/public/manifest.json` — add explicit `featureFlags.CSSNextSupport: true`.

### Forbidden

- Changes outside `apps/app` except dependency lockfile updates.
- Any source that contains `transition:`, `animation:`, `@keyframes`, `box-shadow:`, `filter:`, `backdrop-filter:`, `gap:`, `margin:` shorthand, or `font:` shorthand.
- `transform:` in CSS strings or JSX inline style objects; transform must be applied through JS DOM `style.transform` only.
- `transform: rotate(...)`, `skew(...)`, `matrix(...)`, or any 3D transform.
- Direct animation of native form element internals (use wrapper elements).
- Hard-coded durations / easings outside `motion-tokens.ts`.
- Animation that delays disabled state, focus management, or keyboard events.

## Ownership boundary

This slice is owned by the `apps/app` surface. It must not import new contracts from `@imagen-ps/application`, `@imagen-ps/core-engine`, or `@imagen-ps/providers` beyond what the shared UI already consumes. Existing hooks (`use-conversation`, `use-provider-settings`, etc.) remain the source of truth; motion only reflects their state.

## Baseline

Before any slice implementation:

```bash
pnpm validate
```

must pass. If it fails, report the failure and stop until the baseline is restored.

Per-slice baseline:

```bash
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
pnpm --filter @imagen-ps/app test
```

must pass before claiming the slice is done. `apps/app/tests/uxp-css-compat.test.ts` is an especially important gate for this Loop because it enforces the no-transition / no-animation / no-CSS-transform policy.

## Current UI architecture facts

- The UI is now fully native: `apps/app/src/shared/ui/primitives/native-controls.tsx` owns `Button`, `ActionButton`, `TextField`, `Checkbox`, etc. There are no Spectrum Web Components or `sp-*` elements in the shared UI.
- `ToastHost` renders a native `<div className="ui-toast">`; it no longer depends on `sp-toast`.
- `ComposerSelect` uses a native `<button>` trigger (`composer-select-trigger-button.tsx`) and a native `<div>` menu (`composer-select-menu.tsx`).
- All panel styles are injected from `apps/app/src/shared/ui/styles/*.ts` and concatenated in `panel-css.ts`.
- `uxp-css-compat.test.ts` scans every `.ts/.tsx` under `src/shared/ui` for banned patterns, including inline `transform:`, `transition:`, and `animation:`.
- `main-page.tsx` still dims the whole Composer with `.cmp-shell.off` (`opacity: .38; pointer-events: none`). The Motion System will fade that state but will not, in the first implementation, change the underlying disabled-appearance policy.
- Spinner icons currently use a static `spinner` SVG and a dead `.spin` class. The Motion System will replace this with an opacity-based activity indicator by default; SVG attribute rotation may be introduced only after real-host verification.
- `placeAsset()` in `main-page.tsx` has no local button state. The Motion System will add a per-round `placeStatus` state machine (`idle → placing → placed → idle`).
- `apps/app/public/manifest.json` did not declare `CSSNextSupport`, so it has been updated to add `featureFlags.CSSNextSupport: true` before any transform-based motion is used.

## Motion Language

### Character

Precise, restrained, fast, interruptible, and tool-like. Motion explains state; it does not entertain.

The system is **opacity-first, transform-second**:

- `opacity` is the primary motion property and is officially supported in UXP.
- `transform: translateX / translateY / scale` are allowed for spatial emphasis, but only via JS `style.transform` and only after `CSSNextSupport` is explicitly enabled.
- `transform: rotate` is not a system default; chevrons and spinners use opacity or verified SVG attributes instead.

### Levels

| Level | Purpose | Typical duration |
|---|---|---|
| L1 Direct feedback | Button press, trigger active, icon switch, menu item selection | 70–110 ms |
| L2 Component state | Popover open/close, Toast enter/exit, attachment add/remove, back-to-bottom | enter 140–180 ms, exit 90–130 ms |
| L3 Business continuity | Send→Running, Running→Result, Error→Retry→Running, Optimize→Undo, Place→Placed | 160–240 ms |
| L4 Content reveal | Image reveal, new Round, History locate, page content first enter | 180–260 ms |
| L5 Ambient activity | Real async work only | opacity pulse 750–900 ms/cycle, linear |

### Easing tokens

```ts
MOTION_EASING = {
  enter: Easing.Cubic.Out,
  exit: Easing.Quadratic.In,
  move: Easing.Quadratic.InOut,
  emphasis: Easing.Quadratic.Out,
  linear: Easing.Linear.None,
}
```

`Elastic`, `Bounce`, and strong `Back.Out` are not system defaults.

### Geometry limits

```ts
MOTION_OPACITY = { hidden: 0, visible: 1, dim: 0.38 }
MOTION_TRANSLATE = { micro: 2, small: 4, medium: 8 }
MOTION_SCALE     = { subtleIn: 0.98, emphasisIn: 0.96, press: 0.98 }
```

- Default translation must not exceed `8px`.
- Default scale must not go below `0.96`.
- Rotation is not a default motion property.

## Core design models

### State-first motion

State changes first; motion only explains the change.

```text
business state change
→ UI enters the new state immediately (disabled, focused, mounted)
→ motion tween visual properties from the previous state to the new state
```

Never block business actions on animation completion.

### Object continuity

The same Round, attachment, button, or menu should remain the same object across state changes.

```text
RoundItem                 (stable)
  ├─ UserMessage          (stable)
  └─ ProviderSurface      (stable)
        ├─ RunningState
        ├─ ResultState
        └─ ErrorState     (crossfade, no unmount/remount of the whole card)
```

### One primary motion per interaction

A single user action should produce one primary motion. Supporting changes may be subtle and must not compete for attention.

### Feedback hierarchy

| Channel | Use for | Example |
|---|---|---|
| Button status | Pending / success / undo / retry on the control that was pressed | Send, Place, Capture, Optimize, Retry |
| Inline status | Local outcomes with a clear surface | Provider test result, save result, place error |
| Round status | Job lifecycle inside the conversation | Running, result, error |
| Toast | Global events or results outside the current view | Session cleared, background failure, copy success |

## UXP constraints

- CSS transitions and CSS animations are **not supported** in UXP. All motion must be driven by JavaScript writing `style` properties each frame.
- `opacity` is supported since UXP v2.
- `transform` functions (`translateX`, `translateY`, `scaleX`, `scaleY`) and `transform-origin` are available in UXP 8.0.1+ when `CSSNextSupport` is enabled.
- This project targets Photoshop 26.1 / UXP 8.1, so transform support is available **if and only if** `CSSNextSupport` is explicitly declared in `manifest.json`.
- Because `manifest.json` did not declare `enableSWCSupport`, the Motion System must add an explicit `featureFlags.CSSNextSupport` entry before using any transform.
- `requestAnimationFrame` is used in the existing codebase but is not officially documented as a guaranteed UXP API. The Phase 0 prototype must confirm it is stable in Photoshop 26.1 / UXP 8.1; a `setTimeout(16)` fallback must be retained.
- First-frame geometry instability is documented in `docs/dev-memory/memories/bug/uxp-first-frame-spectrum-geometry.md`. Do not base animation start values on geometry measured during the first render frame.
- `will-change`, `filter`, `backdrop-filter`, and `box-shadow` are not allowed.

## Architecture

```text
@tweenjs/tween.js
  ↓
MotionRuntime       (single RAF/timer loop, single Group)
  ↓
MotionController    (play / stop / finish / isRunning)
  ↓
MotionPresence      (mount → entering → entered → exiting → unmount)
  ↓
MotionRecipes       (fade, slide-fade, scale-pop, icon-crossfade,
                     button-state, popover-presence, toast-presence,
                     content-crossfade, image-reveal, surface-highlight,
                     attachment-presence, floating-control-presence,
                     page-crossfade, activity-pulse, optional rotate-loop)
  ↓
Feature components  (MainPage, ComposerSelect, ToastHost, etc.)
```

### Directory

```text
apps/app/src/shared/ui/motion/
  motion-runtime.ts
  motion-controller.ts
  motion-clock.ts
  motion-tokens.ts
  motion-preference.ts
  motion-presence.ts
  motion-transform-guard.ts
  motion-debug.ts
  motion-types.ts
  recipes/
    fade.ts
    slide-fade.ts
    scale-pop.ts
    icon-crossfade.ts
    button-state.ts
    popover-presence.ts
    toast-presence.ts
    content-crossfade.ts
    image-reveal.ts
    surface-highlight.ts
    attachment-presence.ts
    floating-control-presence.ts
    page-crossfade.ts
    activity-pulse.ts
    rotate-loop.ts              // optional, only after real-host SVG verification
  react/
    use-motion-controller.ts
    use-motion-presence.ts
    use-motion-preference.ts
```

### MotionRuntime

- Owns one `Tween.Group`.
- Starts a scheduler only when active tween count > 0.
- Stops the scheduler when no tweens remain.
- Freezes and resumes on `visibilitychange`.
- Provides a manual clock API for tests.

### MotionController

Command-style API:

```ts
interface MotionController {
  play(recipe: MotionRecipe): MotionHandle
  stop(channel?: MotionChannel): void
  finish(channel?: MotionChannel): void
  isRunning(channel?: MotionChannel): boolean
}
```

Channels:

- `presence` — mount/unmount lifecycle, highest priority.
- `state` — icon crossfade, button state, content crossfade.
- `highlight` — transient emphasis (attachment added, place success, round locate).
- `ambient` — activity pulse.

### Transform guard

`motion-transform-guard.ts` validates every transform string before it is applied:

```text
allowed:  translateX(...) translateY(...) scale(...) scaleX(...) scaleY(...)
forbidden: rotate(...) skew(...) matrix(...) matrix3d(...) perspective(...) rotateX/Y/Z(...)
```

If a recipe tries to build a forbidden transform, it throws in development and falls back to opacity-only in production.

### Style property ownership

One DOM wrapper can have only one tween owner per CSS property. Separate layout wrappers from motion wrappers. If a button already owns `transform` for a menu animation, do not add an independent press-scale tween to the same node.

Allowed properties per recipe:

| Recipe | Allowed properties |
|---|---|
| fade | opacity |
| slide-fade | opacity, transform (translate only) |
| scale-pop | opacity, transform (scale only) |
| icon-crossfade | opacity |
| button-state | opacity, backgroundColor, color, transform (scale only on a wrapper) |
| popover-presence | opacity, transform (translate only) |
| toast-presence | opacity, transform (translate only) |
| content-crossfade | opacity |
| image-reveal | opacity |
| surface-highlight | opacity (overlay) |
| attachment-presence | opacity, transform (translate/scale) |
| floating-control-presence | opacity, transform (translate only) |
| page-crossfade | opacity, transform (translate only) |
| activity-pulse | opacity |
| rotate-loop | SVG transform attribute only, gated by real-host verification |

No recipe may write `transition`, `animation`, `boxShadow`, `filter`, `backdropFilter`, `gap`, `margin`, or `font`.

### MotionPreference

```ts
type MotionPreference = 'system' | 'reduce' | 'full'
```

- `system`: reads `prefers-reduced-motion` if available; falls back to `full`.
- `reduce`: only the minimum necessary state change (near-instant opacity or no motion).
- `full`: full motion.

The `reduce` path must keep every business function working.

## Slices

### Slice 0 — Motion infrastructure + manifest safety

**Goal**: Establish the UXP prerequisites and prove Tween.js can run safely under the project's CSS policy, with a single runtime, presence lifecycle, transform guard, and no-animation fallback.

**Allowed scope**:

- Add `@tweenjs/tween.js` to `apps/app`.
- Add explicit `CSSNextSupport` to `apps/app/public/manifest.json`:
  ```json
  {
    "featureFlags": {
      "CSSNextSupport": true
    }
  }
  ```
- Create `motion-runtime.ts`, `motion-controller.ts`, `motion-tokens.ts`, `motion-preference.ts`, `motion-presence.ts`, `motion-transform-guard.ts`, `motion-debug.ts`, and minimal recipes: `fade`, `slide-fade`, `scale-pop`, `icon-crossfade`, `activity-pulse`, `popover-presence`.
- Add unit tests that drive time manually via `group.update(time)`.
- Create a minimal UI harness page (e.g. `/harness=motion-prototype` in Chrome shell) with one popover, one activity pulse, and one icon crossfade.
- Run `apps/app/tests/uxp-css-compat.test.ts` after adding any new styles to prove no banned patterns were introduced.

**Validation**:

- quick: `pnpm check:policy`
- per-slice: `pnpm --filter @imagen-ps/app test`; `pnpm --filter @imagen-ps/app build:uxp`; `pnpm --filter @imagen-ps/app build:chrome`
- manual-only: load the built UXP panel in Photoshop 26.1 and verify transform-based motion renders correctly and that disabling motion leaves every button clickable and every field usable.

**Stop rule**: If `requestAnimationFrame` is missing or unstable, or if `CSSNextSupport` does not enable `translate` / `scale` in real UXP, produce a Decision Packet before moving to Slice 1.

### Slice 1 — Core generation loop

**Goal**: Make the main generate/edit flow feel continuous: Round shell stays stable, image reveals smoothly, and Place/Capture/Optimize/Send buttons give complete async feedback.

**Allowed scope**:

- `main-page.tsx` Round rendering refactor: keep the existing `round-item` + `msg-prov` structure but make `RunningState`, `ResultState`, `ErrorState` crossfade through `content-crossfade` rather than full unmount/remount.
- `button-state` recipe on Send, Capture, Optimize, and Place controls.
- `image-reveal` recipe for result images (`onload` trigger).
- `surface-highlight` recipe for Place success, Capture attachment added, and Optimize prompt changed.
- `activity-pulse` recipe for the running dots inside `.prov-loading`.
- `toast-presence` recipe for Toast enter/exit.
- Fade `.cmp-shell.off` opacity between `1` and `0.38` instead of jumping.
- Add local per-round `placeStatus` state (`idle → placing → placed → idle`) to the Place button.

**Validation**:

- per-slice: existing `main-page.test.tsx` and new motion tests pass; builds pass; `uxp-css-compat.test.ts` passes.
- manual-only: run a full mock job in UXP — Send, Running, Result, Place success, Place error, Retry, Capture, Optimize/Undo.

**Stop rule**: If preserving Round continuity requires changing `packages/application` or `@imagen-ps/core-engine`, stop and produce a Decision Packet.

### Slice 2 — Overlays and selectors

**Goal**: Unify Provider menu, ComposerSelect, attachment presence, and back-to-bottom with opacity + translate recipes.

**Allowed scope**:

- Header Provider menu: `popover-presence` recipe.
- `composer-select.tsx` and `composer-select-menu.tsx`: `popover-presence` recipe.
- `attachment-presence` recipe for add/remove.
- `floating-control-presence` for back-to-bottom.
- Focus management must remain correct during enter/exit.
- No chevron rotation; chevron state remains an instant color/opacity change.

**Validation**:

- per-slice: ComposerSelect and main-page tests pass; builds pass; `uxp-css-compat.test.ts` passes.
- manual-only: keyboard open/close, rapid open/close, rapid attach/remove, compact panel.

**Stop rule**: If popover positioning requires measuring first-frame geometry from native elements, stop and adjust the recipe.

### Slice 3 — Navigation and content continuity

**Goal**: Make History→Main locate, Round highlight, page changes, and image carousel feel connected.

**Allowed scope**:

- `app-shell.tsx`: `page-crossfade` for view changes; optional slight `translateX` only for parent-child transitions.
- `history-page.tsx` → `main-page.tsx` Round locate: scroll first, then `surface-highlight` overlay on the target Round.
- Image carousel in result card: `content-crossfade` between previews (or `slide-fade` after real-host verification).
- New Provider add/delete in Settings: `attachment-presence`-style presence.

**Validation**:

- per-slice: history/settings tests pass; builds pass; `uxp-css-compat.test.ts` passes.
- manual-only: locate Round from History, switch views rapidly, use compact panel.

**Stop rule**: If page exit animations require both pages to accept pointer events simultaneously, stop and simplify to crossfade.

### Slice 4 — Audit and responsive motion

**Goal**: Harden the system for reduced motion, responsive panel modes, long conversations, and performance.

**Allowed scope**:

- Respect `MotionPreference.reduce` across all recipes.
- Tune durations/offsets for `compact`, `regular`, `wide`, `short` panel modes via `data-panel-width-mode` / `data-panel-height-mode`.
- Add `motion-debug.ts` dev-mode diagnostics: active tween count, orphan count, scheduler state.
- Scan for hard-coded durations/easings outside tokens and for any banned property strings (`transition:`, `animation:`, `rotate`, etc.).
- Add component tests for rapid triggers, unmount cleanup, reduced motion, and no-animation fallback.

**Validation**:

- quick: `pnpm check:policy`
- per-slice: `pnpm --filter @imagen-ps/app test`
- final: `pnpm validate`
- manual-only: 30+ Round list, large image decode, panel resize, hidden/shown panel, reduced-motion preference.

**Stop rule**: If any animation causes layout recalculation on every frame (e.g. animating `height`, `scrollTop`, or in-flow `margin`) or triggers full React tree renders, stop and refactor the recipe.

## Validation categories

| Category | Command / workflow | Notes |
|---|---|---|
| quick | `pnpm check:policy` | mechanical checks only |
| per-slice | `pnpm --filter @imagen-ps/app test`; `pnpm --filter @imagen-ps/app build:uxp`; `pnpm --filter @imagen-ps/app build:chrome` | must pass before claiming slice; `uxp-css-compat.test.ts` is required |
| final | `pnpm validate` | default closeout gate |
| manual-only | UXP Developer Tool + Photoshop 26.1 smoke checklist | does not prove behavior in CI |
| live-provider | not used | never part of default validation |

### Manual-only smoke checklist

- [ ] Panel loads with no console errors and no orphan tweens.
- [ ] Open/close Provider menu 10 times rapidly; no stuck open/closed state.
- [ ] Open/close Model and Ratio menus; no layout jumps.
- [ ] Add and remove attachments rapidly; no detached thumbnails or lingering highlight.
- [ ] Send a prompt; Send button switches to activity state; new Round fades/slides in; Running card appears without list jump.
- [ ] Wait for result; image fades in; Place button shows placing / placed states.
- [ ] Retry an error Round; Error surface crossfades to Running without unmounting the Round.
- [ ] Capture from Photoshop; Capture button shows activity, attachment highlight appears.
- [ ] Optimize prompt; button crossfades to activity, then Undo; prompt highlight overlay appears.
- [ ] Trigger Toast; rapid second Toast replaces first and resets timer.
- [ ] Switch to History, locate a Round; scroll and highlight behave correctly.
- [ ] Compact panel: reduce motion distances visually; no clipped menus.
- [ ] Short panel: back-to-bottom does not overlap Composer.
- [ ] Panel hidden and reshown: no animation burst or resumed stale tweens.
- [ ] Reduced motion: all functions work; enter/exit are near-instant.
- [ ] No-animation fallback: disable motion globally; every button, menu, and Round remains fully functional.

## Decision Packet triggers

Produce a Decision Packet (A/B/C with evidence and recommendation) if any of the following occur:

1. `requestAnimationFrame` is unavailable or causes dropped frames in Photoshop 26.1.
2. `CSSNextSupport` in `manifest.json` does not enable `translate` / `scale` in real UXP after SWC removal.
3. Transform-based motion causes layout loops, blurry text, or host instability in UXP.
4. A required effect cannot be achieved without `transition`, `animation`, `box-shadow`, `filter`, or `backdrop-filter`.
5. Preserving Round continuity requires changes outside `apps/app`.
6. Real Photoshop smoke contradicts Chrome or unit-test evidence.

## Completion report

When this Loop is completed, report:

- Goal executed:
- Files inspected / changed:
- Behavior delivered:
- Contract decisions:
- Validation commands and results:
- Manual Photoshop evidence:
- Known limitations / risks:
- Decision Packet or follow-up:
- Documentation / memory writeback:

## Memory note candidate

Yes: `architecture` record for UXP motion constraints, `CSSNextSupport` dependency, and transform ownership; `decision` record if the no-rotate / no-CSS-transform policy is changed or reaffirmed.
