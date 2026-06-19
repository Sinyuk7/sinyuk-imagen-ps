# UXP Submit Preview Crash

- Date: 2026-06-19
- Scope: `apps/app` preview/writeback mapping and `packages/providers`
  cancellation/mock asset paths.

## Symptom

Clicking Send from the Photoshop UXP panel could crash Photoshop after the job
completed. The crash report
`~/Library/Logs/DiagnosticReports/Adobe Photoshop 2026-2026-06-19-184551.ips`
showed `EXC_BAD_ACCESS` / `SIGSEGV` on Photoshop's main thread during AppKit
view drawing. The plugin JSONL log for the same window showed mock jobs
reaching `command.submit.ok` and `dispatch.provider.ok`, which points away from
an ordinary JavaScript exception during dispatch and toward host rendering after
the UI updates with the generated preview.

An earlier real image-endpoint job in `job-history.json` also recorded
`Cannot read properties of undefined (reading 'addEventListener')`, matching
the provider transport's previous assumption that every signal-like value had a
browser-complete `AbortSignal` listener API.

## Cause

The app preview mapper converted `Uint8Array` assets to `Blob` objects and then
used `URL.createObjectURL(blob)` for the `<img>` source. In Photoshop UXP this
path can reach host-native drawing code immediately after a successful submit.
Using a `data:` URL keeps the image preview on the already-supported inline data
path and avoids object URL lifecycle/rendering behavior inside the host.

The provider transport also directly used `AbortSignal.timeout`,
`AbortSignal.any`, and `signal.addEventListener` without checking whether the
current UXP runtime provided those APIs.

During a later host run, the plugin log recorded a mock submit at
`2026-06-19T11:25:35Z`, followed by `hostbridge.place_asset.ok` at
`2026-06-19T11:25:42Z` for `mock-image-1.png`. Photoshop then disappeared
without a new `Adobe Photoshop 2026-*.ips` report in
`~/Library/Logs/DiagnosticReports`. The mock PNG was structurally unsafe: its
header was recognizable as PNG, but Pillow rejected it as truncated and its
`IDAT` chunk CRC did not match. This can make `batchPlay(placeEvent)` return
success while Photoshop later crashes during native decode/draw.

## Fix Pattern

- Convert `Uint8Array` preview assets to `data:<mime>;base64,...` in
  `apps/app/src/app-services/mappers.ts`.
- Do not use `Blob` or `URL.createObjectURL` for in-panel preview URLs.
- Mock provider assets must be real, structurally valid images, not only
  header-looking byte strings.
- Before `placeAssetOnCanvas()` calls Photoshop `placeEvent`, validate obvious
  image container corruption so bad provider payloads fail inside the plugin
  instead of reaching Photoshop native drawing code.
- Guard abort listener use through `canListenToAbort(signal)` before passing
  signal objects to fetch or retry delay code.
- Treat repo-side app/provider tests as crash-risk reduction only; a real
  Photoshop send smoke is still required before claiming the host crash is
  fixed.

## Verification

