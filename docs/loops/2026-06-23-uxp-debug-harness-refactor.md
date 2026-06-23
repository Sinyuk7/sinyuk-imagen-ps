# Loop: UXP Debug Harness Refactor

## Status

Status: draft
Authority: current user authorization on 2026-06-23
Owner: `apps/app`
Created: 2026-06-23
Superseded by: No follow-up while draft
Context docs:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `docs/dev-memory/memories/workflow/uxp-fast-debug-playbook.md`
- `docs/dev-memory/memories/workflow/uxp-host-debug-prep.md`
- `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md`
- `docs/dev-memory/memories/workflow/调试建议 1.md`
- `docs/dev-memory/memories/workflow/调试建议 2.md`
- `docs/dev-memory/memories/architecture/uxp-boundary-crash-containment.md`

## Goal

Make Photoshop UXP debugging reproducible for Codex by converting the current
manual DevTools workflow into a bounded, evidence-producing harness, starting
from the reproduced real-host Settings Save crash and the currently too-coarse
last checkpoint.

## Non-goals

- Do not claim `pnpm validate` proves real Photoshop host behavior.
- Do not automate paid or credentialed live provider traffic.
- Do not build a long-lived fork of Adobe's old UXP DevTools CLI.
- Do not store raw plugin logs, crash reports, screenshots, provider payloads,
  local absolute paths, or secrets in tracked docs.
- Do not broaden `apps/app` into provider, CLI, or core-engine ownership.

## Scope

Allowed:

- `apps/app/src/host/`
- `apps/app/tests/`
- `apps/app/harness/`
- `apps/app/package.json`
- root `package.json` scripts only for harness entrypoints
- `scripts/` for repo-local diagnostics helpers
- `docs/loops/`
- `docs/dev-memory/_inbox/` or `docs/dev-memory/memories/workflow/` for
  sanitized follow-up records

Forbidden:

- `packages/providers` behavior changes except adding mock-only tests if a
  boundary contract already exists.
- `packages/core-engine` behavior changes unless a later slice produces a
  Decision Packet and receives approval.
- real provider keys, live provider smoke, or network-dependent default tests.
- raw files under `.artifacts/`, Photoshop crash reports, PluginData logs, or
  screenshots in git.

Ownership boundary:

- CLI: may expose repo-local helper commands only; no Photoshop or provider
  business behavior.
- Provider: unchanged.
- Application: command contracts are consumed as-is; do not move app-only host
  diagnostics into application.
- Core: unchanged except through existing command/runtime logs.
- UXP: owns entrypoint lifecycle, host smoke handle, diagnostics, scenario
  bridge, and real Photoshop manual gates.

## Baseline

Quick:

- `pnpm --filter @imagen-ps/app build` passed on 2026-06-23.
- `pnpm --filter @imagen-ps/app test` passed on 2026-06-23: 17 files, 66 tests.
- `pnpm --filter @imagen-ps/app build` produced
  `apps/app/dist/assets/index.js` with SHA-256
  `0b30cd005b918626e349ca7efe3dddcb3a3646dd051fee8f7bc30a79ccba5075`.

Real host smoke evidence:

- Photoshop 2026 `27.7.0` and Adobe UXP Developer Tools were running.
- UXP Developer Mode was enabled via Adobe UXP Developer settings.
- UXP Developer Tools listened on `ws://127.0.0.1:14001/socket/cli`; a minimal
  websocket open/close probe succeeded.
- UXP Developer Tools loaded `com.imagen-ps.panel` from `apps/app/dist`.
- Debugger showed this warning:
  `Imagen PS UXP entrypoints setup failed Error: create method is not defined for plugin.`
- Despite that warning, fallback React mount existed in the UXP debug context:
  `plugin:/`, `#root`, `__IMAGEN_PS_PANEL_RUNTIME__`,
  `__IMAGEN_PS_REACT_ROOT__`, and `__IMAGEN_PS_HOST_SMOKE__` were present.
- Photoshop menu `Plugins > Imagen PS > Imagen` did not make a visible panel
  appear during the smoke.
