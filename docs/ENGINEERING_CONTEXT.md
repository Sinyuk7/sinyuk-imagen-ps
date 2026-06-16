# Engineering Context

This file holds repo context that should stay out of `AGENTS.md`.

## Project Overview

`sinyuk-imagen-ps` is a Photoshop image-generation monorepo with two surface apps and shared runtime/application packages.

## Module Roles

| Module | Role | Owns | Must Not Own |
|---|---|---|---|
| `apps/app` | Photoshop / UXP surface | React UI, UXP shell, host bridge, UI-local bindings | runtime internals, provider transport, CLI parser |
| `apps/cli` | Node CLI surface | commander parsing, stdout/stderr, Node adapters | UI, Photoshop/UXP IO, runtime internals |
| `packages/application` | application/session layer | session controller, command facade, request builders, runtime assembly, profile/model coordination | React, DOM, Photoshop, UXP, Node fs/path/os |
| `packages/core-engine` | job execution kernel | job facts, lifecycle, store, events, runner, dispatch boundary | profile/model selection, host persistence, provider raw transport |
| `packages/providers` | provider adapter layer | config/request validation, transport, normalization, error mapping | app/session state, job lifecycle, host IO |

## Dependency Direction

```text
surface apps -> application/session -> core-engine + providers
```

## Active Refactor

- active loop 权威入口只在根 `AGENTS.md` 声明。
- application/session loop 已完成。
- `packages/application` is the shared application/session package.
- `apps/app`, `apps/cli`, and `packages/providers` are stable boundaries unless a loop slice explicitly allows changes.

## Code Placement Rules

| Code | Place |
|---|---|
| React hooks and components | `apps/app` |
| Photoshop / UXP host IO | `apps/app/src/host/` |
| CLI parser, stdout/stderr, Node adapters | `apps/cli` |
| Session state, commands, profile/model coordination | `packages/application` |
| Request builders | `packages/application/src/requests/` |
| Job facts, events, runner, dispatch contracts | `packages/core-engine` |
| Provider validation, transport, normalization | `packages/providers` |
