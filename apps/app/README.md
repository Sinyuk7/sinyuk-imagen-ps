# app

`app/` is the Photoshop UXP and Chrome browser app surface. It owns shared React UI, app-local ports, UXP and Chrome runtime shells, host adapters, and thin wiring to `@imagen-ps/application` commands.

## Read First

- `STATUS.md`: current implementation state and validation boundary.
- `SPEC.md`: app contract and ownership rules.
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
