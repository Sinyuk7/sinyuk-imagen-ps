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
