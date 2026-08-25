# Testing

This document is the repository testing authority. The goal is not maximum test
count. The goal is a stable test structure whose file count does not grow
linearly with bug count.

## Runtime Validation Strategy

Use the cheapest boundary that can prove the behavior. Deterministic tests and
Chrome are the default acceptance path for shared application and UI behavior,
including state transitions, errors, races, routing, and interaction. For UXP
code, inspect the implementation and official documentation first, then use
contract/fake tests and the UXP build where applicable.

Agents must not proactively open or control Photoshop or UXP Developer Tool,
or use UI/computer automation to test UXP. Real UXP acceptance is user-owned.
Only assist with the exact evidence the user explicitly requests, and do not
expand it into a broader manual test pass.

`pnpm --filter @imagen-ps/app build:uxp` is compile evidence only. Fake UXP
adapter tests prove adapter contracts against the fake runtime; neither is
evidence of real Photoshop behavior.

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
pnpm test:changed
pnpm test:app
pnpm test:providers
pnpm test:uxp
pnpm validate
pnpm build
pnpm test
pnpm check:policy
pnpm test:release
pnpm validate:release
```

`pnpm validate` is the default final gate for non-trivial repository work. It
runs build, default tests, and policy checks.

`pnpm test` uses the Turbo pipeline and includes the stable mock-only suites for
foundation, core-engine, providers, application, and app surfaces.

Focused development entrypoints:

- `pnpm test:changed`: runs tests for changed workspace packages, falling back to
  `pnpm test` when no changed package files are detected.
- `pnpm test:app`: runs the `@imagen-ps/app` deterministic development suite.
- `pnpm test:providers`: runs the `@imagen-ps/providers` deterministic provider suite.
- `pnpm test:uxp`: runs only the app fake-UXP adapter and shell suite.

Profile setup/default-model initialization coverage is mock-only: run
`pnpm --filter @imagen-ps/application test` for atomic template setup outcome,
cleanup, promotion, explicit-model admission, and final-model deletion contracts; run
`pnpm --filter @imagen-ps/app test:ui`, `test:chrome`, and `test:uxp` for the
Provider Picker, dedicated Profile routes, Composer selection, and host persistence adapters.

`pnpm check:policy` is the local architecture and documentation policy gate. It
checks package import boundaries, high-authority documentation wording,
portable path references, and the shared UXP CSS contract for `apps/app`
shared UI plus local UI harnesses. It does not access the network, credentials,
or paid provider APIs.

## UI Visual Baselines

Run the deterministic UI baseline suite after page-composition work:

```bash
pnpm --filter @imagen-ps/app test:visual
```

The catalog route is `?harness=ui-catalog` in Chrome and
`imagenPsPanelHarness=ui-catalog` in UXP. Ordinary runs only compare accepted
baselines. Regenerate a reviewed baseline explicitly, then run the ordinary
command again:

```bash
pnpm --filter @imagen-ps/app test:visual:update
pnpm --filter @imagen-ps/app test:visual
```

Chrome screenshots and ARIA assertions prove the browser harness. Real-panel
rendering remains user-owned evidence; agents do not launch the host to extend
this gate.

## Zero-Test Contract

The repository must tolerate an empty development suite during restructuring.

- `vitest` configs must set `passWithNoTests: true`.
- Focused test commands that pass explicit paths must also pass
  `--passWithNoTests`.
- `pnpm test`, filtered package tests, and `pnpm validate` must stay runnable
  when a package currently has zero discovered development test files.
- Release tests are also allowed to be temporarily empty. `pnpm test:release`
  must print a clear skip message and exit successfully when no
  `*.release.test.ts(x)` files exist.

Zero-test tolerance is a harness property only. It is not evidence that the
repository is sufficiently validated.

## Test Levels

The repository has two isolated test levels. They never share discovery rules,
so the default development gate cannot accidentally run real-interface tests.

### Development tests — `pnpm test` / `pnpm validate`

- Fast, stable, reproducible, mock-only. The default gate for everyday work and
  CI.
- Never reads `.test.env`, never calls real provider APIs, and never incurs
  real API cost. The presence of a local `.test.env` or real API keys has no
  effect on these commands.
- Every package `vitest.config.ts` excludes `**/*.release.test.ts(x)`, so
  release live files are structurally invisible to the development suite.
- Zero discovered tests are allowed while the suite is being rebuilt.

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
- Fail-closed on missing `.test.env` or missing required variables.
- Empty release suites are allowed during restructuring; the runner prints a
  skip message and exits successfully.
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
pnpm --filter @imagen-ps/app test:ui
pnpm --filter @imagen-ps/app test:uxp
pnpm --filter @imagen-ps/app test:chrome
pnpm --filter @imagen-ps/app test:release
pnpm --filter @imagen-ps/app test:chrome-e2e
```

ComfyUI boundary work should additionally run:

```bash
pnpm --filter @imagen-ps/execution-backend-comfyui build
pnpm --filter @imagen-ps/execution-backend-comfyui test
pnpm --filter @imagen-ps/application test
python3 -m unittest discover -s integrations/comfyui-imagen-bridge/tests -p 'test_*.py'
node --test integrations/comfyui-imagen-bridge/tests/*.test.mjs
pnpm --filter @imagen-ps/app test
```

ComfyUI evidence has three non-interchangeable tiers:

- Default deterministic suites are mock-only and prove bounded document and
  Form conversion, the persistence allowlist, revision invalidation, optional
  mappings, upload barriers, native validation, one-shot drivers, Bridge
  lifecycle, output guards, empty-output Task projection, host transport, and
  UI behavior without reading live credentials. They cover canonical
  grayscale Mask bytes, same-frame source/target geometry, coordinator stale
  completion cleanup, task snapshot/retry, explicit provider plans, and
  revision-scoped ComfyUI bindings. Unsupported custom widgets retain saved
  values and do not create plugin-side readiness gates.
- Deterministic connection-switch suites use `createComfyUiTestHarness()` with
  deferred API, Bridge, and commit gates plus recording target-bound
  generations. They prove immutable target derivation, A-to-B supersession,
  late-result suppression, old-active retention, promotion invalidation, and
  idempotent disposal. Repository contracts prove `compareAndSave()` conflict
  and abort leave the authoritative snapshot unchanged. Chrome uses one
  abortable IndexedDB readwrite transaction; UXP stages in the data folder and
  guards the overwrite move. These tests prove the defined linearization
  boundary, not filesystem crash atomicity beyond Adobe's API contract.
  Frontend execution contracts also freeze base URL plus attempt affinity and
  prove an A-admitted task stale-rejects before Bridge submission after B is
  promoted.
- Owner-local Chrome live gates use only environment-bound values such as
  `IMAGEN_COMFYUI_LIVE_BASE_URL`. The internal API Graph driver and product
  Frontend saved-workflow path each require a real image submission, server
  receipt, history/view download, and TaskOutput proof. These gates do not
  exercise a configured explicit Mask binding only when the owner supplies
  suitable live credentials and workflow inputs.
- Real Photoshop UXP proof is user-owned manual evidence. Agents do not
  initiate or automate it; they may analyze evidence the user supplies.

For connection switching, mock Chrome evidence must cover edit-cancels,
explicit reconnect, phase copy, exact derived origins, provisional frame
cleanup, and horizontal overflow. Live Chrome evidence additionally requires a
real `/system_stats` response, Frontend Bridge handshake, workflow discovery,
reconnect, and one unreachable-target failure while the old active target
remains usable. When the user explicitly requests real Photoshop UXP evidence,
keep it scoped to the named host boundary, such as WebView permissions,
`postMessage(message, targetOrigin)`, load/handshake failure classification,
A-to-B teardown, or listener/timer/WebView cleanup. This is not a default
completion gate. Never promote mock or Chrome results to the real-host tier.

Mock success, build success, or a Bridge handshake alone is not live generation
proof. Chrome live generation proof requires real output bytes in generic Task
history. Real-host behavior remains unverified unless the user supplies or
explicitly requests that evidence.

Run the owner-local Chrome Frontend gate explicitly; it does not participate in default validation:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep comfyui-frontend
```

The gate requires `IMAGEN_COMFYUI_LIVE_BASE_URL` and
`IMAGEN_COMFYUI_LIVE_FRONTEND_WORKFLOW_PATH`, a canonical path returned by
Bridge discovery for a workflow without mask entries. The runner never reads
SSH credentials or writes graph payloads, generated images, prompt ids, or raw
remote logs into tracked files.

Filtered tests are not a clean-checkout baseline. Build the touched packages
first when in doubt.

Provider catalog work may additionally cite the deterministic catalog harness
after `packages/providers` has been built. It checks the GRSAI, Gemini, and
OpenAI Images local inventories:

```bash
node packages/providers/scripts/check-image-model-catalog.mjs
```

Placement-only app work may additionally cite the standalone harness:

```bash
node apps/app/scripts/verify-placement-core.mjs
```

This script is retained as a stable entrypoint, but it may be a no-op when the
placement suite is temporarily absent. It is per-slice evidence only;
`pnpm validate` remains the default final gate.

Popup-overlap text-input work should additionally cite the shared UI seam
evidence:

- `apps/app/tests/shared/ui/components/text-field-seam.test.tsx` for public
  `TextField` suspension/value behavior
- `apps/app/tests/shared/ui/components/text-area-seam.test.tsx` for textarea
  delete-sync behavior, including the Photoshop UXP native-delete fallback
- `apps/app/tests/shared/ui/components/popup-layer-overlap-harness.test.tsx`
  for single-line + multi-line popup overlap regression proof
- `pnpm check:policy` for the single-line seam import boundary

When host writeback semantics change, keep the durable regression in
`apps/app/tests/adapters/uxp/photoshop-host-bridge.write.contract.test.ts`.
This includes `unbound` placement cases where Photoshop native `placeEvent`
initial size depends on source metadata or host document scale; assert the repo
policy on normalized placed bounds there instead of relying on Chrome-only
evidence.

`pnpm --filter @imagen-ps/app test:chrome-e2e` is an opt-in Chrome browser E2E
gate for the app Chrome build. It builds `dist/web/`, serves it locally, runs
Playwright Chromium at representative viewports (`390x720` default,
`300x420`/`300x520`/`390x400`/`600x800` for responsive scenarios), and writes
ignored local artifacts under `apps/app/tests/chrome-e2e/screenshots/`.

For manual Chrome visual acceptance of a page UI change, verify the browser harness
at `360x600` (docked), `420x680` (floating), and `1280x800` (wide). The
manifest's `300x420` minimum is a robustness stress case, not a composition
approval viewport.

Default Chrome E2E scenarios stay mock-oriented and do not read `.test.env`.
One explicit live-provider scenario may be selected with:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep live-provider
```

That live scenario reads owner-local fixture values from repository-root
`.test.env`, seeds a real provider profile in the browser runtime, and verifies
that `Test connection` uses the safe no-generation probe path. It is still
Chrome/browser evidence only: it does not prove real Photoshop / UXP host
behavior, successful Profile creation, or successful image generation, and it
is not part of the default `pnpm test` / `pnpm validate`
gate.

## Coverage Philosophy

The testing system must not chase “every feature has a test”. It must protect
stable boundaries with a small number of durable suites.

The permanent goals are:

- Every stable boundary has one durable contract.
- Every core user flow has only a small number of scenarios.
- Complex compatibility inputs live in module-local Case Banks.
- Ordinary bug fixes add a case, not a new suite.
- UI tests stay minimal.
- Provider growth, application race coverage, UXP host coverage, and release
  rules may grow mostly as data, not as file count.
- Stable modules should compress to `1–3` authoritative test files.
- Real Photoshop and real Provider proof stay outside default CI.

The primary governance metric is not total test count. It is whether test files
grow linearly with bug count. If bugs mostly add rows to a Case Bank instead of
new files, the structure is healthy.

## Rule 5: Only Four Growth Areas

Only four Case Bank areas may grow materially over time:

- `providers/families/*/cases`
- `application/tests/cases/session-race-cases`
- `adapters/uxp/cases`
- `release/cases/artifact-rule-cases`

Every other area should stay small and mostly stable. If test count keeps
growing outside these four areas, treat it as architecture leakage rather than
as healthy coverage growth.

This rule is especially strict for UI tests. Rapid UI test growth usually means:

- business rules live in the wrong layer
- pages own too much logic
- adapter contracts are unclear
- provider normalization is incomplete

## Permanent Test Structure

Tests are organized around stable module boundaries, not around individual source
files and not around individual historical bugs.

### `packages/core-engine`

Keep only a small permanent contract surface:

- task lifecycle
- runner behavior
- store / event invariants

Target end state:

- `src/contract.test.ts`
- `src/scenario.test.ts`
- optional `src/compat.test.ts`

Do not keep separate permanent files for each internal helper, each data type,
or each bug-shaped regression. New edge behavior belongs in the existing
contract/scenario/compat suite.

### `packages/application`

Organize tests by use case, not by implementation file:

- Session
- Profile and Model Resolution
- History
- Request / submission orchestration
- race / dedupe behavior when needed

Target end state:

- `src/session.contract.test.ts`
- `src/use-cases.scenario.test.ts`
- optional `src/race.compat.test.ts`

Do not create a separate test file for each command module. Command-specific
inputs belong in shared use-case suites or Case Banks.

### `packages/providers`

This is one of the few allowed growth areas, but growth must happen inside
family-local Case Banks rather than through file-count sprawl.

Permanent areas:

- provider contract
- request / response normalization
- transport / retry / failover
- registry / descriptor coverage
- release live-provider smoke

Recommended permanent directories:

```txt
packages/providers/tests/
  contract/
    provider.contract.test.ts
  transport/
    transport.contract.test.ts
  families/
    <family>/
      provider.compat.test.ts
      cases/
        ...
  release/
    provider-smoke.release.test.ts
    release-env.ts