Repo-side checks:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/providers test
pnpm validate
```

Coverage added:

- `apps/app/tests/mappers.test.ts` asserts `Uint8Array` image assets become
  base64 data URLs.
- `packages/providers/tests/http-logging.test.ts` asserts signal-like values
  without listener methods are not passed to `fetch`.
- `packages/providers/tests/retry.test.ts` asserts retry backoff tolerates
  signal-like values without listener methods.
- `packages/providers/tests/mock-provider.test.ts` asserts the mock provider
  tolerates signal-like values without listener methods and emits a PNG with
  valid chunk structure/CRC.
- `apps/app/src/host/photoshop-host-bridge.test.ts` asserts legacy corrupted
  mock PNG payloads are rejected before temporary-file write, session token
  creation, or `batchPlay(placeEvent)`.

## 2026-06-19 Host Smoke

After rebuilding and loading the plugin through UXP Developer Tools in Watching
state, the plugin JSONL log recorded a new mock submit sequence at
`2026-06-19T11:03:06Z`:

- `command.submit.start`
- `dispatch.provider.ok`
- `runtime.job.ok`
- `command.submit.ok`

The Photoshop process remained alive afterward, and no new
`Adobe Photoshop 2026-*.ips` crash report appeared in
`~/Library/Logs/DiagnosticReports` within the checked window.

This is host-log evidence that the submit path completed after the preview URL
change, but it is not a screenshot-level verification of the plugin panel. The
Photoshop UI was showing the Home screen during the later inspection, and the
plugin menu action did not visibly surface the panel window in the captured
state.

## 2026-06-19 Writeback Crash Follow-up

At 19:25 local time, another run completed the mock provider submit and then
called `placeAssetOnCanvas()`:

- `session.command.submit.start` at `2026-06-19T11:25:35.222Z`
- `command.submit.ok` at `2026-06-19T11:25:35.240Z`
- `hostbridge.place_asset.start` at `2026-06-19T11:25:42.672Z`
- `hostbridge.place_asset.ok` at `2026-06-19T11:25:42.677Z`

No plugin-side JS exception appeared after that, and no newer Photoshop `.ips`
file was created; the latest crash report remained the 18:45 main-thread
AppKit/NSView draw crash. The best-supported explanation is therefore host
native image decode/draw after `placeEvent`, triggered by the old mock PNG
payload.

Fix added:

- Replaced the mock provider placeholder with a valid 1x1 transparent PNG.
- Added HostBridge preflight for PNG chunk structure/CRC plus basic JPEG/WEBP
  signatures before `placeEvent`.
- Shared the same image payload preflight with the UXP durable asset store so
  old or future corrupt image bytes cannot be persisted as `hostObject`
  outputs and later re-enter preview/writeback paths.
- Added tests to ensure the old corrupted mock PNG cannot reach Photoshop
  writeback.

## 2026-06-19 Reload Crash Follow-up

At 20:04 local time, Photoshop process `81895` died after a UXP Developer Tools
reload attempt. The plugin JSONL and Adobe UXP log did not record a new
`command.submit.start` after the 19:57 startup, so this instance was not
evidence of a fresh submit reaching provider dispatch.

The macOS unified log recorded WebKit layer suspension/volatility messages just
before process death and then `ReportCrash` creating a type 309 report path for
`Adobe Photoshop 2026-2026-06-19-200447.ips`; the file was not present in
`~/Library/Logs/DiagnosticReports` when queried afterward. Because the durable
job history still referenced multiple old 67-byte corrupted `uxp-asset-*.png`
files, the conservative fix is to reject corrupt image bytes at both durable
asset persistence and Photoshop writeback boundaries. This prevents stale
history assets from surviving reloads and later reaching host-native image
decode/draw.

## 2026-06-19 Host-Loaded Bundle Mismatch

At 20:29 local time, Photoshop restarted again after a Send click. The current
Photoshop process showed a fresh start time of `Fri Jun 19 20:29:09 2026`.
The plugin JSONL log immediately before that restart recorded a successful mock
submit:

- `session.command.submit.start` at `2026-06-19T12:29:05.270Z`
- `dispatch.provider.ok` / `runtime.job.ok` at `2026-06-19T12:29:05.287Z`
- `command.submit.ok` / `session.command.submit.ok` by
  `2026-06-19T12:29:05.291Z`

There was no matching `hostbridge.place_asset.start` for that 20:29 run, so the
best-supported crash window is after the successful submit result and before
Photoshop writeback. The durable asset written for the run was still the old
67-byte corrupted mock PNG:

```text
PluginData/uxp-asset-1781872145288-zg3yxz3p.png
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==
```

The reason this could still happen after the source fix was a host-loaded bundle
mismatch. UXP Developer Tool was watching the main checkout's built app output:

```text
apps/app/dist
```

while the active Codex worktree under `.codex/worktrees/6c4c/...` already built
the fixed bundle containing the valid 70-byte PNG:

```text
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==
```

The host-loaded checkout's ignored `dist/` still contained the old 67-byte byte
array. For immediate host safety, the fixed `apps/app/dist/` output was synced
to the UXPDT-watched checkout and the bundle fingerprint was verified afterward:
old 67-byte byte array absent, valid 70-byte byte array present.

Host validation rule:

- Before clicking Send or Place in a real UXP smoke, verify the UXP Developer
  Tool loaded path and the built `dist/assets/index.js` fingerprint, not only
  the current source worktree.
- Do not use a successful local source build as evidence that Photoshop is
  running that build.
