## Adobe Photoshop UXP Research

For any Photoshop UXP, Photoshop DOM, BatchPlay, Imaging API, Manifest,
UXP HTML/CSS, Spectrum Web Components, or SWC wrapper question:

1. Inspect the repository's actual Photoshop version, UXP version,
   manifest version, SWC version, and wrapper aliases first.

2. Search the local official Adobe documentation mirrors before relying
   on memory:

   - .local/share/uxp-photoshop
   - .local/share/uxp
   - .local/share/uxp-photoshop-plugin-samples
   - ~/Documents/github/monorepo

3. Use this authority order:

   a. Current repository code and locked dependency versions
   b. Adobe Photoshop UXP official documentation
   c. Adobe generic UXP documentation
   d. Adobe official samples
   e. Adobe changelog and known issues
   f. Adobe GitHub issues and Adobe Community
   g. Third-party sources

4. Never infer UXP support from normal browser compatibility.
   Verify HTML elements, attributes, CSS properties, Web APIs, and
   Spectrum APIs against the project's actual UXP version.

5. Never apply current SWC or Spectrum 2 documentation to a project
   locked to SWC 0.37.0 unless compatibility is proven from source.

6. For conflicting documentation, inspect:
   - the installed package source
   - @swc-uxp-wrappers implementation
   - Adobe official samples
   - the real Photoshop UXP runtime

7. For repo-owned real Photoshop UXP runtime inspection, default to:

   ```sh
   node scripts/uxp-debug/uxp-debug.mjs
   ```

   Use it for targets, `eval`, `inspect`, `ancestors`, runtime style/reset,
   and relay-backed console inspection before inventing ad hoc workflows.

7. Clearly distinguish:
   - officially documented support
   - official sample behavior
   - wrapper-specific behavior
   - community workaround
   - unverified assumption

## i18n Boundary

UI localization is an `apps/app` surface concern. `createPluginHostShell()` reads UXP `host.uiLocale`, normalizes it to `en` or `zh-CN` via `apps/app/src/shared/locale.ts`, and passes it to `AppShell`. The typed message catalog and React provider live in `apps/app/src/shared/ui/i18n/`.

`packages/application`, `packages/core-engine`, and `packages/providers` must not own UI copy or locale state. UI reaches application behavior only through `AppServices.commands`.

Translate UI actions, status labels, empty states, placeholders, toasts, and tooltips. Keep provider/profile/model identifiers, `API Key`, `Base URL`, user prompts, and provider/runtime raw error messages untranslated.

## Motion System

`apps/app` owns the shared UI motion system, driven by `@tweenjs/tween.js` through `apps/app/src/shared/ui/motion/`. The system is opacity-first. Transform is allowed only through the motion layer writing DOM `style.transform`; the transform guard accepts only `translateX`, `translateY`, `scale`, `scaleX`, and `scaleY`. It rejects rotate, skew, matrix, perspective, `translate3d`, and `scale3d`.

`apps/app/public/manifest.json` declares `featureFlags.CSSNextSupport: true`, required before using UXP transform support. CSS transitions, CSS animations, keyframes, and CSS `transform:` remain banned outside the motion layer. `apps/app/tests/uxp-css-compat.test.ts` is the mechanical guard.

Motion ownership must not move into `packages/application`, `packages/core-engine`, or `packages/providers`. A single visual node should have one motion owner per CSS property.

## Shared UI Theme Source

Shared UI theme colors are generated from the six Material Design 3 CSS files
under `apps/app/src/shared/ui/styles/theme-source/`. These files remain the
authoritative Material token source; the default generated app surface strategy
is `host`, so app-level surface/text/border tokens prefer UXP host variables and
host-matched neutral fallbacks while still emitting the Material token set.

- `dark.css`
- `dark-hc.css`
- `dark-mc.css`
- `light.css`
- `light-hc.css`
- `light-mc.css`

Replace these six files to update the theme. The generator validates the exact
file set, source selectors, Material `md-sys` token set, and extended color
families `blue`, `green`, `yellow`, `red`, and `orange`. It writes
`apps/app/src/shared/ui/styles/generated/theme-css.ts`; do not edit that file by
hand. Use `--surface=md` only when intentionally regenerating the app surface
tokens from Material surface tokens for comparison.

Use:

```bash
pnpm --filter @imagen-ps/app theme:generate       # default host surface
pnpm --filter @imagen-ps/app theme:generate:host  # explicit host surface
pnpm --filter @imagen-ps/app theme:generate:md    # explicit Material surface
pnpm --filter @imagen-ps/app theme:check
```

App build/dev scripts run generation before bundling, and `pnpm check:policy`
fails when the generated theme is stale or the source CSS shape is invalid.

## Toast Contract

Toast is a shared `apps/app` surface primitive, not page-local state. The
global toast state lives behind `ToastProvider` / `useToast()` /
`ToastHost` in `src/shared/ui/components/toast-host.tsx`; page-level
`useNotice()` remains for inline and persistent notices only.

