# UXP Profile Smoke Crash Evidence

- Date: 2026-06-20
- Scope: `apps/app` Photoshop UXP panel profile-smoke path.

## Symptom

During the real Photoshop/UXP smoke loop, the panel could load and render from
`apps/app/dist/manifest.json`, but attempts to drive the Add Provider flow
through UXP Developer Tools CDT repeatedly ended with Photoshop process death.

Observed host versions:

- Photoshop: `27.7.0`
- UXP runtime: `uxp-9.3.0-uxp`
- Dist bundle verified before host load: `apps/app/dist/assets/index.js`

Crash reports created during the run:

- `Adobe Photoshop 2026-2026-06-20-120419.ips`
- `Adobe Photoshop 2026-2026-06-20-121049.ips`
- `Adobe Photoshop 2026-2026-06-20-121323.ips`
- `Adobe Photoshop 2026-2026-06-20-123138.ips`
- `Adobe Photoshop 2026-2026-06-20-123542.ips`

Each inspected report showed `EXC_BAD_ACCESS` / `SIGSEGV` on Photoshop's main
thread in native AppKit/NSView drawing. The plugin JSONL log showed normal
startup/list-model/list-profile events before the crash, but no provider
profile save/test command for the smoke profile, so the crash happened before
provider transport was reached.

## Fixes Applied

- `SettingsAddPage` now reuses one draft `profileId` across Test and Save.
  Previously each call generated a new id, so the intended "Test then Save"
  profile workflow could create separate persisted profiles.
- The UXP panel stylesheet no longer imports remote fonts and adds a final
  host-stability override disabling animations, transforms, shadows, and
  filters in the panel. A simplified bundle loaded and stayed alive for a
  10-second host check before CDT-driven profile mutation was attempted.
- `index.tsx` exposes a localStorage-gated `__IMAGEN_PS_HOST_SMOKE__` handle
  for real host smoke. The handle is absent by default and only appears when
  `localStorage.imagenPsHostSmoke` is `1`.

## 2026-06-20 Service Smoke Result

After switching from CDT DOM mutation to the gated service handle, the profile
smoke no longer crashed Photoshop. The direct service path proved:

- `saveProviderProfile` persisted the n1n image-endpoint smoke profile.
- The persisted profile had `secretRefs.apiKey`.
- The persisted profile config did not contain raw `apiKey`.
- The smoke profile could be read back from the UXP data folder and was cleaned
  up afterward.

Initial live provider model discovery did not pass. Both configured hosts were
blocked by UXP before provider parsing:

- primary: `/v1/models` returned `Permission denied ... Manifest entry not
  found`
- fallback: `https://api.n1n.ai/v1/models` returned `Permission denied ... Manifest
  entry not found`

Root cause: manifest v5 required the development all-domain network permission
as `requiredPermissions.network.domains: "all"`. The previous array form
`["all"]` loaded, but did not grant network access in the real UXP runtime.

After changing the manifest to the string form and rebuilding/reloading:

- n1n profile save/readback still used `secretRefs.apiKey` and did not persist
  raw `apiKey` in profile config.
- primary n1n model discovery reached the live endpoint and returned 11 models.
- live `provider-generate` completed with one inline PNG asset.
- `placeAssetOnCanvas` placed the generated image into Photoshop as a new smart
  object layer.
- History listed the completed `provider-generate` job with one output ref.
- recent app JSONL records contained trace/span ids and the checked sample did
  not contain API-key literals, bearer tokens, or local user paths.
- temporary UXP smoke provider profiles were cleaned up after the checks.

Additional host fix: `readLayerAsAsset` and `readLayerMaskAsAsset` now execute
Photoshop imaging calls inside `executeAsModal()`. The real host had rejected
the previous direct `imaging.getPixels()` path with the Photoshop modal-scope
error. After the fix, reading the Background pixel layer returned a JPEG asset
with inline data.

## Remaining 2026-06-20 Host Boundary

