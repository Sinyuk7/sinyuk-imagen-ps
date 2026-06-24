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
foundation, core-engine, providers, application, app, and CLI surfaces.

`pnpm check:policy` is the local architecture and documentation policy gate. It
checks package import boundaries, high-authority documentation wording, and
portable path references. It does not access the network, credentials, or paid
provider APIs.

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
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
```

Filtered tests are not a clean-checkout baseline. CLI contract and smoke tests
run `apps/cli/dist/index.js` in subprocesses, so build the CLI first when in
doubt.

`pnpm --filter @imagen-ps/app test:chrome-e2e` is an opt-in Chrome browser E2E
gate for the app Chrome build. It builds `dist/web/`, serves it locally, runs
Playwright Chromium at one fixed `390x720` viewport, and writes ignored local
artifacts under `apps/app/tests/chrome-e2e/screenshots/`. It is repo-side
browser evidence only; it does not prove real Photoshop / UXP host behavior or
live provider behavior.

## Loop Validation Categories

Loop documents must classify validation commands before citing them.

| Category | Use | Current command or workflow | Notes |
|---|---|---|---|
| quick | Cheap mechanical checks during planning or small documentation slices. | `pnpm check:policy` | Does not prove behavior correctness. |
| per-slice | Focused checks for the touched owner boundary. | Filtered package build/test commands above. | Requires the related package build state to be valid. |
| final | Default closeout for non-trivial completed work. | `pnpm validate` | Aligns with the default CI gate. |
| manual-only | Human-observed host behavior. | UXP Developer Tool + Photoshop smoke checklist. | Fake UXP tests and Vite build do not prove real Photoshop host IO. |
| live-provider | Opt-in provider smoke using network, credentials, or paid APIs. | `pnpm build` then `IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test` | Never part of default CI or default Loop validation. |

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
  transport builders, response parsing, diagnostics, and provider descriptors.
- `packages/application`: command/session facade, profile/model coordination,
  request mapping, runtime assembly, and logging wiring.
- `apps/cli`: parser contract, subprocess stdout/stderr, config/log dir
  isolation, profile/job commands, durable history, retry, and `--out`
  artifacts.
- `apps/app`: shared React-to-application seam, UXP and Chrome port adapters,
  Chrome IndexedDB-style storage boundary, deterministic Photoshop simulator,
  history/settings flows, and Photoshop bridge call mapping through fakes.

These tests must not use real provider credentials, real Photoshop, UXP
Developer Tool, external network access, or paid APIs.

## Manual And Live Smoke

Manual Photoshop / UXP proof is a separate gate. Record it as manual evidence;
do not describe it as covered by `pnpm validate`.

Chrome browser smoke is repo-side evidence only when it loads the browser build
in a real browser and reports the Chrome shell ready state. It still does not
prove real Photoshop / UXP host behavior or live provider behavior.

Live provider smoke is opt-in:

```bash
pnpm build
IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test
```

Provider matrix, `.test.env` variables, proxy notes, retained output artifacts,
and sidecar inspection details live in
`apps/cli/tests/smoke/README.md`.

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
