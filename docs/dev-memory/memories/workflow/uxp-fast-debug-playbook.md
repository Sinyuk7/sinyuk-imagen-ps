# UXP Fast Debug Playbook

- Date: 2026-06-19
- Scope: `apps/app` real Photoshop / UXP debugging, code fix, and validation.
- Purpose: reduce future UXP investigation time by starting from host reality,
  not source assumptions.

## When To Use

Use this playbook when a real Photoshop UXP issue needs code changes and proof,
especially for:

- Photoshop crash, restart, or host disappearance.
- Panel visual/layout mismatch between screenshots and repo/browser tests.
- UXP Developer Tool reload/watch behavior that seems inconsistent with source.
- Host IO paths such as preview rendering, durable history, file picker,
  `secureStorage`, `localFileSystem`, or Photoshop writeback.

Do not use repo-side tests alone as proof of real host behavior. `pnpm validate`
is necessary, but it is not a Photoshop runtime smoke.

## Fast Path

1. Confirm the host-loaded artifact first.

   Before reading much source or changing code, verify which `apps/app/dist`
   artifact UXP Developer Tool actually loaded or watches. Compare that with
   the active worktree under investigation.

   Useful checks:

   ```sh
   pnpm --filter @imagen-ps/app build
   test -f apps/app/dist/manifest.json
   ls -lt apps/app/dist apps/app/dist/assets
   ```

   For asset-related fixes, add a cheap bundle fingerprint test or direct
   string/byte check against `apps/app/dist/assets/index.js`. A correct source
   patch is not enough if Photoshop is still running an older ignored `dist/`
   from another checkout.

2. Build a host timeline before fixing code.

   Use three independent clocks:

   - Photoshop process PID and start time.
   - Latest Photoshop crash reports under the macOS diagnostic report folder.
   - App JSONL event order from the UXP data-folder log sink.

   The goal is to identify the last trustworthy plugin event before the host
   failed: startup, submit start, provider dispatch, preview mapping,
   history persistence, `placeAssetOnCanvas()`, or reload.

   Do not infer a JavaScript exception just because Photoshop crashed. If the
   JSONL path reaches `command.submit.ok` or `hostbridge.place_asset.ok`, the
   likely failure window may be later native host rendering/decode/draw.

3. Probe the real host with CDT, not screenshots alone.

   Screenshots are good symptom capture, but they do not prove cause. For
   visual or DOM questions, attach to the real UXP target through UXP Developer
   Tool / CDT and measure:

   - selector presence
   - stylesheet content
   - `getComputedStyle()`
   - `getBoundingClientRect()`
   - page text/class state

   Prefer small, read-only probes first. For CSS/layout work, do not click Send
   or Place while diagnosing spacing.

4. Decide the fix from host evidence.

   If selectors and stylesheet rules exist but computed styles or rects are
   wrong in Photoshop, treat it as a UXP compatibility issue instead of adding
   more browser-style CSS.

   For host crashes, identify whether bad bytes or unsupported host APIs can
   cross into Photoshop native code. Add validation at the adapter boundary
   before bytes reach UXP files, session tokens, `batchPlay`, preview `<img>`,
   or durable history.

5. Convert every real-host lesson into a repo-side harness.

   A host smoke proves one run. A harness prevents repeating the same class of
   mistake. Good harnesses include:

   - static compatibility scans for CSS patterns known to fail in UXP
   - bundle fingerprint tests for dangerous embedded assets
   - fake UXP adapter tests for storage, writeback, and log behavior
   - provider transport tests for UXP-incomplete Web API shapes

   The harness should not claim real host success. It should only block known
   bad source or bundle states.

6. Validate in two layers.

   Repo layer:

   ```sh
   git diff --check
   pnpm check:policy
   pnpm validate
   ```

   Host layer:

   - Confirm UXPDT loaded path and rebuilt bundle fingerprint.
   - Load/reload the plugin in Photoshop.
   - Run only the smallest host action needed to prove the fix.
   - Check Photoshop PID/start time after the action.
   - Check that no new Photoshop crash report appeared.
   - Check app JSONL for expected event completion and absence of new boundary
     errors.

## UXPDT / CDT Debug Notes

The recorded setup exposed UXP Developer Tool's local CLI websocket at:

```text
ws://127.0.0.1:14001/socket/cli
```

The useful pattern was:

- connect to the CLI websocket
- wait for `didAddRuntimeClient` entries
- select the Photoshop runtime client (`appId: "PS"`)
- proxy a plugin `debug` action for the active plugin session
- connect to the returned CDT websocket
- call `Runtime.enable`
- evaluate against the `Imagen PS` execution context

In the real UXP context, `window.document` was the most reliable DOM entrypoint
for probes.

Use this only as a debug accelerator. It is not a public app contract, and the
port/protocol may change with UXP Developer Tool versions.

## CSS / Visual Debug Checklist

For each affected page, collect a small table of:

- `.panel` and `.page` rects
- header/control rects and margins
- key container padding/margins
- native control `appearance`
- whether the loaded stylesheet still contains banned browser-only constructs

Only then decide whether the issue is missing app CSS or unsupported UXP CSS.

Known risky patterns for this panel:

- `gap`, `row-gap`, `column-gap`
- CSS grid / `display: grid`
- `place-items`
- adjacent sibling spacing such as `> * + *`
- `font` shorthand
- `margin` shorthand
- inline style escape hatches that bypass the shared UXP-safe stylesheet rules

Prefer explicit class-level margins and longhand properties.

## Crash / Native Boundary Checklist

For crashes after a successful plugin event:

- Verify whether the latest successful JSONL event was submit, preview, durable
  history, writeback, or reload.
- Inspect persisted history/asset refs for stale or corrupt host objects.
- Validate image bytes before preview, persistence, and Photoshop writeback.
- Avoid passing partial browser API objects into UXP host APIs. For example,
  signal-like objects must be checked for listener methods before being passed
  to `fetch` or retry delay code.
- Treat `batchPlay(placeEvent)` success as "Photoshop accepted the command",
  not as proof that later native decode/draw is safe.

## Reporting Template

Use this shape in the final report:

```text
Host-loaded artifact:
- UXPDT loaded/watched: <repo-relative artifact>
- Built fingerprint: <checked condition>

Timeline:
- Photoshop PID/start time:
- Latest Photoshop crash report:
- Last plugin JSONL events:

Code changes:
- <boundary fix>
- <harness added>

Validation:
- Repo: git diff --check, pnpm check:policy, pnpm validate
- Host: load/reload, CDT/DOM measurement or controlled action, PID alive,
  no new crash report

Caveat:
- State clearly which parts are repo-side proof and which parts are real
  Photoshop host proof.
```

## Rules Of Thumb

- Host reality beats source assumptions.
- A green repo gate is not a Photoshop smoke.
- A screenshot shows symptoms; CDT computed style and rects prove layout cause.
- A loaded path mismatch can invalidate an entire debugging session.
- Every real-host incompatibility should become a narrow harness.
- Keep dangerous host actions, such as Send and Place, until after artifact
  identity and boundary checks are confirmed.