A later host-debug continuation produced a new Photoshop crash report:

- `Adobe Photoshop 2026-2026-06-20-150951.ips`

The crashed process was the old Photoshop PID that started at 12:36:32 and
exited at 15:09:51. The inspected report showed `EXC_BAD_ACCESS` / `SIGSEGV`;
the report's triggered thread was named `Imagen PS - UXP JavaScript Thread`.
The app JSONL records before and after the crash showed normal startup,
profile/model, submit, transport, place, and list-layer events, with no raw
secret-bearing payloads recorded.

Photoshop relaunched as a new process after the crash. Because a real host
crash still occurred during the smoke continuation, do not mark the full
Photoshop/UXP smoke checklist complete. The unproven checklist items are:

- visible-panel Add Provider path after the host-safe service path;
- UXP file picker selection through the real host UI;
- user-mask read on a document with a verified user mask;
- panel reload / Photoshop restart persistence after the post-generate crash.

## Current Host Boundary

The simplified bundle reduced immediate load instability, and the host-safe
service path proved profile/model/generate/place/history behavior. Do not claim
the full checklist is passing until the remaining UI/file-picker/mask/restart
paths are exercised without a new crash report.

Do not commit raw crash reports, raw UXP logs, local filesystem paths, or
provider secrets as evidence. Keep only sanitized event names, timestamps, host
versions, and dist fingerprints in repo notes.

## 2026-06-20 Continuation

Further real-host smoke used the rebuilt panel bundle and the same Photoshop
`27.7.0` / UXP `uxp-9.3.0-uxp` host.

Repo-side fixes added during the continuation:

- `readRecentLogRecords` no longer returns the UXP log file `nativePath` and
  now returns redacted records, matching the diagnostics evidence boundary.
- `readLayerAsAsset` now carries Photoshop layer bounds through `LayerInfo`,
  passes non-empty bounds as `sourceBounds`, and rejects empty pixel layers with
  a clear plugin-side error before calling `imaging.getPixels()`.
- `SettingsPage` no longer nests tooltip markup inside native header buttons;
  the header now uses the same outer `Tip` wrapper pattern as the rest of the
  panel. This removed a reproducible crash that occurred when only navigating
  from Main to Settings.

Real-host evidence after these fixes:

- `diagnosticsSmoke` returned recent JSONL summaries with trace/span ids; the
  checked sample did not contain API-key literals, bearer tokens, local user
  paths, or `nativePath`.
- Host IO smoke created a controlled Photoshop document, created a user mask,
  read a non-empty pixel layer as JPEG data, and read the created user mask as
  JPEG data through the gated smoke handle.
- Main -> Settings navigation, Add Provider page open, Image Endpoint form
  open, and form field population all completed without creating a new crash
  report after the tooltip fix.

Remaining blocker:

- Repeated full CDT-driven visible Add Provider automation still destabilized
  the host. Later crash reports created during this phase were:
  - `Adobe Photoshop 2026-2026-06-20-153155.ips`
  - `Adobe Photoshop 2026-2026-06-20-153505.ips`
  - `Adobe Photoshop 2026-2026-06-20-153954.ips`
  - `Adobe Photoshop 2026-2026-06-20-154226.ips`
- Inspected reports showed the same `EXC_BAD_ACCESS` / `SIGSEGV` shape on
  Photoshop's main thread during native drawing or after repeated UXPDT
  `Plugin.load` / CDT automation. The app JSONL tail around the crashes showed
  normal startup, list-layer, profile, and model events, without a plugin-side
  JavaScript failure.

The active Loop remains blocked, not complete. The repo now has targeted fixes
and harness coverage for the app-owned issues found, but the full manual
checklist still lacks a stable visible Test/Save UI run, real UXP file picker
selection, and restart/reload persistence proof after the repeated host crash.

## 2026-06-21 Debugging Strategy Correction

