# Loop: Chrome Mock E2E Screenshot Plan

## Status

Status: draft
Authority: current user request on 2026-06-25
Owner: `apps/app`
Created: 2026-06-25
Superseded by: none
Context docs:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `apps/app/README.md`

Reference docs:

- `docs/loops/2026-06-25-app-dual-runtime-refactor.md`
- `docs/dev-memory/_inbox/2026-06-25-app-chrome-provider-feasibility.md`

## Goal

Design an opt-in Chrome browser E2E test harness plan for `@imagen-ps/app` that
runs against the Chrome build with the mock provider, one fixed viewport,
deterministic Photoshop simulator state, and screenshot evidence for every page
and core interaction path.

This document is the plan artifact only. Implementation requires a later
execution turn or an active Loop update that explicitly authorizes code changes.

The harness must verify visible UI state changes, route changes, transient
notices, disabled/busy states, menus, attachment flows, provider profile flows,
history filters, generated-result actions, and browser asset loading without
using real Photoshop, UXP Developer Tool, live provider credentials, external
network, or paid APIs.

## Non-goals

- Do not test real Photoshop / UXP host behavior.
- Do not test live provider transport, CORS, credentials, or paid APIs.
- Do not add multi-viewport coverage in this Loop. Use exactly one viewport.
- Do not require long end-to-end business chains such as creating a profile,
  submitting multiple jobs, restarting the browser, and validating every
  persisted artifact in one scenario.
- Do not change product UI design, provider semantics, application command
  semantics, core asset contracts, or package ownership boundaries.
- Do not commit screenshot images, generated browser traces, raw console logs,
  uploaded image bytes, local absolute paths, IndexedDB dumps, or secrets.
- Do not attempt one large uninterrupted all-scenario implementation run. The
  implementation must execute in small phases, validate after each phase, and
  keep moving instead of blocking on one unstable case.

## Scope

Allowed:

- `apps/app/tests/chrome-e2e/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/src/composition/chrome/**`
- `apps/app/src/adapters/chrome/**`
- `apps/app/src/simulators/photoshop/**`
- `apps/app/src/shared/ports/**` only for test-only extension points needed by
  the Chrome harness
- `apps/app/package.json`
- `apps/app/vite.chrome.config.ts`
- `apps/app/vitest.config.ts` only if Vitest browser mode is selected
- `apps/app/STATUS.md`
- `docs/TESTING.md`
- `docs/loops/**`

Forbidden:

- `packages/providers` transport behavior, descriptors, and validation
  semantics.
- `packages/application` command semantics.
- `packages/core-engine` asset/job/runtime contracts.
- `apps/cli`.
- UXP adapter behavior under `apps/app/src/adapters/uxp/**` except read-only
  comparison during planning.
- Shared UI visual redesign or Chrome-only UI branches.
- Default `pnpm validate` dependency on browser E2E screenshots unless a later
  explicit CI decision approves it. The Chrome E2E command remains opt-in.
- Committed screenshot artifacts, traces, raw logs, provider payloads, local
  paths, or secrets.

Ownership boundary:

- Chrome: owns browser E2E runner, mock-provider runtime seed, browser file
  picker fake, scenario switching, screenshot capture, and report files.
- Shared app: may expose stable test hooks or state injection only when they do
  not introduce environment-specific UI behavior.
- Provider: unchanged; tests use built-in mock provider only.
- Application: unchanged; tests verify existing command facade effects through
  UI outcomes and mock-provider results.
- Core: unchanged.
- UXP: unchanged; Chrome evidence must not be reported as real Photoshop proof.

## Baseline

Quick:

- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm --filter @imagen-ps/app test -- tests/chrome-shell.test.tsx tests/chrome-adapter.test.ts tests/bundle`

Known failing baseline:

- None currently documented for repo-side Chrome build and app tests.

Decision if baseline fails:

- Stop and attribute the failure before adding browser E2E. If the failure is
  unrelated and already documented, report it and continue only when it cannot
  affect Chrome E2E attribution.

## Harness Contract

### Runner

Use one of these approaches, selected during Slice 1. The current approved
boundary allows adding a direct browser-runner dependency when useful:

- Preferred: Playwright Chromium test runner under `apps/app/tests/chrome-e2e/`
  with a direct app dev dependency and script if this is the fastest stable path.
- Acceptable: Vitest browser mode with Chromium/Playwright provider if the
  existing workspace tooling can provide screenshot capture, route control, and
  artifact output cleanly.
- Fallback: a small Node script that launches Chromium through an existing
  Playwright-compatible dependency only if it avoids new dependency churn and
  still supports screenshots and deterministic assertions.

Codex in-app Chrome and Computer Use are also allowed as implementation-time
debugging aids for reproducing UI state, inspecting screenshots, and confirming
browser behavior. They are not a replacement for a repository command that can
rerun the test plan.

The selected runner must expose one command:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e
```

