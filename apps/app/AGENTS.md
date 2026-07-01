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
