# Loop: UXP Photoshop Smoke Closure

## Status

Status: draft
Authority: current user request on 2026-06-20 to design a bounded Loop for the full UXP / Photoshop smoke checklist, with execution to continue until all smoke cases pass after approval.
Owner: `apps/app`
Created: `2026-06-20`
Superseded by: none while draft
Context docs:

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `apps/app/AGENTS.md`
- Current authority: `packages/application/AGENTS.md`
- Current authority: `packages/providers/AGENTS.md`
- Current authority: `packages/core-engine/AGENTS.md`
- Current authority: `packages/foundation/AGENTS.md`
- Manual-only workflow: `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md`
- Host debug workflow: `docs/dev-memory/memories/workflow/uxp-host-debugging.md`
- Historical bug evidence: `docs/dev-memory/memories/bug/uxp-panel-css-compat.md`
- Historical bug evidence: `docs/dev-memory/memories/bug/uxp-submit-preview-crash.md`
- Historical bug evidence: `docs/dev-memory/_inbox/2026-06-19-uxp-provider-feedback-fix.md`
- Historical architecture evidence: `docs/dev-memory/memories/architecture/UXP_STORAGE_STRATEGY.md`
- Historical decision evidence: `docs/dev-memory/memories/decisions/durable-job-history.md`

## Goal

Run the full manual UXP / Photoshop smoke checklist against the host-loaded `apps/app/dist/manifest.json`, automatically diagnose and fix every failing case within the documented package boundaries, add repo-side harness coverage for every real-host bug class found, and finish only when every checklist item passes in real Photoshop / UXP with `pnpm validate` green.

## Non-goals

- Do not add real Photoshop, UXP Developer Tool, provider credentials, external network, or paid APIs to default `pnpm test` / `pnpm validate`.
- Do not redesign the UXP UI, broaden provider capabilities, or change product behavior beyond what is necessary to make the smoke checklist pass.
- Do not harden final manifest network policy in this Loop; `network.domains: "all"` remains a development smoke setting unless a separate manifest/network-policy Loop authorizes tightening.
- Do not store raw logs, crash reports, provider payloads, local absolute paths, or secrets in `docs/dev-memory`.
- Do not commit `.test.env` or any real API token.

## Scope

Allowed:

- `docs/loops/2026-06-20-uxp-photoshop-smoke-loop.md`
- `docs/dev-memory/_inbox/YYYY-MM-DD-*.md` for sanitized execution results, root causes, and manual-host-result notes.
- `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md` only to mark final smoke results or clarify executable checklist wording.
- `.test.env.example` for safe, no-secret template updates.
- `apps/app/src/**`, `apps/app/tests/**`, `apps/app/public/manifest.json`, and `apps/app/package.json` when the failing case is UXP shell, React UI, host bridge, UXP storage, diagnostics, local app services, manifest packaging, or app-side harness coverage.
- `packages/application/src/**` and `packages/application/tests/**` when the failing case is command/session/profile/model coordination, provider config resolution, durable history contract, or application logging context.
- `packages/providers/src/**` and `packages/providers/tests/**` when the failing case is image-endpoint/chat-image provider request building, transport compatibility in UXP-like runtimes, model discovery, response parsing, normalization, or provider diagnostics.
- `packages/foundation/src/**` when the failing case is trace/span logging, JSONL serialization, or redaction behavior.
- `packages/core-engine/src/**` only when host evidence attributes the failure to job facts, lifecycle, event emission, store behavior, or dispatch boundary semantics, and the fix remains host-agnostic.

Forbidden:

- `apps/cli/src/**` CLI parser, stdout/stderr, and command contract changes unless a live-provider cross-check exposes a narrow CLI smoke harness defect unrelated to app behavior.
- Provider marketplace, new provider family, billing, scheduler, or product roadmap work.
- Direct imports from `apps/app` to `@imagen-ps/core-engine`, `@imagen-ps/providers`, or `apps/cli`.
- React, DOM, Photoshop, UXP, Node `fs/path/os`, or surface-app imports inside `packages/application`.
- App/session state, job lifecycle ownership, host IO, or settings persistence inside `packages/providers`.
- Host IO, network IO, React/DOM, Node `fs/path/os`, or workspace reverse dependencies inside `packages/foundation`.
- Raw secret values, provider response payload dumps, raw crash reports, local user paths, or generated build output in committed docs.

Ownership boundary:

- CLI: no owner by default; use only for optional live-provider cross-checks from `docs/TESTING.md`.
- Provider: `packages/providers` owns provider validation, request builders, transport compatibility, model discovery, response parsing, and provider diagnostics.
- Application: `packages/application` owns session commands, profile/model coordination, runtime assembly, provider config resolution, and host-injected repository contracts.
- Core: `packages/core-engine` owns host-agnostic job facts, lifecycle, store, events, and dispatch boundary only when host evidence reaches that layer.
- UXP: `apps/app` owns React UI, UXP shell, host bridge, UXP storage adapters, secure storage, diagnostics, manifest packaging, and Photoshop writeback.