The command must build or require a fresh Chrome build, serve
`apps/app/dist/web/index.html`, run the scenarios, and write a machine-readable
summary.

### Viewport

Use exactly one viewport:

```text
390 x 720, deviceScaleFactor 1
```

Rationale: this approximates a narrow Photoshop panel while leaving enough
vertical room to inspect menus, composer, and settings pages without adding
multi-breakpoint scope.

### Test Runtime Seed

The browser harness must load the normal Chrome shell and then seed only test
state through test-only hooks or URL parameters. The normal user-facing UI must
remain shared with UXP.

Required seed controls:

- storage reset before every spec;
- mock provider profile with `profileId=mock-profile`, display name
  `Mock Profile`, default model `mock-image-v1`, and non-secret mock key stored
  through the Chrome storage adapter;
- optional empty-profile state for first-run screens;
- deterministic job history records: completed, failed, and running;
- deterministic Photoshop simulator scenario: seeded document with 10 layers;
- browser file picker fake returning a generated image file;
- scenario toggles for host busy, file picker cancelled, and place asset
  failure.

Test hooks must be available only in the Chrome test harness, for example via a
query string such as `?testHarness=1` or a guarded global created by the Chrome
composition. Do not add `adapter.kind` branching to shared UI.

### Screenshot And Report Artifacts

Use this ignored output shape:

```text
apps/app/tests/chrome-e2e/screenshots/<run-id>/
  failures/
    <scenario-id>.png
    <scenario-id>.json
  report.json
  README.md
```

Requirements:

- screenshots are full viewport PNGs at `390x720`;
- filenames are stable and prefixed with scenario order;
- passing scenarios do not need to retain screenshots by default;
- screenshots and focused evidence are retained when a scenario fails or when
  `KEEP_SCREENSHOTS=1` is set for debugging;
- `report.json` records scenario id, viewport, URL, screenshot relative path
  when retained, DOM assertions, console error count, and pass/fail status;
- `README.md` lists retained screenshots with the asserted expected state and
  failure reason;
- screenshots and reports are local artifacts and must not be committed;
- `.gitignore` coverage must keep screenshot and trace output out of git.

### Browser Error Policy

Every scenario must fail on:

- uncaught page errors;
- console `error` messages;
- failed network requests for same-origin JS, HTML, CSS, icons, or image
  assets;
- missing `#root[data-status="ok"]` after load;
- broken `<img>` elements where `naturalWidth === 0` or `complete === false`.

### Selector Policy

The implementation may add narrow `data-testid` attributes to shared UI when
text, icon-only buttons, repeated rows, or translated labels make selectors
ambiguous. These attributes must be stable, test-oriented, and must not change
visual design or runtime behavior.

### Phased Sprint Policy

The implementation must be split into small phases and must not run all tests
plus all code fixes as one huge batch. Each phase should:

- implement or update only the harness pieces needed for that phase;
- run the phase-specific Chrome E2E subset;
- fix most failures introduced or exposed by that phase before moving on;
- rerun the focused subset after fixes;
- keep evidence for failing cases under the screenshot/report artifact folder;
- record unresolved cases in `apps/app/tests/chrome-e2e/LEGACY_ISSUES.md` or
  the phase report when the case is too slow, flaky, or blocked by a boundary
  decision.

Unresolved cases are acceptable only when they are explicitly recorded with:

- scenario id;
- observed failure;
- retained evidence path;
- suspected owner boundary;
- why it was not fixed in the current phase;
- recommended next action.

The final phase cannot report success by hiding major failures as legacy issues.
Most core path failures must be fixed and verified during this sprint; legacy
issues are for genuinely expensive, flaky, or boundary-blocked cases.

## Coverage Matrix

Each scenario below must include DOM assertions and named screenshot checkpoints.
The runner captures those checkpoints when a scenario fails, and may retain all
checkpoints when `KEEP_SCREENSHOTS=1` is set. Long chains are intentionally
split so failures are attributable.