Toast styling must consume generated `--toast-*` tokens from
`styles/generated/theme-css.ts`. Do not reintroduce direct
`--app-color-positive` / `--app-color-negative` full-surface banner fills in
`styles/overlays.ts`.

## Popup Layer Contract

Anchored panel popups must use the shared `PopupLayerProvider` /
`PopupLayerRoot` in `src/shared/ui/components/popup-layer.tsx`. The popup layer
is the panel-level coordinate root and is mounted as the last direct child of
the app `.panel`; page-local scroll containers must not own popup clipping.

Placement must convert viewport rects to popup-root-local coordinates:
`anchorRect - popupRootRect`. Do not mix viewport `top/left` with absolute
coordinates from another container. `.panel` may be the visual owner, but the
stable contract is the explicit popup root, visible boundary, and trigger
anchor relation.

Trigger behavior must be one stable contract even when it spans multiple DOM
nodes: measurement anchor, interaction target, focus return target, and ARIA
state must have an explicit relationship. Prefer measuring the visible overlay
host; return focus to the real button when closing.

Positioning and hit-test shells must not use CSS transforms. If a popup animates,
apply motion only to an inner visual node. Underlays are event shields and
outside-click closers only; they do not solve placement, resize, scroll, or
focus contracts.

Open popups must coalesce resize, scroll, and `ResizeObserver` invalidations
through `requestAnimationFrame`, avoid state updates when placement is
unchanged, disconnect listeners on close, and close when their trigger contract
becomes invalid.

## Photoshop Placement Contract

Preview writeback follows source anchoring when available and active-document
placement when the user explicitly places an unanchored result.

- `exact-frame`: place back into the captured document and transform to the
  captured rectangle. Reject if the document cannot be strongly verified.
- `document-only`: place back into the captured document without frame
  transform. Reject if the document cannot be strongly verified.
- `unbound` with `no-photoshop-capture`: place into the current active
  Photoshop document at click time. Reject only when no active document exists.
- `unbound` with `multiple-documents`: reject as ambiguous. Do not silently
  choose an active document when source attachments came from different
  Photoshop documents.

Keep this rule at the host bridge/simulator boundary. Shared UI should pass the
round placement intent through unchanged; it should not branch on Photoshop
runtime identity or guess a document target.

## UXP CSS Contract

Shared UI and local UI harness CSS in `apps/app` must stay inside the Adobe-documented UXP contract first, not browser-first assumptions.

- `display: inline-flex` is allowed. `display` may use `none`, `inline`, `block`, `inline-block`, `flex`, or `inline-flex`.
- Flex alignment must stay within Adobe-documented values:
  `justify-content`: `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `stretch`
  `align-items`: `flex-start`, `flex-end`, `center`, `stretch`
  `flex-wrap`: `nowrap`, `wrap`
- Treat these as unsupported for repo-owned CSS contracts unless Adobe documents them for the current UXP version:
  `space-evenly`, `baseline`, `wrap-reverse`, `order`, `flex-flow`, `place-content`, `place-items`, `place-self`, `justify-items`, `justify-self`, `safe center`, `unsafe center`, `start`, `end`
- Do not use `gap`, `row-gap`, or `column-gap` in shared UI or harness CSS. Use explicit margins instead.
- Keep `flex-direction` / `flex-wrap` explicit instead of `flex-flow`.
- Do not rely on visual reordering through CSS `order`; keep DOM order aligned with visual order.

Mechanical enforcement:

- `pnpm check:policy` scans `apps/app/src/shared/ui` and `apps/app/src/harness` for UXP CSS contract violations.
- `pnpm --filter @imagen-ps/app test` includes `tests/uxp-css-compat.test.ts`, which rechecks the same contract in the app harness.

## Current Structure

```txt
src/
  shared/        # ports, domain helpers, one UXP-safe React UI
  adapters/uxp/  # Photoshop/UXP IO, storage, secureStorage, diagnostics
  adapters/chrome/ # File API host port and IndexedDB-backed app storage
  simulators/photoshop/ # deterministic browser Photoshop scenarios
  shells/uxp/    # UXP entrypoints, panel runtime, host shell assembly
  shells/chrome/ # browser harness entry
  host/          # compatibility re-exports for older tests/imports
```

## Commands

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app build:uxp    # writes dist/ for UXP Developer Tool
pnpm --filter @imagen-ps/app build:chrome # writes dist/web/ for browser smoke
pnpm --filter @imagen-ps/app test
```

### Chrome development server

```bash
pnpm --filter @imagen-ps/app dev:chrome
```

Runs `vite build --config vite.chrome.config.ts --watch`, serves `dist/web/` on `http://localhost:4173` with cache disabled, opens the browser, and detects/stops any existing process on port 4173. Options: `--port <n>`, `--no-open`, `--test-harness --seed-profile=mock --seed-history`.
