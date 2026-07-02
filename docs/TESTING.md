# Testing

This document is the repository testing entrypoint. Historical Loop records,
archived research notes, and handoff-style documents are not current validation
authority.

## First-Time Setup

Run this from a fresh checkout or when a new agent takes over the repo:

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs from the lockfile and then runs `pnpm validate`. The
default setup path must stay mock-only, zero-cost, and independent of Photoshop,
UXP Developer Tool, provider credentials, or external network access.

## Standard Commands

```bash
pnpm validate
pnpm build
pnpm test
pnpm check:policy
```

`pnpm validate` is the default final gate for non-trivial repository work. It
runs build, default tests, and policy checks.

`pnpm test` uses the Turbo pipeline and includes the stable mock-only tests for
foundation, core-engine, providers, application, and app surfaces.

`pnpm check:policy` is the local architecture and documentation policy gate. It
checks package import boundaries, high-authority documentation wording,
portable path references, and the shared UXP CSS contract for `apps/app`
shared UI plus local UI harnesses. It does not access the network, credentials,
or paid provider APIs.

Filtered package tests are useful for focused verification after the relevant
workspace has been built:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Filtered tests are not a clean-checkout baseline. Build the touched packages
first when in doubt.

Placement-only app work may additionally cite the standalone mock harness:

```bash
node apps/app/scripts/verify-placement-core.mjs
```

This script isolates round derivation, durable replay, and host target fallback
for Photoshop placement semantics. It is per-slice evidence only; `pnpm validate`
remains the final gate.

`pnpm --filter @imagen-ps/app test:chrome-e2e` is an opt-in Chrome browser E2E
gate for the app Chrome build. It builds `dist/web/`, serves it locally, runs
Playwright Chromium at representative viewports (`390x720` default,
`300x420`/`300x520`/`390x400`/`600x800` for responsive scenarios), and writes
ignored local artifacts under `apps/app/tests/chrome-e2e/screenshots/`. It is
repo-side browser evidence only; it does not prove real Photoshop / UXP host
behavior or live provider behavior.

### Chrome E2E Seed API

Chrome-only seed state is enabled with `?testHarness=1`. The normal Chrome shell
still renders the shared `AppShell`; the query swaps deterministic browser
adapters and preloads test state.

Supported query controls:

- `storage=memory|indexed-db`: isolated in-memory state for most specs, or real IndexedDB for persistence smoke.
- `db=<name>`: optional IndexedDB database name for isolated runs.
- `resetStorage=1`: clear the selected IndexedDB database before seeding.
- `seedProfile=mock`: seed `mock-profile` with default model `mock-image-v1` and non-secret test key.
- `seedHistory=1`: seed completed, failed, and stale running task/history records.
- `scenario=<id>`: select a deterministic Photoshop simulator scenario.
- `filePicker=image|cancel`: return a generated PNG file or simulate cancel.
- `mockFailure=always|none`: preload the mock provider failure mode.
- `harness=composer-select`: render the manual ComposerSelect responsive harness instead.
- `harness=uxp-css-contract`: render the UXP CSS contract review board for manual Chrome/Photoshop visual comparison.

When enabled, the page exposes `globalThis.__IMAGEN_CHROME_TEST_HARNESS__` for
scenario-local controls: `resetStorage`, `seedMockProfile`, `seedHistory`,
`setFilePickerMode`, `setMockFailureMode`, `setScenario`, and `snapshot`.

## Loop Validation Categories

Loop documents must classify validation commands before citing them.

| Category | Use | Current command or workflow | Notes |
|---|---|---|---|
| quick | Cheap mechanical checks during planning or small documentation slices. | `pnpm check:policy` | Does not prove behavior correctness. |
| per-slice | Focused checks for the touched owner boundary. | Filtered package build/test commands above. | Requires the related package build state to be valid. |
| final | Default closeout for non-trivial completed work. | `pnpm validate` | Aligns with the default CI gate. |
| manual-only | Human-observed host behavior. | UXP Developer Tool + Photoshop smoke checklist. | Fake UXP tests and Vite build do not prove real Photoshop host IO. |
| live-provider | Opt-in provider smoke using network, credentials, or paid APIs. | Currently no active smoke harness. | Never part of default CI or default Loop validation. |

`pnpm lint` is not a supported Loop gate today. The root `package.json` has a
`lint` script, but workspace packages do not define package-level lint scripts.
Do not cite `pnpm lint` as quick, per-slice, or final validation unless this
document is updated after package-level lint support is added.

## Default Coverage

Default tests are mock-only and reproducible:

- `packages/foundation`: host-agnostic logging, redaction, and sink contracts.
- `packages/core-engine`: job facts, lifecycle, store, events, runner, and
  dispatch boundary.
- `packages/providers`: config validation, canonical request handling,
  transport builders, response parsing, diagnostics, provider descriptors, and
  endpoint failover harness coverage for retry/fallback/cooldown/global-budget
  behavior.
- `packages/application`: command/session facade, profile/model coordination,
  request mapping, runtime assembly, and logging wiring.
- `apps/app`: shared React-to-application seam, UXP and Chrome port adapters,
  Chrome IndexedDB-style storage boundary, deterministic Photoshop simulator,
  history/settings flows, and Photoshop bridge call mapping through fakes.

These tests must not use real provider credentials, real Photoshop, UXP
Developer Tool, external network access, or paid APIs.

## Manual And Live Smoke

Manual Photoshop / UXP proof is a separate gate. Record it as manual evidence;
do not describe it as covered by `pnpm validate`.

The icon visual harness (`apps/app/harness/icon-visual/`) is a manual host
harness for verifying that UXP panel icons render with non-zero rects inside
real Photoshop. It requires a real Photoshop host and UXP Developer Tool; run
it after replacing the `Icon` component or changing inline SVG icon mappings.
The `check-icon-rects.js` script queries expected icon selectors and reports
any icon with a `0x0` bounding rect.

The UXP CSS contract board can also run inside the real Photoshop panel. Before
reloading the plugin, set:

```js
localStorage.setItem('imagenPsPanelHarness', 'uxp-css-contract');
```

Then reload the panel in UXP Developer Tool. Clear it to return to the normal
app surface:

```js
localStorage.removeItem('imagenPsPanelHarness');
```

Chrome browser smoke is repo-side evidence only when it loads the browser build
in a real browser and reports the Chrome shell ready state. It still does not
prove real Photoshop / UXP host behavior or live provider behavior.

Live provider smoke is currently not available after the CLI surface was
removed. If a new smoke harness is added, it must stay opt-in and config-driven.

## CI Boundary

Default CI and default Loop validation include only stable, mock-only,
reproducible checks.

Keep these out of default `pnpm test`:

- live provider smoke;
- real Photoshop / UXP host smoke;
- URL-only asset download branches unless mocked;
- large input / ARG_MAX stress;
- timeout or delay stress;
- repeated or concurrent writes to one `--out` directory;
- concurrent writes to one config directory;
- any scenario requiring human keys, proxy configuration, external network, or
  paid provider traffic.