### 00. Chrome Shell Smoke

Setup:

- reset storage;
- no provider profile;
- seeded-document simulator.

Actions:

- open `/index.html`.

Expected UI:

- root has `data-runtime="chrome"` and `data-status="ok"`;
- header shows `No provider profile` and `No model selected`;
- main page shows `Current session`;
- empty-state text shows `Enter a prompt to submit a real job through the
  application layer.`;
- suggestion buttons show `Blue glass perfume product photo` and
  `Cyberpunk night reference edit`;
- composer placeholder is `Add a profile in Providers first`;
- send button is disabled;
- no console errors and icon images load.

Screenshot:

- `00-smoke-main-empty.png`

### 01. First-Run Provider Navigation

Setup:

- no provider profile.

Actions:

- click header provider selector;
- click `Add Provider profile` in the dropdown.

Expected UI:

- profile dropdown opens below header;
- option `Add Provider profile` is visible;
- after click, Add Provider page opens with title `Add Provider`;
- provider type list includes `Mock Provider`, `image-endpoint`, or the current
  mock provider display name emitted by `listProviders()`.

Screenshots:

- `01-profile-dropdown-empty.png`
- `02-add-provider-step-1.png`

### 02. Add Provider Save Flow

Setup:

- no provider profile.

Actions:

- open Providers page;
- click add;
- choose mock provider;
- verify step 2 form;
- fill alias `Mock Profile E2E`, Base URL `https://mock.local`, default model
  `mock-image-v1`, API Key `mock-key`;
- toggle API key visibility once;
- click `Save`.

Expected UI:

- step 2 title shows selected provider and `2 / 2`;
- fields show labels `Alias`, `Base URL`, `Default model`, `API Key`;
- API key toggle switches input type from password to text and back;
- after save, Provider Detail page opens;
- header shows `Mock Profile E2E`;
- status is `Enabled`;
- API key field placeholder is `Saved; leave blank to keep unchanged`;
- no raw API key appears in visible text or report output.

Screenshots:

- `03-add-provider-step-2-filled.png`
- `04-provider-detail-after-save.png`

### 03. Add Provider Test Flow

Setup:

- no provider profile or isolated storage.

Actions:

- create mock provider draft as in scenario 02;
- click `Test connection` instead of `Save`.

Expected UI:

- while pending, button text changes to `Testing...` and is disabled;
- on success, status notice shows `Connected`;
- saved profile detail or selected profile state uses the same draft profile id;
- no raw API key is visible.

Screenshots:

- `05-add-provider-testing.png`
- `06-add-provider-test-connected.png`

### 04. Provider List And Detail Edit

Setup:

- one seeded mock provider profile.

Actions:

- open Providers page;
- click seeded profile;
- change alias to `Mock Profile Renamed`;
- toggle `Enable profile` off and on;
- clear API key field so existing secret is preserved;
- click `Save`.

Expected UI:

- Providers page shows `Configured`, seeded provider row, family badge,
  `Enabled`, default model `mock-image-v1`, and right chevron;
- detail page shows `Connection info`, `Default model`, and footer save/delete
  controls;
- disabled state visibly changes status to `Disabled`, then back to `Enabled`;
- after save, status notice shows `Saved`;
- updated alias is shown in header and Providers list;
- no `secretValues`, raw key text, or `mock-key` appears in UI or report.

Screenshots:

- `07-settings-provider-list.png`
- `08-provider-detail-editing.png`
- `09-provider-detail-saved.png`

### 05. Provider Detail Test, Model Refresh, Delete

Setup:

- one seeded mock provider profile.

Actions:

- open provider detail;
- click `Test connection`;
- click `Refresh model list`;
- click delete;

Expected UI:

- during test, `Testing...` is disabled;
- after test, status notice shows `Connected`;
- during refresh, button text changes to `Refreshing...`;
- after refresh, model chip/list includes `mock-image-v1` or the mock refreshed
  model id defined by current application behavior;
- after delete, app returns to Providers page and shows `No Provider profile`.

Screenshots:

- `10-provider-detail-test-connected.png`
- `11-provider-detail-refreshing-models.png`
- `12-settings-after-delete.png`

### 06. Main Profile And Model Menus

Setup:

- one seeded mock provider profile with models.

