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
pnpm test:release
pnpm validate:release
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

Repository pull requests also run a GitHub Actions `cla` gate for external
contributors. Non-member pull requests must either pass the repository
CLA Assistant check derived from `CLA.md`, or carry a maintainer applied
`cla:exempt` label.

## Test Levels

The repository has two isolated test levels. They never share discovery rules,
so the default development gate cannot accidentally run real interface tests.

### Development tests — `pnpm test` / `pnpm validate`

- Fast, stable, reproducible, mock-only. The default gate for everyday work and
  CI.
- Never reads `.test.env`, never calls real provider APIs, and never incurs
  real API cost. The presence of a local `.test.env` or real API keys has no
  effect on these commands.
- Every package `vitest.config.ts` excludes `**/*.release.test.ts(x)`, so
  release live files are structurally invisible to the development suite.

### Release tests — `pnpm test:release` / `pnpm validate:release`

- Opt-in real-interface and real-link verification, run only before a release.
- `pnpm validate:release` runs `pnpm validate` first, then `pnpm test:release`.
- `pnpm test:release` does NOT go through Turbo, so real calls are never
  replayed from cache.
- Loads credentials only from the fixed repository-root `.test.env`. Falls back
  to no other file. `.test.env` is gitignored.
- Double switch: the runner sets `IMAGEN_TEST_LEVEL=release`, and the release
  vitest config re-checks it in `globalSetup` plus every test must call
  `assertReleaseMode()`. Direct `vitest --config vitest.release.config.ts`
  invocation fails immediately when the flag is absent.
- Fail-closed: missing `.test.env`, missing required variable, or zero
  discovered `*.release.test.*` files all fail the command with a clear message.
  Errors list variable names only; they never print keys, Authorization
  headers, or any secret value.
- `pnpm test:release` may incur real provider API cost.

Which tests may touch the real network: only `*.release.test.ts(x)` files under
`<package>/tests/release/`, and only via the release commands above.

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

Provider catalog / request-contract work may additionally cite the deterministic
catalog harness after `packages/providers` has been built:

```bash
node packages/providers/scripts/check-image-model-catalog.mjs
```

This script reads the shared image-model rule module from `dist/`, prints the
effective selectable models per provider family, and fails on catalog
inconsistencies. It is per-slice evidence only; `pnpm validate` remains the
final gate.

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
| release | Pre-release real-interface verification. | `pnpm validate:release` | Loads `.test.env`; may incur real API cost; never cached; fail-closed on missing env or empty suite. |
| manual-only | Human-observed host behavior. | UXP Developer Tool + Photoshop smoke checklist. | Fake UXP tests and Vite build do not prove real Photoshop host IO. |

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

## Test Organization Rules

Development tests are split by functional domain and user link, not by a fixed
line budget. Each file name says what it covers and which level it belongs to.

- One file covers one functional domain or one coherent user link. Long files
  that mixed attachment, rendering, billing, and composer concerns were split.
- A complete main-link test that only makes sense end-to-end stays as one case;
  only unrelated scenarios are moved out.
- Shared render/fake helpers live under `apps/app/tests/*-harness.ts(x)` next to
  the tests that use them. They are not test files (no `.test.` segment) so
  vitest never runs them, and they stay out of `tsconfig.build.json` (`include:
  ["src"]`).
- Fixtures are named by business meaning, not `data1`/`mock2`.
- `*.release.test.ts(x)` files live under `<package>/tests/release/` and are the
  only files that may touch real network. They are excluded from every
  development vitest config.

## Adding Release Tests

The framework is ready but no real release tests are registered yet; until at
least one is added, `pnpm test:release` fails with "Release suite is empty".

1. Put the file at `<package>/tests/release/<name>.release.test.ts(x)`.
2. If the package does not yet have `vitest.release.config.ts`, copy it from
   `packages/providers/vitest.release.config.ts`. The config only includes
   `tests/release/**/*.release.test.*` and disables cache.
3. Declare and verify credentials at the top of the test:
   ```ts
   import { assertReleaseMode, requireReleaseEnv } from '<package>/tests/release/release-env';
   assertReleaseMode();
   requireReleaseEnv(['IMAGEN_SMOKE_N1N_API_KEY', 'IMAGEN_SMOKE_N1N_BASE_URL', 'IMAGEN_SMOKE_N1N_MODEL']);
   ```
   If the package needs a release-env helper, copy `packages/providers/tests/release/release-env.ts`.
4. Add any new required variable to `.test.env.example` — the release runner
   derives required variables from that file, so it becomes mandatory
   automatically. Never put real keys in the example.
5. The test never prints secrets. Use redaction helpers from
   `@imagen-ps/foundation` for any logged payload.
6. Run `pnpm test:release`. The runner loads `.test.env`, validates required
   variables, discovers the file, and runs vitest with `--no-cache` so the real
   call is never replayed from cache.

## Manual And Live Smoke

Manual Photoshop / UXP proof is a separate gate. Record it as manual evidence;
do not describe it as covered by `pnpm validate`.

When the panel is reachable, the default repo-owned Photoshop UXP debug/probe
surface is:

```sh
node scripts/uxp-debug/uxp-debug.mjs
```

Use it for real-host target discovery, DOM inspection, ancestor layout data,
runtime style mutation, event instrumentation, and relay-backed console
inspection. Do not replace it with ad hoc DevTools-only DOM workflows or
Photoshop window automation.

Minimum real-host probe sequence:

```sh
node scripts/uxp-debug/uxp-debug.mjs targets
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel eval 'document.body?.tagName'
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel inspect '<selector>'
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel ancestors '<selector>'
```

Run commands serially against the UDT relay. For multiple targets, pass
`--plugin-id com.imagen-ps.panel`.

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

Keep `node scripts/uxp-debug/uxp-debug.mjs` as the default way to inspect the
real panel before and after enabling this harness.

Chrome browser smoke is repo-side evidence only when it loads the browser build
in a real browser and reports the Chrome shell ready state. It still does not
prove real Photoshop / UXP host behavior or live provider behavior.

Real provider live verification belongs to the release level
(`pnpm test:release` / `pnpm validate:release`), not to default `pnpm test`.

## CI Boundary

Default CI and default Loop validation include only stable, mock-only,
reproducible checks. Release tests are not part of default CI.

Maintainer CLA operation is:

1. Ask the external contributor to open the CLA signing issue template from the same GitHub account as the PR.
2. Ensure CLA Assistant is installed and pointed at the canonical text in `CLA.md`.
3. Let the bot collect assent and report pass/fail on the pull request.
4. Use `cla:exempt` only for truly exempt changes such as typo-only docs or mechanical metadata edits.

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