```

New compatibility behavior and historical bug coverage must go into
`providers/families/*/cases`. Do not keep adding narrow one-off files for each
provider quirk.

### `apps/app`

UI and host tests must stay intentionally small.

Permanent areas:

- key page-level user flows
- a very small set of complex component contracts
- UXP adapter boundary
- Chrome adapter boundary
- host race / timing behavior when it cannot live lower in the stack
- release artifact / packaging rules

Recommended permanent directories:

```txt
apps/app/tests/
  shared/
    image.contract.test.ts
    domain/
      asset.contract.test.ts
  ui/
    flows.scenario.test.tsx
    components.contract.test.tsx
  adapters/
    uxp.contract.test.ts
    chrome.contract.test.ts
    cases/
      ...
  integration/
    core-flows.scenario.test.tsx
  release/
    artifact.release.test.ts
    cases/
      artifact-rule-cases/
        ...
```

Rules:

- App-owned pure seams with long-lived contracts may keep a very small shared
  contract layer, such as image planning/caching and asset resolution.
- UI only keeps main page, settings/history, and other top-level critical user
  chains.
- Do not test ordinary presentational components, DOM shape snapshots, repeated
  business-rule copies, or implementation details already owned by lower
  layers.
- UXP host compatibility growth is allowed only under `adapters/uxp/cases`.
- Release artifact compatibility growth is allowed only under
  `release/cases/artifact-rule-cases`.
- UI should not have an open-ended Case Bank.

## UI Selector And Helper Contract

UI tests must use stable repo-owned selectors. Do not let tests or helpers
infer UI structure from styling, copy, or incidental DOM shape.

- All element lookup used to drive test behavior must go through stable
  `data-testid`.
- Do not locate elements by CSS class, tag name, DOM depth, sibling order, or
  broad `textContent` search.
- Do not use visible copy to find buttons, rows, menu items, or options unless
  the test is explicitly proving copy rendering and no action depends on that
  lookup.
- If a test needs to interact with a control that does not expose a stable
  `data-testid`, add one in the component first. Do not add helper fallback
  logic that guesses by text or DOM shape.
- Selector stability is part of the component contract for reusable controls.
  Missing test ids are a component gap, not a test-helper problem.

Required select contract for repo-owned selector components:

- Trigger: `<testId>`
- Popover: `<testId>-popover`
- Menu root: `<testId>-menu`
- Option: `<testId>-option-<option.id>`

Rules for options:

- Always select options by stable option id, not by visible label.
- Prefer option ids such as `2k`, `16:9`, `webp`, or other canonical domain
  ids.
- When asserting available options, default to option-id presence/order, not
  localized labels.
- Only assert option labels when copy or localization is itself the contract
  under test.

Rules for helpers:

- Helpers may do only three things: render, perform an explicit UI action, or
  return raw observable state such as DOM nodes, attributes, or spy calls.
- Helpers must not infer current business state, choose different action paths,
  or hide fallback lookup chains for "whatever is currently on screen".
- Helpers must not encode business assertions. They may return spy output; the
  test must decide what that output means.
- If a helper needs branching, the caller should pass the exact target id or
  mode explicitly.
- Broad helpers such as "click button containing text" or "find any option that
  mentions model id" are not durable and should be deleted once a stable
  selector exists.

Structural assertions should also stay explicit:

- Do not use whole-container `textContent` as a proxy for structural state when
  a specific node, attribute, test id, or spy can express the same contract.
- Broad text assertions are acceptable for copy contracts, warning messages,
  and localization proofs, but not as the default way to prove navigation or
  selection state.

### `packages/foundation`

Keep only durable utility contracts:

- log / span contract
- redaction contract
- serialization / schema contract if still boundary-relevant

Target end state:

- `src/contract.test.ts`
- optional `src/compat.test.ts`

## Case Bank Rule

Case Banks are the default home for accumulating bug coverage.

- Only the four Rule 5 areas may grow substantially over time.
- A Case Bank stores parameterized inputs, expected outputs, and short semantic
  labels.
- A bug fix normally adds one case row to the existing Case Bank.
- A new suite is justified only when it protects a different stable boundary or
  a different test level.

Preferred pattern:

```txt
<owner>/
  *.contract.test.ts
  *.scenario.test.ts
  *.compat.test.ts
  cases/
    ...
```

Suggested meanings:

- `contract`: permanent shape, ownership, invariants, public boundary
- `scenario`: end-to-end behavior inside one owner boundary
- `compat`: parameterized edge inputs, regressions, tricky historical cases

Growth whitelist:

- `packages/providers/tests/families/*/cases`
- `packages/application/tests/cases/session-race-cases`
- `apps/app/tests/adapters/uxp/cases`
- `apps/app/tests/release/cases/artifact-rule-cases`

## Fake And Harness Rule

Fake structure must follow stable ownership boundaries, not convenience
aggregation.

- Do not create a single global `fake.ts` that carries repository-wide test
  dependencies.
- Split reusable fakes by stable Port, Repository, Provider Family, or Host
  Adapter boundary.
- If a test only needs a simple return value or one-shot behavior, keep it as a
  local test stub instead of promoting it into `*.fake.ts`.
- Create `xxx.fake.ts` only when an interface needs reusable stateful behavior
  across multiple tests.
- Keep Fixtures, Builders, Spies, error injection, and scenario assembly out of
  Fake modules. They are separate test concerns and should live in separate
  helpers.
- A thin `createTestHarness()` composition entry is allowed, but it may only
  assemble independent fakes and test helpers. It must not reimplement business
  logic or become a second app runtime.
- Any Fake over roughly 300 lines must be reviewed for mixed responsibilities.
- Any Fake over 500 lines should be split by boundary unless there is a
  documented, boundary-preserving reason not to.

Preferred pattern:

```txt
tests/
  <owner>/
    ports/
      commands-port.fake.ts
    repositories/
      user-model-config.fake.ts
    adapters/
      uxp-host.fake.ts
    fixtures/
      provider-profile.fixture.ts
    builders/
      task-record.builder.ts
    spies/
      diagnostics.spy.ts
    harness/
      create-test-harness.ts