## Baseline

Quick:

- `git status --short`
- `git diff --check`
- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app build`
- `test -f apps/app/dist/manifest.json`

Known failing baseline:

- None established by this plan. The executing agent must run the baseline before code changes.
- Current worktree note: `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md` was already modified before this Loop draft; do not revert it unless the user requests that.
- Local credential note: root `.test.env` may contain the n1n / llm-api.net token for live smoke and is gitignored. `.test.env.example` must stay a no-secret template.

Decision if baseline fails:

- If a baseline failure is inside allowed scope, fix it before host smoke and add or adjust focused tests.
- If a baseline failure is unrelated to this Loop, report it, keep it out of the fix scope, and continue only when it does not block attribution.
- If missing dependencies block all progress, run `pnpm bootstrap` once and re-check before stopping.

## Execution Rules

- Do not treat fake UXP tests, browser/jsdom tests, or `pnpm validate` as proof of real Photoshop behavior.
- Before every dangerous host action such as Send or Place, verify that UXP Developer Tool is loading the intended `apps/app/dist/manifest.json` and that the rebuilt bundle fingerprint matches the active worktree.
- For every failing checklist case: capture sanitized symptom, identify the last trustworthy event, inspect the owner boundary, patch only the owner boundary that owns the root cause, add repo-side harness coverage for that bug class, rebuild, reload UXP, and rerun from the failed case.
- For Photoshop crash, restart, or disappearance: capture Photoshop PID/start time, latest crash report timestamp/name only, sanitized app JSONL event names/error summaries, UXP Developer Tool console summary, and the host-loaded artifact path before changing code.
- For real provider failures: use the configured `image-endpoint` profile with `IMAGEN_SMOKE_N1N_API_KEY`; try `https://llm-api.net` first, then `https://api.n1n.ai` if the failure is network/region-specific. The provider appends `/v1/images/*` and `/v1/models`; do not configure `/v1/chat/completions` or `/v1/responses` for this image-endpoint smoke.
- Use a local mock image endpoint only as a fallback harness to isolate app/UI behavior from external service downtime; do not count it as live-provider proof.
- Ordinary smoke failures, UI defects, provider request/response defects, UXP CSS incompatibilities, storage errors, logging/redaction defects, and crashes with actionable host evidence are not Decision Packet triggers; debug and fix them inside this Loop.

## Slices

### Slice 1: Baseline And Artifact Identity

Goal:

- Establish a clean repo-side baseline and prove which app bundle UXP Developer Tool will load.

Allowed:

- `apps/app/dist/` inspection only; source changes only if baseline build/test/policy fails inside allowed scope.
- `docs/dev-memory/_inbox/YYYY-MM-DD-*.md` for sanitized baseline notes if reusable.

Forbidden:

- Host smoke claims before Photoshop loads the built manifest.
- Any source edit based only on screenshots or stale `dist/` output.

Validation:

