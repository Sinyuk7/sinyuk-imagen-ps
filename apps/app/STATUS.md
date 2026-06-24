# app Status

- Status: dual-runtime app surface implemented repo-side
- Updated: 2026-06-25
- Module boundary: see [SPEC.md](SPEC.md)

## Implemented

### Shared App Surface

- `src/shared/ports`: `CommandsPort`, `AppServices`, `HostBridge`, runtime capabilities, host result/error types, and diagnostics port.
- `src/shared/domain`: host image wrapper, preview/payload refs, locale, plugin app model, and view-model mappers.
- `src/shared/ui`: one UXP-safe React UI used by both runtimes.
- Shared UI no longer imports UXP log sinks, adapters, shells, or host modules directly.

### UXP Runtime

- `src/shells/uxp`: UXP entrypoint registration, panel runtime, reload cleanup, startup error rendering, and host smoke handle exposure.
- `src/adapters/uxp`: UXP module resolution, Photoshop host bridge, data-folder profile/history/asset persistence, secureStorage, and diagnostics/log sink.
- `src/host`: compatibility re-exports for existing import paths.
- `build:uxp` writes `dist/` with UXP classic script HTML transform and manifest copy.

### Chrome Runtime

- `src/shells/chrome`: browser harness HTML/entry.
- `src/adapters/chrome`: File API host port and IndexedDB-style storage adapter boundary.
- `src/simulators/photoshop`: deterministic Photoshop-like scenarios including seeded document, empty/no document, mask-capable layer, host busy, cancelled picker, and place failure paths.
- `build:chrome` writes `dist/web/`.
- Chrome provider command path uses the same `@imagen-ps/application` commands as UXP for mock provider validation.

### Provider Compatibility Matrix

| Family | Default validation | Browser direct status | Notes |
|---|---|---|---|
| `mock` | repo-side default | supported | No network; deterministic command path. |
| `image-endpoint` | mock/fetch-intercept only | conditional | Requires endpoint CORS and browser credential acceptance. |
| `chat-image` | mock/fetch-intercept only | conditional | Requires endpoint CORS and browser credential acceptance. |

Default validation does not use network, credentials, paid APIs, Photoshop, or UXP Developer Tool.

## Validation State

Repo-side app validation currently includes:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app build:uxp`
- `pnpm --filter @imagen-ps/app build:chrome`
- Chrome headless smoke of `dist/web/src/shells/chrome/index.html`

## Still Manual-Only

- Load `apps/app/dist/manifest.json` in UXP Developer Tool.
- Photoshop panel opens, reloads, closes, and reopens.
- Settings profile save/test/model refresh in real UXP storage and secureStorage.
- Photoshop layer list/read, mask path, file picker, place asset, cancelled operations, host busy behavior, and diagnostics/crash delta.
- Live provider calls from Chrome or UXP with real credentials.

If these are not run, status is `implementation complete, host validation pending`, not Product Completion.

## Invariants

- Shared UI uses capabilities/result state, not runtime kind checks.
- Shared UI cannot import adapters, shells, host modules, UXP, Photoshop, or CLI.
- UXP and Chrome adapters implement shared ports without changing provider/application/core semantics.
- Host image wrappers preserve downstream `Asset` for application/provider commands.