```

Review prompts for any reusable fake:

- What stable boundary does this Fake own?
- Could this behavior stay as a local stub in one test file?
- Is stateful behavior mixed with fixtures, builders, or assertions?
- Is the harness composing seams, or hiding business logic?
- Has file size become a signal that multiple boundaries were merged?

## Deletion Rule

When a module stabilizes, delete development-time test sprawl.

Delete these once their coverage has been absorbed into an authoritative suite:

- temporary exploratory tests
- private helper tests
- one-bug one-file regressions
- repeated assertions already covered by a stronger boundary contract
- duplicate UI tests for rules already enforced in lower layers
- text-lookup and class-lookup helpers once stable `data-testid` contracts
  replace them

The end state is not “many small files with local history”. The end state is
“a few authoritative files per stable boundary”.

## Integration And Smoke Boundary

Integration remains small:

- only a few cross-module core flows
- default CI stays inside development-test rules above

Real-world proof stays in the isolated release/manual levels defined above:

- real Photoshop smoke is manual-only
- real Provider smoke lives only in release suites
- release artifact checks live only in `tests/release/`

## Loop Validation Categories

Loop documents must classify validation commands before citing them.

| Category | Use | Current command or workflow | Notes |
|---|---|---|---|
| quick | Cheap mechanical checks during planning or small documentation slices. | `pnpm check:policy` | Does not prove behavior correctness. |
| per-slice | Focused checks for the touched owner boundary. | Filtered package build/test commands above. | Zero tests may still pass; cite what was actually covered. |
| final | Default closeout for non-trivial completed work. | `pnpm validate` | Aligns with the default CI gate. |
| release | Pre-release real-interface verification. | `pnpm validate:release` | Loads `.test.env`; may incur real API cost; never cached; empty suite currently skips. |
| manual-only | User-owned host observation. | User-directed Photoshop / UXP acceptance. | Agents do not initiate or automate this level. Fake UXP tests and Vite build do not prove real Photoshop host IO. |

`pnpm lint` is not a supported Loop gate today. The root `package.json` has a
`lint` script, but workspace packages do not define package-level lint scripts.
Do not cite `pnpm lint` as quick, per-slice, or final validation unless this
document is updated after package-level lint support is added.

## Adding Or Rebuilding Tests

When reintroducing tests into an empty area:

1. Identify the stable boundary first.
2. Create at most `1–3` authoritative files for that boundary.
3. Add a local Case Bank if compatibility inputs will grow.
4. Put historical bug coverage into the Case Bank or compat suite.
5. Do not start by mirroring every source file with a test file.

When adding release tests:

1. Put the file at `<package>/tests/release/<name>.release.test.ts(x)`.
2. If the package does not yet have `vitest.release.config.ts`, copy it from
   `packages/providers/vitest.release.config.ts`.
3. Declare and verify credentials at the top of the test:
   ```ts
   import { assertReleaseMode, requireReleaseEnv } from '<package>/tests/release/release-env';
   assertReleaseMode();
   requireReleaseEnv(['IMAGEN_SMOKE_N1N_API_KEY', 'IMAGEN_SMOKE_N1N_BASE_URL', 'IMAGEN_SMOKE_N1N_MODEL']);
   ```
4. Add any new required variable to `.test.env.example`.
5. Never log secrets.
6. Run `pnpm test:release`.

## User-Owned Photoshop / UXP Acceptance

Agents must not proactively open or control Photoshop or UXP Developer Tool,
and must not use GUI or computer automation for UXP acceptance. Default agent
validation stops at source and official-document review, deterministic tests,
Chrome, fake UXP contracts, and `build:uxp`, as applicable.

When the user explicitly owns a real-host check, the agent may analyze supplied
screenshots, logs, or probe output. A repo-owned non-UI probe such as
`node scripts/uxp-debug/uxp-debug.mjs` may run only when the user explicitly
requests its exact scope. Do not broaden that request or claim unobserved host
behavior.

Chrome browser smoke is repo-side evidence only when it loads the browser build
in a real browser. It is the default acceptance runtime for shared behavior,
but it does not prove real Photoshop / UXP host behavior or live provider
behavior.

Real provider live verification belongs to the release level
(`pnpm test:release` / `pnpm validate:release`), not to default `pnpm test`.

## CI Boundary

Default CI and default Loop validation include only stable, mock-only,
reproducible checks. Release tests are not part of default CI.

Keep these out of default `pnpm test`:

- live provider smoke
- real Photoshop / UXP host smoke
- URL-only asset download branches unless mocked
- large input / ARG_MAX stress
- timeout or delay stress
- repeated or concurrent writes to one `--out` directory
- concurrent writes to one config directory
- any scenario requiring human keys, proxy configuration, external network, or
  paid provider traffic