- `git status --short`
- `git diff --check`
- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app build`
- `test -f apps/app/dist/manifest.json`
- `ls -lt apps/app/dist apps/app/dist/assets`

Stop:

- Stop only if app build cannot produce `apps/app/dist/manifest.json` after allowed baseline fixes.

Report evidence:

- Host-loaded manifest path.
- Bundle timestamp/fingerprint condition.
- Baseline command results.

### Slice 2: Load Panel And Startup Smoke

Goal:

- Load `apps/app/dist/manifest.json` in UXP Developer Tool, open the panel in Photoshop, and verify the React shell renders without startup console errors.

Allowed:

- `apps/app/public/manifest.json`
- `apps/app/src/index.tsx`
- `apps/app/src/host/**`
- `apps/app/src/ui/**`
- `apps/app/tests/**`

Forbidden:

- Provider transport changes unless startup evidence reaches provider initialization.
- UI redesign beyond the smallest compatibility fix needed to render and operate the existing panel.

Validation:

- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test`
- UXP Developer Tool load/reload of `apps/app/dist/manifest.json`
- Photoshop panel render check with UXP console summary.

Stop:

- Stop only if Photoshop or UXP Developer Tool is not installed, cannot launch, or cannot load any plugin artifact on the machine.

Report evidence:

- Photoshop version.
- UXP Developer Tool version.
- Panel visibility.
- Startup console error summary, sanitized.

### Slice 3: Profile, Secret, And Model Smoke

Goal:

- Prove Settings can create, test, save, reload, delete, and refresh models for provider profiles through UXP data folder and secure storage.

Allowed:

- `apps/app/src/host/**`
- `apps/app/src/ui/pages/settings-*.tsx`
- `apps/app/src/ui/hooks/use-provider-settings.ts`
- `apps/app/src/app-services/**`
- `apps/app/tests/**`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/runtime.ts`
- `packages/application/src/**/*.test.ts`
- `packages/providers/src/providers/image-endpoint/**`
- `packages/providers/src/transport/image-endpoint/**`
- `packages/providers/tests/**`
- `.test.env.example`

Forbidden:

- Persisting secret values outside UXP `secureStorage` or `.test.env`.
- Treating a local mock endpoint as live-provider proof.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/application test` if application code changes.
- `pnpm --filter @imagen-ps/providers test` if provider code changes.
- Real UXP Settings smoke with n1n image-endpoint profile using `IMAGEN_SMOKE_N1N_API_KEY`.

Stop:

- Stop only if both `https://llm-api.net` and `https://api.n1n.ai` reject the credential or account in a way verified not to be caused by repo request shape, transport, or model parsing.

Report evidence:

- Profile create/test/save/reload/delete result.
- Model refresh result.
- Whether API key appears only as a write-only secret ref.
- Sanitized command/log event names.

### Slice 4: Photoshop Layer, File, And Mask IO Smoke

Goal:

- Prove layer tree selection, pixel layer read, image file picker, and user-mask read paths work in a real Photoshop document.

Allowed:

- `apps/app/src/app-services/host-bridge.ts`
- `apps/app/src/host/photoshop-host-bridge.ts`
- `apps/app/src/host/**`
- `apps/app/src/ui/pages/main-page.tsx`
- `apps/app/src/ui/**`
- `apps/app/tests/**`

Forbidden:

- Moving Photoshop/UXP IO into shared packages.
- Claiming mask/inpaint support beyond the checklist path that is actually exercised.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- Real Photoshop document with multiple layers, at least one pixel layer, and one user-mask layer.
- UXP smoke for Select layer, Read layer, Pick image file, and Read mask.

Stop:

- Stop only if the running Photoshop version does not expose the required layer/imaging APIs and no compatibility fallback can be implemented inside `apps/app/src/host/`.

Report evidence:

- Layer tree count and selected layer type.
- Read layer asset metadata, sanitized.
- File picker result, sanitized.
- Mask read result or unsupported API evidence.

### Slice 5: Generate, Preview, Writeback, And History Smoke

Goal:

- Prove MainPage can submit a job, transition status, render the preview, place the result on canvas, and persist History across panel reload / Photoshop restart.

Allowed:

- `apps/app/src/ui/pages/main-page.tsx`
- `apps/app/src/ui/pages/history-page.tsx`
- `apps/app/src/ui/hooks/**`
- `apps/app/src/app-services/**`
- `apps/app/src/host/**`
- `apps/app/src/shared/image-payload-preflight.ts`
- `apps/app/tests/**`
- `packages/application/src/commands/submit-job.ts`
- `packages/application/src/session/**`
- `packages/application/src/runtime.ts`
- `packages/application/src/**/*.test.ts`
- `packages/providers/src/**` and `packages/providers/tests/**` only for evidenced provider request/transport/parse defects.
- `packages/core-engine/src/**` only for evidenced job lifecycle/store/event defects.

Forbidden:

- Bypassing `AppServices.commands` or `HostBridge` to reach provider/core/Photoshop internals from React.
- Passing unvalidated corrupt image bytes into preview, durable history, or `placeAssetOnCanvas()`.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/application test` if application code changes.
- `pnpm --filter @imagen-ps/providers test` if provider code changes.
- `pnpm --filter @imagen-ps/core-engine test` if core-engine code changes.
- Real UXP Generate smoke with n1n profile, optional layer/file attachment, Place on canvas, History check, panel reload, and Photoshop restart check.

Stop:

- Stop only if a reproducible Photoshop native crash persists after artifact identity, sanitized logs, image payload preflight, provider response validation, and owner-boundary fixes leave no repo-observable failure window.

Report evidence:

- Job status sequence.
- Last app JSONL events before completion or failure.
- Preview asset metadata, sanitized.
- Writeback result and Photoshop process continuity.
- History persistence result.

### Slice 6: Diagnostics, Logs, And Redaction Smoke

Goal:

- Prove UXP diagnostics can read and export recent JSONL logs, with trace/span fields present and secrets/path-like sensitive data redacted.

Allowed:

- `apps/app/src/host/uxp-diagnostics.ts`
- `apps/app/src/host/uxp-log-sink.ts`
- `apps/app/src/ui/**` only if a diagnostics UI entry exists or must be minimally exposed for the checklist.
- `apps/app/tests/**`
- `packages/foundation/src/**`
- `packages/application/src/**` only for logger context wiring defects.

Forbidden:

- Committing raw exported logs.
- Adding raw provider payload logging.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/foundation test` if foundation code changes.
- `pnpm --filter @imagen-ps/application test` if application logger wiring changes.
- Real UXP `readRecentLogRecords` or diagnostics UI check.
- Exported JSONL inspection with secrets and local paths redacted.

Stop:

- Stop only if UXP file-save APIs are unavailable in the target host and no read-only diagnostics path exists.

Report evidence:

- Log record count.
- Example event names only, sanitized.
- `trace_id` / `span_id` presence.
- Redaction result.

### Slice 7: Full Rerun And Closeout

Goal:

- Rerun the complete smoke checklist from a rebuilt bundle and close the Loop with repo gates, host evidence, and sanitized project memory.

Allowed:

- Any allowed file from prior slices for final fixes.
- `docs/dev-memory/_inbox/YYYY-MM-DD-uxp-photoshop-smoke-result.md` for sanitized reusable result notes.
- `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md` for final pass/fail state if the user wants checklist writeback.

Forbidden:

- Marking real host smoke passed from repo-side tests alone.
- Writing secrets, raw logs, local paths, generated artifacts, or raw crash reports to docs.

Validation:

- `git diff --check`
- `pnpm check:policy`
- `pnpm validate`
- Full UXP / Photoshop smoke checklist from `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md`.
- Optional cross-check: `pnpm build` then `IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test` if provider behavior changed or the n1n credential path needs CLI parity evidence.

Stop:

- Stop only if a hard external blocker remains after all allowed automatic fallback/debug paths are exhausted.

Report evidence:

- Final checklist result for every case.
- Commands run.
- Files changed.
- Repo-side validation evidence.
- Manual Photoshop / UXP host evidence.
- Live-provider evidence or explicit external blocker.
- Memory note candidate.

## Validation

Quick:

- `git diff --check`
- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/application test` when application code changes.
- `pnpm --filter @imagen-ps/providers test` when provider code changes.
- `pnpm --filter @imagen-ps/core-engine test` when core-engine code changes.
- `pnpm --filter @imagen-ps/foundation test` when foundation code changes.

Final:

- `pnpm validate`

Manual-only:

- UXP Developer Tool loads `apps/app/dist/manifest.json` into Photoshop.
- Full `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md` passes in the real host.
- Photoshop PID/start time remains stable after Generate, Preview, Place, reload, and restart checks.
- No new relevant Photoshop crash report appears after dangerous actions.
- App JSONL event order supports the observed result without leaking secrets.

Live-provider:

- Primary app smoke: n1n image-endpoint profile in UXP using `IMAGEN_SMOKE_N1N_API_KEY` and `IMAGEN_SMOKE_N1N_BASE_URL=https://llm-api.net`.
- Region fallback: retry with `IMAGEN_SMOKE_N1N_BASE_URL=https://api.n1n.ai` if the primary host evidence indicates region/network failure.
- Optional CLI parity gate: `pnpm build` then `IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test`.

Unsupported as Loop gates:

- `pnpm lint`
- Browser/jsdom screenshots as proof of Photoshop host behavior.
- Fake UXP tests as proof of real Photoshop host IO.

## Decision Packet Triggers

- Photoshop or UXP Developer Tool is not installed, cannot launch, or cannot load any plugin artifact on the machine after prerequisite checks.
- Both `https://llm-api.net` and `https://api.n1n.ai` reject the configured live credential/account after request shape, transport, base URL, and model parsing are verified by repo-side tests and/or local endpoint isolation.
- A required fix would violate package ownership boundaries outside the allowed/conditional scope in this document.
- A provider/API behavior change is not evidenced by repository code, tests, official docs, or approved live smoke.
- A reproducible Photoshop native crash remains after the execution has verified host-loaded artifact identity, rebuilt bundle fingerprint, sanitized logs, image payload preflight, and all repo-observable owner-boundary fixes.

Do not produce a Decision Packet for ordinary checklist failures, UI bugs, UXP CSS incompatibilities, app storage defects, diagnostics/redaction issues, image payload validation gaps, provider transport compatibility issues, or crashes with actionable host evidence. Those are expected Loop work and should be fixed directly inside the allowed scope.

## Completion Report

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Manual Photoshop / UXP evidence:
- Live-provider evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Record if:

- The execution produces durable project knowledge in one of these categories: `workflow`, `bug`, `architecture`, `decision`, or `manual-host-result`.
- A real-host incompatibility is fixed and converted into a repo-side harness.
- A live-provider n1n behavior requires future agents to know a verified base URL, model, response shape, or UXP runtime compatibility detail.

Do not record:

- Raw logs, raw crash reports, provider response payloads, local absolute paths, secrets, generated build output, routine passing test output, or speculative plans.
