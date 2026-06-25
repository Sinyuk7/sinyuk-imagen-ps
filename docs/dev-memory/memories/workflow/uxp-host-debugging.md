# UXP host debugging workflow

- Scope: `apps/app` real Photoshop / UXP debugging
- Category: manual-only — not part of default `pnpm validate` / CI

## Core rule

Repo-side tests are necessary but never prove real Photoshop host behavior.
Always distinguish:

- repo proof: `pnpm --filter @imagen-ps/app test`, `pnpm check:policy`,
  `pnpm validate`
- host proof: rebuilt `apps/app/dist/manifest.json` loaded by UXP Developer
  Tools, a real Photoshop action executed, PID/crash delta checked, and plugin
  JSONL evidence captured

## Real host loop

1. Build and identify the loaded artifact:

   ```sh
   pnpm --filter @imagen-ps/app build
   test -f apps/app/dist/manifest.json
   shasum -a 256 apps/app/dist/assets/index.js
   ```

2. Capture the host baseline before dangerous actions: Photoshop PID and start
   time, existing `.ips` / `.crash` / `.spin` reports, latest plugin JSONL path
   under PluginData, UXP Developer Tools loaded plugin state.
3. Reproduce one boundary at a time: load/reload only → read-only CDT/DevTools
   probes → visible navigation → input mutation → Save/Test/Refresh → Photoshop
   IO (`executeAsModal`, `batchPlay`, imaging, picker).
4. After each phase collect: Photoshop PID/crash delta, last plugin JSONL
   events, UXP Developer Tools state, sanitized summary under
   `.artifacts/uxp/runs/<runId>/`.
5. Patch only after the last trustworthy event identifies a boundary.

## Crash evidence

A Photoshop native crash is not a JavaScript exception; console output may be
missing or truncated. Treat the last durable JSONL checkpoint as primary
app-side evidence and the `.ips` summary as host-side evidence. For each crash
run, record a sanitized summary: run id, loaded bundle fingerprint, Photoshop
version, crash report file name, exception type / termination reason, faulting
thread, whether an `Imagen PS - UXP JavaScript Thread` exists, and last plugin
JSONL event. Never commit raw `.ips`, raw PluginData JSONL, screenshots,
provider payloads, local absolute paths, or secrets.

## Flight recorder

High-risk paths must log a sanitized checkpoint before and after host calls.
The pre-call checkpoint matters most because a native crash may prevent the
post-call checkpoint from flushing. Priority boundaries: profile save, panel
lifecycle, Photoshop IO, and UXP UI compatibility.

Do not use synthetic CDT `input` / `change` dispatch as the primary automation
path — it has triggered UXP internal event errors and native crashes. Prefer
visible keyboard/mouse behavior or a structured scenario command.

## Validation

Quick repo checks:

```sh
git diff --check
pnpm check:policy
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build
```

Final repo gate: `pnpm validate`.

Host gate: UXP Developer Tools loads `apps/app/dist/manifest.json`, the target
scenario executes in Photoshop, no unexpected new crash report appears (or the
new crash is summarized), and the last plugin JSONL event matches the observed
result. See also `uxp-photoshop-smoke-checklist.md`.
