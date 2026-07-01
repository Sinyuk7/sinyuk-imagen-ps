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
   - ~/Users/sinyuk~/Documents/github/monorepo

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
