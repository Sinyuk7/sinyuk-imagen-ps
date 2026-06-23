# UXP Host Debugging Workflow

- Status: stable workflow memory
- Scope: `apps/app` real Photoshop / UXP debugging
- Replaces:
  - `uxp-fast-debug-playbook.md`
  - `uxp-host-debug-prep.md`
  - `调试建议 1.md`
  - `调试建议 2.md`
  - `docs/dev-memory/memories/architecture/uxp-boundary-crash-containment.md`

## Minimal Context

For UXP host crash/debug work, read only:

- `AGENTS.md`
- `docs/agent/LOOP.md` for loop execution rules
- this file
- `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md` only
  when running the full manual smoke checklist

Do not load the replaced source notes during normal execution. They were
exploration material, not active authority.

## Core Rule

Repo-side tests are necessary but never prove real Photoshop host behavior.
Always distinguish:

- repo proof: `pnpm --filter @imagen-ps/app test`, `pnpm check:policy`,
  `pnpm validate`
- host proof: rebuilt `apps/app/dist/manifest.json` loaded by UXP Developer
  Tools, real Photoshop action executed, PID/crash delta checked, and plugin
  JSONL evidence captured

## Real Host Loop

Use this order for crash/debug work:

1. Build and identify the loaded artifact.

   ```sh
   pnpm --filter @imagen-ps/app build
   test -f apps/app/dist/manifest.json
   shasum -a 256 apps/app/dist/assets/index.js
   ```

2. Capture the host baseline before dangerous actions:

   - Photoshop PID and process start time
   - existing Photoshop `.ips`, `.crash`, and `.spin` reports
   - latest plugin JSONL path under PluginData
   - UXP Developer Tools loaded plugin state

3. Reproduce one boundary at a time:

   - load/reload only
   - read-only CDT/DevTools probes
   - visible navigation
   - input mutation
   - Save/Test/Refresh
   - Photoshop IO such as imaging, picker, `executeAsModal`, and `batchPlay`

4. After each phase, collect:

   - Photoshop PID/crash delta
   - last plugin JSONL events
   - UXP Developer Tools state
   - sanitized summary under `.artifacts/uxp/runs/<runId>/`

5. Patch only after the last trustworthy event identifies a boundary.

## Crash Evidence

A Photoshop native crash is not a JavaScript exception. Console output may be
missing or truncated. Treat the last durable JSONL checkpoint as the primary
app-side evidence, and the `.ips` summary as host-side evidence.

For each crash run, record a sanitized summary with:

- run id
- loaded bundle fingerprint
- Photoshop version
- crash report file name
- exception type and termination reason
- faulting thread name/id
- whether an `Imagen PS - UXP JavaScript Thread` exists
- last plugin JSONL event

Never commit raw `.ips`, raw PluginData JSONL, screenshots, provider payloads,
local absolute paths, or secrets.

## Flight Recorder Requirements

High-risk paths must log sanitized checkpoints before and after host calls.
The important part is the pre-call checkpoint because a native crash may prevent
the post-call checkpoint from flushing.

Priority boundaries:

- profile save: repository get/list/save, data-folder JSON read/write,
  `secureStorage` get/set/delete, provider validation, rollback
- panel lifecycle: `entrypoints.setup`, plugin/panel create/show/hide/destroy,
  React root ownership, fallback mount
- Photoshop IO: `executeAsModal`, `batchPlay`, imaging reads, temp file writes,
  session token creation, picker access, writeback
- UI compatibility: UXP-safe form controls, button click/keyboard/blur paths,
  CSS rules known to affect UXP rendering

Do not use synthetic CDT `input` / `change` dispatch as the primary automation
path after it has triggered UXP internal event errors. Prefer visible
keyboard/mouse behavior or a structured scenario command.

## Control Plane

The desired automation surface is a repo command that creates
`.artifacts/uxp/runs/<runId>/`, runs a bounded scenario, and writes a result
summary. UXP Developer Tools websocket/CDT automation may be used as an
experimental accelerator, but it is not a public stable contract.

Recommended scenario shape:

```text
pnpm uxp:scenario -- list-layers
pnpm uxp:scenario -- settings-save
pnpm uxp:collect -- <runId>
pnpm uxp:triage -- <runId>
```

Default tests must skip or report `host-unavailable` when Photoshop or UXP
Developer Tools is absent. They must not fail CI only because the host is not
installed.

## GUI Role

Computer Use is appropriate for stable front-of-house tasks:

- launch Photoshop and UXP Developer Tools
- load/reload the plugin
- open the panel or debugger
- capture visible state

Do not make GUI clicking the long-term primary business test path. Once a crash
boundary is known, add a structured scenario and a repo-side harness for the
same class of failure.

## Validation

Quick repo checks:

```sh
git diff --check
pnpm check:policy
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build
```

Final repo gate:

```sh
pnpm validate
```

Host gate:

- UXP Developer Tools loads `apps/app/dist/manifest.json`
- the target host scenario is executed in Photoshop
- no unexpected new crash report appears, or the new crash is summarized
- last plugin JSONL event matches the observed result
