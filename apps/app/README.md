# app

`app/` is the Photoshop UXP and Chrome browser app surface. It owns shared React UI, app-local ports, UXP and Chrome runtime shells, host adapters, and thin wiring to `@imagen-ps/application` commands.

## Read First

- `AGENTS.md`: package-local hard rules.
- `../../docs/TESTING.md`: repository validation authority.

## Current Structure

```txt
src/
  shared/        # ports, domain helpers, one UXP-safe React UI
  adapters/uxp/  # Photoshop/UXP IO, storage, secureStorage, diagnostics
  adapters/chrome/ # File API host port and IndexedDB-backed app storage
  simulators/photoshop/ # deterministic browser Photoshop scenarios
  shells/uxp/    # UXP entrypoints, panel runtime, host shell assembly
  shells/chrome/ # browser harness entry
  host/          # compatibility re-exports for older tests/imports
```

## Commands

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
pnpm --filter @imagen-ps/app test
```

`build:uxp` writes `dist/` for UXP Developer Tool. `build:chrome` writes `dist/web/` for browser smoke checks. Default validation remains mock-only and does not prove real Photoshop host behavior or live provider behavior.

### Chrome development server

`pnpm dev` only watch-builds the UXP surface. For the Chrome shell, use the dedicated helper:

```bash
pnpm --filter @imagen-ps/app dev:chrome
```

This will:

1. Run `vite build --config vite.chrome.config.ts --watch` so code changes rebuild automatically.
2. Start a static server on `http://localhost:4173` with **cache disabled**.
3. Automatically open your default browser.
4. Detect and stop any existing process already using port `4173`, so you do not need to kill it manually.

Because the server sends `Cache-Control: no-store`, a normal browser refresh (`F5` / `Cmd+R`) is enough to see the latest build. You do **not** need to restart the server after each code change — Vite rebuilds `dist/web/` and the browser fetches the new files on refresh.

#### Options

```bash
# Use a different port
pnpm --filter @imagen-ps/app dev:chrome -- --port 8080

# Do not open browser automatically
pnpm --filter @imagen-ps/app dev:chrome -- --no-open

# Enable test harness with seed state
pnpm --filter @imagen-ps/app dev:chrome -- --test-harness --seed-profile=mock --seed-history
```

See `tests/chrome-e2e/README.md` for all supported query controls.

### Manual Chrome debugging (legacy)

If you prefer to serve `dist/web` manually:

```bash
pnpm --filter @imagen-ps/app build:chrome
cd dist/web
python3 -m http.server 4173
```

Then open `http://localhost:4173` in Chrome and use `F12` / `Cmd+Option+I` for DevTools.

To preload test state, add query parameters from `tests/chrome-e2e/README.md`:

```text
http://localhost:4173/?testHarness=1&seedProfile=mock&seedHistory=1
```

When enabled, the page exposes `globalThis.__IMAGEN_CHROME_TEST_HARNESS__` for snapshotting and runtime controls.