- `__IMAGEN_PS_HOST_SMOKE__.listLayers()` ran and logged
  `hostbridge.list_layers.start/ok`, returning `[]` while Photoshop was on the
  Home screen.
- `__IMAGEN_PS_HOST_SMOKE__.submitJob()` with the mock profile completed and
  logged `command.submit`, `runtime.job`, `runner.step`, and
  `dispatch.provider` start/ok events.
- `__IMAGEN_PS_HOST_SMOKE__.placeAssetOnCanvas()` with a tiny valid PNG
  completed and logged `hostbridge.place_asset.start/ok`.
- No new Photoshop crash report appeared during this run.

Settings Save crash reproduction:

- After rebuilding and loading the same plugin, Photoshop menu
  `Plugins > Imagen PS > Imagen` still did not show a visible panel because the
  real host rejected the entrypoint lifecycle shape.
- In the real UXP debug context, Codex clicked the actual React handlers by DOM
  route: main header settings button, first `.prov-row`, then `.btn-save`.
- Settings rendered two configured profiles. The first profile detail page
  rendered `Debug Mock Provider`, fields for Alias, Base URL, API Key, Enable
  profile, Default model, and buttons for Refresh model list, Test connection,
  Save, and Delete.
- Triggering repeated Save clicks against `.btn-save` made Photoshop 2026 exit.
  UXP Developer Tools returned to Developer Workspace and the plugin state
  became `Not loaded`.
- A new macOS diagnostic report appeared:
  `Adobe Photoshop 2026-2026-06-23-170943.ips`.
- The new report classified the failure as `EXC_BAD_ACCESS` / `SIGSEGV`, with
  faulting thread `0` / main thread. The report also contained an
  `Imagen PS - UXP JavaScript Thread`, but the plugin JSONL did not flush a JS
  exception.
- The last plugin JSONL event before host termination was
  `command.profile.save.start` for `debug-mock-profile`; there was no matching
  `command.profile.save.ok` or `command.profile.save.error`.
- The raw `.ips`, plugin JSONL, and screenshots were copied only under the
  ignored local run directory
  `.artifacts/uxp/runs/20260623-uxp-settings-save-click-repro/`.

Known failing baseline:

- The real host rejects the current `uxp.entrypoints.setup()` shape with
  `create method is not defined for plugin`.
- Existing fake entrypoint tests did not catch this because they accept a
  `plugin` object with only `destroy()` and a `panels[panelId].create()` method.
- The profile save path has only coarse `command.profile.save.start` logging.
  If Photoshop crashes inside existing profile reads, list reads,
  `secureStorage`, provider validation, data-folder JSON write, or save
  rollback, the current last checkpoint is too broad.
- `hostbridge.place_asset` also has only coarse start/ok logging. If Photoshop
  crashed inside temp file creation, session token creation, modal entry, or
  `batchPlay`, the current last checkpoint would be too broad.
- Codex can use the smoke handle only through manual DevTools console typing
  today; there is no `pnpm uxp:scenario -- <scenario>` control plane.

Decision if baseline fails:

- If app build/test fails, fix or record the failing baseline before extending
  host automation.
- If real Photoshop cannot load the plugin at all, stop at entrypoint lifecycle
  repair before scenario runner work.
- If Settings Save still crashes with only `command.profile.save.start`
  available, do not guess the code fix. Add checkpoints first, reproduce once,
  and then fix the narrowed boundary.

## Slices

### Slice 1: Profile Save Flight Recorder

Goal:

- Add fine-grained, sanitized checkpoints around the real crashing Settings
  Save path so a native crash leaves a narrow last event instead of only
  `command.profile.save.start`.

Allowed:

- `apps/app/src/host/uxp-provider-profile-repository.ts`
- `apps/app/src/host/uxp-secret-storage-adapter.ts`
- `apps/app/src/host/uxp-log-sink.ts`
- `apps/app/src/host/uxp-diagnostics.ts`
- host tests under `apps/app/src/host/`
- package/application tests only if a command-level checkpoint contract is
  needed without changing command behavior

Forbidden:

- UI redesign.
- Provider/profile command behavior.
- Photoshop writeback behavior.
- Storing secret values, full profile JSON with secrets, local paths, or raw
  crash reports in tracked files.