Do not interpret Photoshop UXP as a normal Chrome subset. Adobe documents UXP as
offering many, but not all, web-browser capabilities, with supported HTML/CSS
references and Photoshop-specific APIs. The remaining blocker is a real
Photoshop / UXP host problem and should be debugged in the host, not moved to a
browser acceptance layer.

For the remaining blocker, split the UXPDT/CDT path into narrow host probes:
load/reload without DOM interaction, read-only CDT probes, visible navigation,
input mutation, Test, Save, Refresh Models, picker, and Photoshop IO. Record
Photoshop PID/start time, crash report name/timestamp, UXP Developer Tool
action, loaded artifact identity, and the last sanitized app JSONL event for
each crash or timeout.

## 2026-06-21 Narrowed Crash Trigger

The 2026-06-21 continuation narrowed the crash surface further:

- `loadOnly 3`: repeated `Plugin.load` followed by explicit `Plugin.unload`
  passed without a new crash report.
- `readOnlyCdt 3`: CDT attach plus read-only DOM text/button/rect inspection
  passed without a new crash report.
- `navigationOnly 3`: visible navigation through Settings, Add Provider, Image
  Endpoint form open passed without a new crash report.
- `inputOnly`: setting UXP input values through CDT and then calling
  `dispatchEvent()` for `input` / `change` failed inside UXP's internal
  `dispatchNativeEvent` path with `Cannot read properties of undefined (reading
  'detail')`. Photoshop later exited with a new native crash report:
  `Adobe Photoshop 2026-2026-06-21-131941.ips`.

The new crash report showed:

- Photoshop `27.7.0`.
- `EXC_BAD_ACCESS` / `SIGSEGV`.
- Faulting thread `0`, Photoshop main thread.
- Top frames in `Adobe Photoshop 2026` and `dynamic-torqnative`.

The app JSONL tail around the crash showed only normal startup,
profile/model-list, and layer-list events. No provider network, Test, Save,
file-picker, Photoshop imaging, or writeback command had been reached. Treat
CDT-driven synthetic input/change event dispatch as a high-risk host trigger,
not as proof of user-visible UI behavior.

## Next Sprint Direction

Do not keep expanding ad hoc UXPDT/CDT automation. The next useful step is a
complete Photoshop / UXP stabilization sprint. The sprint goal is broader than
fixing one native crash or producing a comparison report: learn from the local
reference UXP project, explain why this app is fragile in the Photoshop / UXP
host, refactor the full UXP boundary where needed, and finish with real
validation evidence.

Keep the comparison strictly about Photoshop / UXP engineering. Do not copy
product features, UI style, provider behavior, branding, or application
workflow. Use the reference project as one input for host-runtime design:

- UXP entrypoint lifecycle, panel startup, and React root ownership.
- Manifest shape, panel registration, permissions, and UXP Developer Tool
  load/reload assumptions.
- Input/form implementation in UXP, especially whether the reference project
  relies on native UXP/Spectrum controls, browser-like inputs, or avoids
  synthetic DOM event dispatch.
- CSS compatibility strategy: unsupported browser-style effects, nested native
  controls, transitions, transforms, shadows, filters, layout primitives, and
  sizing constraints.
- Host bridge structure for Photoshop APIs, modal execution, batchPlay,
  imaging, file picker, storage, secure storage, logging, and cleanup.
- Runtime isolation: what code runs at module top level versus inside explicit
  host lifecycle functions, and how long-lived resources are disposed.
- Testing/debugging workflow: what can be checked repo-side, what must be
  checked in Photoshop, and how host reload/debug loops are kept stable.

The executing agent should not stop at analysis unless it hits a documented
boundary blocker. It should produce an evidence-backed migration plan, implement
bounded app-side refactors, add repo-side harness coverage for each fixed bug
class, rebuild, reload, and verify with the existing host layers: load-only,
read-only CDT, visible navigation, and only then real visible input/Test/Save
through user-like keyboard/mouse input.