Actions:

- open main page;
- click header provider selector;
- select the profile;
- click composer model chip;
- select `mock-image-v1`.

Expected UI:

- header shows `Mock Profile`;
- model text shows `mock-image-v1`;
- provider menu marks selected profile with check icon and active style;
- model menu marks selected model with check icon and active style;
- clicking outside closes open menus.

Screenshots:

- `13-main-provider-menu.png`
- `14-main-model-menu.png`
- `15-main-selected-profile-model.png`

### 07. Prompt Suggestions And Send Generate

Setup:

- seeded mock provider profile selected;
- no attachments.

Actions:

- click `Blue glass perfume product photo` suggestion;
- assert textarea fills with the product prompt;
- click send;

Expected UI:

- textarea contains the suggestion prompt before send;
- send button is enabled before send;
- after send, textarea clears;
- a user prompt bubble appears;
- provider result card appears with provider label `Mock Profile`;
- status shows `Done`;
- generated image preview is visible;
- metadata line shows size/format fallback or provider metadata;
- actions include `Place in PS`, regenerate, and copy prompt controls.

Screenshots:

- `16-main-suggestion-filled.png`
- `17-main-generate-result.png`

### 08. Attachment Picker, Layer Flow, And Edit Submit

Setup:

- seeded mock provider profile selected;
- seeded-document simulator with 10 image-backed layers.

Actions:

- click add image;
- click `Choose from PS layers`;
- verify layer list;
- click `sim-layer-1.svg` or current first seeded layer name;
- send prompt `edit layer image`.

Expected UI:

- attach picker opens above composer;
- `Choose from PS layers` shows `10 layers`;
- layer list opens with title `PS Layers`, refresh button, and at least 10
  layer rows;
- after choosing a layer, toast shows `Layer added`;
- attachment thumbnail appears above textarea with remove `x`;
- submit uses edit path and result card appears with `Done` and generated
  preview.

Screenshots:

- `18-attach-picker.png`
- `19-layer-list.png`
- `20-layer-attached-toast.png`
- `21-edit-result-from-layer.png`

### 09. File Upload Flow

Setup:

- seeded mock provider profile selected;
- browser file picker fake returns generated PNG/WebP file.

Actions:

- click add image;
- click `Upload from computer`;
- send prompt `edit uploaded image`.

Expected UI:

- upload option is visible with `PNG / JPG / WebP` subtitle;
- after fake file selection, toast shows `Image added`;
- attachment thumbnail appears with remove `x`;
- submit result uses edit path and displays `Done`.

Screenshots:

- `22-file-attached-toast.png`
- `23-edit-result-from-file.png`

### 10. Attachment Removal And Cancelled Picker

Setup:

- seeded mock provider profile selected;
- browser file picker fake can return `undefined`.

Actions:

- add a file attachment;
- click attachment remove `x`;
- open upload again with cancelled picker.

Expected UI:

- after remove, attachment row disappears;
- cancelled picker leaves composer unchanged;
- no toast is shown for cancellation;
- send without attachment returns to generate path for the next submit.

Screenshots:

- `24-attachment-removed.png`
- `25-file-picker-cancelled.png`

### 11. Generated Result Actions

Setup:

- seeded mock provider profile selected;
- one completed generated result visible.

Actions:

- click `Place in PS`;
- click copy prompt action;
- click regenerate action.

Expected UI:

- place success toast shows `Placed on Photoshop canvas`;
- copy prompt toast shows `Filled into the prompt box` and textarea contains
  the copied prompt;
- regenerate creates another round or updates the round according to current
  retry behavior; visible provider card remains successful with `Done` after
  retry settles.

Screenshots:

- `26-place-success-toast.png`
- `27-copy-prompt-toast.png`
- `28-regenerate-result.png`

### 12. Error And Retry Flow

Setup:

- seeded mock provider profile selected;
- inject one failed round or force next mock submit/retry to fail.

Actions:

- submit prompt that produces a controlled error;
- click `Retry` on the error card.

Expected UI:

- error provider card appears;
- status text shows `Failed · Mock Profile`;
- error message is visible;
- retry button is visible;
- after retry succeeds, status changes to `Done` and result preview appears;
- History page also lists the failed or retried item consistently.

Screenshots:

- `29-main-error-card.png`
- `30-main-retry-success.png`

### 13. History Page Filters And Retry

Setup:

- seeded job history with one completed, one failed, and one running record;
- optional current failed round for retry.

Actions:

- open History;
- click filters `All`, `Done`, `Running`, `Failed`;
- click refresh;
- click retry on a failed current-session item.

Expected UI:

- History header shows title `History`, back, and refresh controls;
- filter bar shows `All`, `Done`, `Running`, `Failed`;
- All view shows completed, failed, and running rows;
- Done filter shows only completed rows with green status;
- Running filter shows spinner/yellow running state;
- Failed filter shows failed row with `Retry`;
- retry click returns to or updates main flow with a retried result according to
  current app behavior;
- back button returns to Main page.

Screenshots:

- `31-history-all.png`
- `32-history-done-filter.png`
- `33-history-running-filter.png`
- `34-history-failed-filter.png`

### 14. Host Capability Failure States

Setup:

- seeded mock provider profile;
- simulator scenario toggles for host busy, place asset failure, and no
  document/empty document.

Actions:

- load host-busy scenario and open layer list;
- load place-asset-failure scenario and click `Place in PS`;
- load no-document or empty-document scenario and open layer list.

Expected UI:

- host-busy layer read/list failure surfaces an error toast or visible message,
  not a crash;
- place failure toast shows simulator error or `Failed to place in Photoshop`;
- empty/no-document layer list shows `No available layers`;
- root remains `data-status="ok"` and no uncaught page error is reported.

Screenshots:

- `35-host-busy-toast.png`
- `36-place-failure-toast.png`
- `37-empty-layer-list.png`

### 15. Persistence Smoke

Setup:

- real browser IndexedDB backend, not memory backend.

Actions:

- create mock provider profile;
- reload page;
- open Providers and Main.

Expected UI:

- provider profile remains visible after reload;
- header can select the persisted profile;
- saved secret placeholder appears in detail;
- no raw secret appears in UI, screenshots, or report.

Screenshots:

- `38-persisted-provider-after-reload.png`

## Implementation Slices

### Slice 1: Runner And Artifact Harness

Goal:

- Add an opt-in Chrome E2E runner command, static server, viewport setup,
  storage reset, screenshot writer, and report writer.

Allowed:

- `apps/app/tests/chrome-e2e/**`
- `apps/app/package.json`
- `apps/app/vite.chrome.config.ts`
- `docs/TESTING.md`

Validation:

- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep smoke` or equivalent
  first-run smoke subset

Stop:

- Stop if selecting a runner requires repo-wide CI or package-manager policy
  changes outside the app boundary.
- Stop if screenshot output cannot be kept out of git.

Report evidence:

- Runner command.
- Screenshot artifact path.
- `report.json` schema sample.

### Slice 2: Chrome Test Harness State Injection

Goal:

- Add deterministic Chrome-only test hooks for storage reset, mock profile seed,
  file picker fake, simulator scenario selection, mock failure injection, and
  history records without adding environment branches to shared UI.

Allowed:

- `apps/app/src/composition/chrome/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/src/adapters/chrome/**`
- `apps/app/src/simulators/photoshop/**`
- `apps/app/tests/chrome-e2e/**`

Validation:

- `pnpm --filter @imagen-ps/app test -- tests/chrome-shell.test.tsx tests/chrome-adapter.test.ts`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep harness`

Stop:

- Stop if shared UI needs `runtime === "chrome"` or adapter-kind branching.
- Stop if storage seeding requires changing `packages/application` semantics.

Report evidence:

- Seed API documented in the test harness.
- One screenshot proving seeded profile appears in UI.

### Slice 3: Page Navigation And Provider Management Coverage

Goal:

- Implement scenarios 00-06, covering shell smoke, first-run navigation,
  provider add/save/test, settings list/detail edit/test/refresh/delete, and
  profile/model menu states.

Allowed:

- `apps/app/tests/chrome-e2e/**`
- narrowly scoped Chrome harness hooks from Slice 2 only if needed

Validation:

- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep providers`
- `pnpm --filter @imagen-ps/app test`

Stop:

- Stop only if current UI requires broad visual/product changes. Narrow
  `data-testid` additions are already allowed by this plan.

Report evidence:

- Screenshots 00-15.
- DOM assertions for every expected state.
- `LEGACY_ISSUES.md` entries for any provider-management case deferred because
  it is slow, flaky, or boundary-blocked.

### Slice 4: Main Composer, Attachments, Result Actions, And History Coverage

Goal:

- Implement scenarios 07-14, covering prompt suggestions, generate/edit
  submit, layer/file attachments, removal/cancel, place/copy/regenerate,
  controlled error/retry, history filters, and host capability failure states.

Allowed:

- `apps/app/tests/chrome-e2e/**`
- narrowly scoped Chrome harness hooks from Slice 2 only if needed

Validation:

- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep main-history`
- `pnpm --filter @imagen-ps/app test`

Stop:

- Stop if mock provider cannot deterministically emit running, success, and
  failure states without changing provider/application semantics.
- Stop if file upload cannot be faked without browser runner support.

Report evidence:

- Screenshots 16-37.
- Report entries proving console/network/image checks passed.
- `LEGACY_ISSUES.md` entries for any main/history case deferred because it is
  slow, flaky, or boundary-blocked.

### Slice 5: Persistence, Documentation, And Final Gate

Goal:

- Implement scenario 15, document the command and artifact policy, and run final
  repo validation.

Allowed:

- `apps/app/tests/chrome-e2e/**`
- `apps/app/STATUS.md`
- `docs/TESTING.md`
- `docs/loops/**`

Validation:

- `pnpm --filter @imagen-ps/app test:chrome-e2e`
- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm validate`

Stop:

- Stop if persistence requires storing secrets or raw binary payloads in report
  artifacts.

Report evidence:

- Screenshot 38.
- Final report path.
- Final commands and results.
- Final unresolved-case summary. Major core-path failures must be fixed before
  claiming completion; only genuinely expensive, flaky, or boundary-blocked
  cases may remain as legacy issues.

## Validation

Quick:

- `pnpm check:policy`
- `git diff --check`

Per-slice:

- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep <slice-tag>`

Final:

- `pnpm --filter @imagen-ps/app test:chrome-e2e`
- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm validate`

Manual-only:

- None for this Loop. Chrome E2E evidence is repo-side browser evidence only.

Live-provider:

- None. All provider behavior uses the built-in mock provider.

## Decision Packet Triggers

- Browser E2E runner choice requires repo-wide CI policy changes outside
  `apps/app`.
- Stable UI assertions require broad product UI changes rather than narrow test
  hooks.
- Mock provider cannot produce deterministic success/failure/retry states
  without changing provider or application command semantics.
- File picker automation cannot be implemented in the selected browser runner.
- Screenshot artifact policy conflicts with repository policy or git hygiene.
- Any scenario requires real Photoshop, UXP Developer Tool, live provider
  credentials, external network, or paid APIs.
- Shared UI would need Chrome-only page files or environment-specific behavior.

## Confirmed Boundary Decisions

- Plan-only in this turn; implementation needs separate execution
  authorization.
- Direct browser runner dependencies are allowed when they stay inside the app
  boundary and do not make default validation depend on screenshot E2E.
- Codex in-app Chrome and Computer Use may be used freely as debugging aids.
- Save screenshot evidence by default only for failures; allow
  `KEEP_SCREENSHOTS=1` for full local review.
- Narrow `data-testid` additions are allowed for stable selectors.
- Error-state coverage must include provider mock failure, retry, host busy,
  file picker cancel, place asset failure, and empty layer list.
- Failure-state control should live in the Chrome test harness/app adapter, not
  in `packages/providers` or `packages/application`.
- The fixed viewport is `390x720`.
- Long chains should be split into shorter attributable scenarios.
- Cases that cannot be solved without excessive time or boundary changes must
  be recorded as legacy issues with evidence, but most core failures must be
  fixed and verified during the implementation sprint.

## Remaining Execution-Time Decisions

1. Runner implementation detail: Playwright test runner vs Vitest browser mode.
   Default to direct Playwright if it is faster and cleaner.
2. Persistence depth: scenario 15 requires profile persistence after reload;
   job history and asset-ref reload checks are optional stretch coverage unless
   they are cheap after the harness exists.

## Completion Report

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Browser evidence:
- Screenshot/report artifacts:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Record if:

- The implementation produces a durable project workflow for Chrome browser E2E
  screenshots or a reusable bug record about browser-only harness behavior.

Do not record:

- Routine passing screenshots, raw logs, generated reports, local artifact
  paths containing user-specific absolute directories, uploaded images, secrets,
  or speculative planning notes.