Validation:

- `pnpm --filter @imagen-ps/app test -- src/host/uxp-host-adapters.test.ts src/host/uxp-diagnostics.test.ts`
- `pnpm --filter @imagen-ps/app build`
- Manual-only: reproduce Settings -> first profile -> Save against the current
  real host and verify the last JSONL event identifies the exact sub-boundary:
  profile read/list, secret read/write, provider validation, repository read,
  repository write, or rollback.

Stop:

- Stop if adding logging to the save path itself changes crash behavior or
  requires cross-package command semantics. Produce a Decision Packet instead
  of widening the patch.

Report evidence:

- Before/after last-checkpoint examples for the Save crash.
- Redaction evidence proving no secret values or local paths enter checkpoints.
- Whether Photoshop still crashes, and the new `.ips` file name if it does.

### Slice 2: Crash Collector And Triage Summary

Goal:

- Automate pre/post Photoshop PID, start time, crash report delta, bundle
  fingerprint, last plugin JSONL checkpoint, and a sanitized `.ips` summary for
  every real-host run.

Allowed:

- `scripts/uxp-collect-*`
- `apps/app/harness/uxp-scenario/`
- tests using fixture `.ips` snippets with local paths removed

Forbidden:

- Committing raw `.ips`, `.spin`, screenshots, PluginData JSONL, provider
  payloads, or local absolute paths.

Validation:

- Unit tests for `.ips` summarization and redaction.
- Manual-only: execute a no-crash run and verify `crashNew: []`, PID alive, and
  last checkpoint are reported.
- Manual-only: execute the Settings Save crash once and verify the summary
  captures the new Photoshop report name, exception type, termination reason,
  faulting thread, and last plugin checkpoint.

Stop:

- Stop if macOS report formats differ enough that summarization would be
  misleading; store only file names/timestamps and last plugin checkpoint.

Report evidence:

- Sanitized triage summary example.
- Redaction checks.

### Slice 3: Real UXP Entrypoint Contract

Goal:

- Make `uxp.entrypoints.setup()` match the real Photoshop UXP host shape and
  add fake-host tests that reject the current missing plugin `create()` shape,
  so subsequent real-host clicks can happen through the visible Photoshop panel
  rather than only through the debug DOM fallback.

Allowed:

- `apps/app/src/host/uxp-panel-runtime.tsx`
- `apps/app/src/index.tsx`
- `apps/app/src/host/uxp-panel-runtime.test.tsx`
- `apps/app/tests/index-reload.test.tsx`
- `docs/dev-memory/memories/bug/` for a sanitized bug record after validation

Forbidden:

- UI redesign.
- Provider/profile command behavior.
- Photoshop writeback behavior.

Validation:

- `pnpm --filter @imagen-ps/app test -- src/host/uxp-panel-runtime.test.tsx tests/index-reload.test.tsx`
- `pnpm --filter @imagen-ps/app build`
- Manual-only: load in UXP Developer Tools and verify the debugger no longer
  reports `create method is not defined for plugin`; verify the panel opens
  visibly from `Plugins > Imagen PS > Imagen`.

Stop:

- Stop and produce a Decision Packet if Adobe's real entrypoint schema requires
  a lifecycle model that conflicts with the manifest or current React root
  ownership.

Report evidence:

- Exact `entrypoints.setup()` object shape.
- Fake test that would have failed on the 2026-06-23 real-host error.
- Host-loaded artifact path and no-warning debugger evidence.

### Slice 4: Host Boundary Flight Recorder

Goal:

- Extend fine-grained, sanitized checkpoints to the remaining high-risk host
  boundaries beyond profile save.

Allowed:

- `apps/app/src/host/photoshop-host-bridge.ts`
- `apps/app/src/host/uxp-log-sink.ts`
- `apps/app/src/host/uxp-diagnostics.ts`
- host tests under `apps/app/src/host/`

Forbidden:

- Changing provider dispatch semantics.
- Storing raw binary payloads, full descriptors, local native paths, or secrets.

Validation:

- `pnpm --filter @imagen-ps/app test -- src/host/photoshop-host-bridge.test.ts src/host/uxp-diagnostics.test.ts src/host/uxp-host-adapters.test.ts`
- Manual-only: run `placeAssetOnCanvas` through host smoke and confirm events
  include pre-call checkpoints such as temp file start/ok, session token
  created, modal enter, `batchPlay.placeEvent.start`, and success/error.

Stop:

- Stop if extra logging introduces host writes that can themselves block or
  crash the boundary.

Report evidence:

- Last-checkpoint examples for both success and forced fake failure.
- Redaction evidence.

### Slice 5: Codex-Readable Scenario Runner

Goal:

- Replace manual DevTools console typing with a repo command that creates a run
  directory, connects to the UXP Developer Tools websocket/CDT path when
  available, runs a small scenario, and writes sanitized result artifacts.

Allowed:

- `apps/app/harness/uxp-scenario/`
- `scripts/uxp-*`
- root/app package scripts for `uxp:scenario`, `uxp:collect`, and `uxp:triage`
- tests for pure parsing/summarization logic

Forbidden:

- Treating UXPDT private websocket behavior as a stable public contract.
- Failing default `pnpm test` when Photoshop/UXPDT is absent.
- Provider live traffic.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm uxp:scenario -- list-layers` only when UXPDT and Photoshop are already
  running.
- Scenario output must write under `.artifacts/uxp/runs/<runId>/` and be
  ignored by git.

Stop:

- Stop if UXPDT websocket protocol cannot be used without brittle sleeps or
  repeated GUI intervention. Fall back to documented manual DevTools console
  snippets and keep the private websocket as experimental.

Report evidence:

- `env.json`, `result.json`, sanitized `trace.jsonl`, and crash delta summary
  shape.
- Clear distinction between skipped, passed, failed, and host-unavailable.

### Slice 6: Codex GUI Front-Of-House Skill

Goal:

- Add a repo skill or documented procedure that uses Computer Use only for
  stable GUI setup steps: start Photoshop/UXPDT, load/reload plugin, open
  debugger, and capture visible panel state.

Allowed:

- `.agents/skills/photoshop-uxp-debug/`
- `docs/dev-memory/memories/workflow/`

Forbidden:

- Encoding feature-specific business clicks as the primary test path.
- Using Computer Use to type secrets, operate live provider accounts, or
  approve system security changes.

Validation:

- Dry-run the skill instructions against the scenario runner and one manual
  visible panel check.

Stop:

- Stop if GUI state varies too much to make Record & Replay reliable. Keep GUI
  work as a checklist and make scenario runner the primary automation surface.

Report evidence:

- Which steps are GUI-only, which are structured commands, and which require
  human approval.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- Slice-specific app tests listed above.
- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test`

Final:

- `pnpm validate`

Manual-only:

- UXP Developer Tools load/reload from `apps/app/dist/manifest.json`.
- Photoshop `Plugins > Imagen PS > Imagen` visible panel check.
- UXP debugger read-only probe for DOM/root/host smoke handle.
- Controlled smoke scenarios: `listLayers`, mock `submitJob`, and
  `placeAssetOnCanvas` with a tiny valid PNG.
- Crash delta check under `~/Library/Logs/DiagnosticReports`.

Live-provider:

- None for this Loop.

## Decision Packet Triggers

- Real UXP entrypoint schema conflicts with current manifest v5 panel model.
- UXPDT websocket/CDT automation requires private, unstable protocol behavior
  that cannot be bounded.
- Scenario runner needs live provider credentials or paid API calls.
- A slice needs direct app imports from `@imagen-ps/core-engine`,
  `@imagen-ps/providers`, or `@imagen-ps/cli`.
- A host crash happens without enough checkpoint evidence to attribute the
  boundary after Slice 2.

## Completion Report

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
- Decision Packet, if blocked:

## Memory Note Candidate

Record after execution, not while this document is draft:

- `bug`: real UXP entrypoint schema mismatch if fixed and verified.
- `workflow`: successful scenario runner pattern if it proves repeatable.
- `manual-host-result`: real Photoshop smoke outcomes, sanitized and without
  raw logs or local paths.

Do not record raw `.artifacts` contents.
