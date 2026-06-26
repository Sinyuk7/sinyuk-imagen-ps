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

### Manual Chrome debugging

`pnpm dev` only watch-builds the UXP surface. To open the Chrome shell directly in a browser:

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
