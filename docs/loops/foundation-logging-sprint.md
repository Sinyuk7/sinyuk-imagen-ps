# Foundation Logging Sprint

Status: completed
Authority: historical Loop record; not active unless root `AGENTS.md` or the
current user turn explicitly reauthorizes it.
Owner: `packages/foundation`
Created: 2026-06-16
Completed: 2026-06-17
Superseded by: No follow-up
Context docs:

- `AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- package `AGENTS.md` files

## Result

This sprint introduced `@imagen-ps/foundation` as the host-agnostic home for
shared low-level utilities, starting with structured logging.

The logging contract is now shared by CLI, app, application, core-engine, and
providers through host-provided sinks and adapters. This document is a completed
record, not an executable sprint plan.

## Decisions Kept

- Package name: `@imagen-ps/foundation`.
- Scope: pure shared, host-agnostic utilities with no React, DOM, Node
  `fs/path/os`, UXP, Photoshop, provider transport, or runtime assembly
  ownership.
- Dependency direction: other packages and surfaces may depend on foundation;
  foundation does not depend on workspace packages.
- Log format: JSONL / NDJSON, one stable JSON object per line.
- Trace fields: top-level commands and host entries create a trace; child spans
  preserve parent/child linkage.
- Redaction: secrets, authorization values, raw provider payload dumps,
  absolute local paths, and environment dumps are removed or sanitized before
  logging.
- Sink boundary: shared logging constructs records and applies redaction; host
  adapters own storage.
- Failure mode: logging is fail-open and must not break product behavior.

## Ownership Boundaries

- `packages/foundation`: record model, context/span helpers, redaction, and sink
  interfaces.
- `apps/cli`: Node file sink, CLI log directory behavior, and command/session
  trace entry.
- `apps/app`: UXP data-folder sink and app/host entry logging.
- `packages/application`: command/session logging around runtime assembly and
  profile/model coordination.
- `packages/core-engine`: job lifecycle, runner, dispatch, retry, and store
  event logging.
- `packages/providers`: diagnostics and HTTP transport logging with sanitized
  request/response metadata.

## Non-Goals Preserved

- No OpenTelemetry SDK dependency was required for this sprint.
- No centralized remote telemetry or analytics pipeline.
- No raw provider request/response logging.
- No host storage implementation inside `packages/foundation`.
- No claims that app fake tests prove real Photoshop host logging.

## Completed Outcomes

1. Foundation package exists and is covered by default tests.
2. Structured log records share stable fields across package boundaries.
3. Redaction behavior is tested, including secret-like fields and local path
   sanitization.
4. CLI logging writes JSONL through a host sink and keeps log state separate
   from config/profile storage.
5. Application/core/provider paths emit useful command, job, dispatch, and
   provider events without leaking raw secrets.
6. App-side host logging is exercised through fake UXP modules and remains
   separate from real Photoshop host smoke claims.

## Validation Record

Current validation authority is `docs/TESTING.md`, not this historical record.
The completed sprint used the default mock-only gates:

```bash
pnpm --filter @imagen-ps/foundation test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test
pnpm check:policy
pnpm validate
```

Live provider and real Photoshop / UXP host behavior remained outside the
default gate.

## Future Change Rules

Future foundation logging changes should start from the current code and tests.
If a change introduces storage, provider transport semantics, UXP host behavior,
or product telemetry decisions, open a new bounded Loop or Decision Packet
rather than extending this completed sprint record.
