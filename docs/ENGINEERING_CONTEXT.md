# Engineering Context

This file stores repository engineering context that should stay out of root `AGENTS.md`.

## Project Overview

`sinyuk-imagen-ps` is a Photoshop image-generation monorepo with one surface app and shared runtime/application packages.

## Module Roles

| Module | Role | Owns | Must Not Own |
|---|---|---|---|
| `apps/app` | Photoshop UXP + Chrome app surface | shared React UI, app ports, UXP shell/adapters, Chrome shell/adapters, Photoshop simulator, UI-local bindings | runtime internals, provider transport semantics |
| `packages/application` | application/session layer | session controller, command facade, request builders, runtime assembly, profile/model coordination | React, DOM, Photoshop, UXP, Node fs/path/os |
| `packages/core-engine` | job execution kernel | job facts, lifecycle, store, events, runner, dispatch boundary | profile/model selection, host persistence, provider raw transport |
| `packages/providers` | provider adapter layer | config/request validation, transport, normalization, error mapping | app/session state, job lifecycle, host IO |
| `packages/foundation` | lowest-level shared utilities | log record model, context/span helpers, redaction, sink interfaces | React, DOM, Node `fs/path/os`, UXP, Photoshop, provider transport, runtime assembly, workspace reverse dependencies |

## Dependency Direction

```text
surface apps -> application/session -> core-engine + providers
```

## Current State

- Active loop authority is declared only in root `AGENTS.md`. No active loop is currently declared.
- `packages/application` is the shared application/session package.
- `apps/app` and `packages/providers` are stable boundaries unless a loop slice explicitly allows changes.
- `apps/app` is a dual-runtime surface: one shared UXP-safe React UI consumed by a Photoshop UXP shell and a Chrome browser shell. See `apps/app/AGENTS.md` and `apps/app/README.md`.

## Logging Contract

`@imagen-ps/foundation` owns the host-agnostic log record model, context/span helpers, redaction, and sink interfaces. Other packages and surfaces depend on foundation; foundation depends on no workspace package.

- Format: JSONL / NDJSON, one stable JSON object per line.
- Trace fields: top-level commands and host entries create a trace; child spans preserve parent/child linkage.
- Redaction: secrets, authorization values, raw provider payload dumps, absolute local paths, and environment dumps are removed or sanitized before logging.
- Sink boundary: shared logging constructs records and applies redaction; host adapters own storage (UXP data-folder sink, Chrome IndexedDB-style sink).
- Failure mode: logging is fail-open and must not break product behavior.
- No raw provider request/response logging and no remote telemetry pipeline.

## Current Limitations

- Default validation is mock-only and reproducible. It does not prove real Photoshop / UXP host behavior, real provider transport, CORS behavior, or live credential flows.
- Chrome real-provider execution is conditional on browser-compatible transport and provider CORS policy; only the `mock` family is repo-side default.
- UXP host behavior (panel load/reload, layer/mask read, file picker, `placeEvent`, persistence across Photoshop restart) remains manual-only evidence.
- `pnpm lint` is not a supported gate; workspace packages do not define package-level lint scripts.

## Open Questions

- Host storage paths: UXP data-folder and Chrome storage defaults are not yet unified across platforms, and Linux / Windows defaults are not explicitly specified (current defaults are macOS-only).

## Code Placement Rules

| Code | Place |
|---|---|
| React hooks and components | `apps/app/src/shared/ui/` |
| App ports and host image wrappers | `apps/app/src/shared/ports/`, `apps/app/src/shared/domain/` |
| Photoshop / UXP host IO | `apps/app/src/adapters/uxp/`, `apps/app/src/shells/uxp/` |
| Chrome host IO and simulator | `apps/app/src/adapters/chrome/`, `apps/app/src/simulators/photoshop/` |
| Session state, commands, profile/model coordination | `packages/application` |
| Request builders | `packages/application/src/requests/` |
| Job facts, events, runner, dispatch contracts | `packages/core-engine` |
| Provider validation, transport, normalization | `packages/providers` |
