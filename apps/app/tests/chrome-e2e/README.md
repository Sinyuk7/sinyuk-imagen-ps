# Chrome E2E Harness

This opt-in harness builds `dist/web/`, serves it from a local static server,
and drives the normal Chrome shell with Playwright Chromium at one fixed
viewport: `390x720`, `deviceScaleFactor=1`.

Run a focused subset:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep smoke
```

Run every implemented scenario:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Artifacts are written under ignored run folders:

```text
apps/app/tests/chrome-e2e/screenshots/<run-id>/
  failures/
  report.json
  README.md
```

Passing screenshots are discarded by default. Set `KEEP_SCREENSHOTS=1` to keep
all implemented scenario checkpoints for local review. The report records the
scenario id, viewport, URL, retained screenshot path, DOM assertions, console
error count, and pass/fail status. Do not commit generated screenshots,
reports, traces, uploaded image bytes, or local absolute paths.

## Test Harness Seed API

Chrome-only seed state is enabled with `?testHarness=1`. The normal Chrome
shell still renders the shared `AppShell`; the query only swaps deterministic
browser adapters and preloads test state.

Supported query controls:

- `storage=memory|indexed-db`: use isolated in-memory state for most specs, or
  a real IndexedDB backend for persistence smoke.
- `db=<name>`: optional IndexedDB database name for isolated persistence runs.
- `resetStorage=1`: clear the selected IndexedDB database before applying seed
  state. Memory storage is created fresh for each page context.
- `seedProfile=mock`: seed `profileId=mock-profile`, display name
  `Mock Profile`, default model `mock-image-v1`, and secret ref backed by the
  non-secret test value `mock-key`.
- `seedHistory=1`: seed completed, failed, and running history records.
- `scenario=<id>`: select a deterministic Photoshop simulator scenario.
- `filePicker=image|cancel`: return a generated PNG file or simulate cancel.
- `mockFailure=always|none`: preload the mock provider failure mode.

When enabled, the page exposes `globalThis.__IMAGEN_CHROME_TEST_HARNESS__` for
scenario-local controls: `resetStorage`, `seedMockProfile`, `seedHistory`,
`setFilePickerMode`, `setMockFailureMode`, `setScenario`, and `snapshot`.
