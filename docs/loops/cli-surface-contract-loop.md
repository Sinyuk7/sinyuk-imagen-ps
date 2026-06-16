# CLI Surface Contract Loop

Status: completed
Authority: historical Loop record; not active unless root `AGENTS.md` or the
current user turn explicitly reauthorizes it.
Owner: `apps/cli`
Created: 2026-06-15
Completed: 2026-06-16
Superseded by: No follow-up
Context docs:

- `AGENTS.md`
- `apps/cli/AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`

## Result

This Loop aligned `@imagen-ps/cli` as the repository Node automation surface over
shared application/session behavior. It is now a contract-tested surface for:

- mock-first profile setup;
- provider/profile inspection;
- JSON stdout and stderr automation behavior;
- task-first `generate` / `edit` aliases;
- lower-level `job submit` workflows;
- `--out` image and sidecar artifact writing;
- durable `job list` / `job get` / `job retry` behavior.

This document is a completed record. Do not resume it as an execution plan.

## Decisions Kept

- `apps/cli` owns commander parsing, stdout/stderr JSON, Node filesystem
  adapters, log/config env behavior, and `--out` artifact writing.
- `packages/application` owns command facade, session controller,
  profile/model coordination, request builders, and runtime assembly.
- `packages/core-engine` owns job facts, lifecycle, store, events, runner, and
  dispatch boundary.
- `packages/providers` owns provider validation, transport, normalization, and
  error mapping.
- `apps/app` owns React UI, UXP shell, HostBridge, and Photoshop / UXP IO.
- Durable job history is shared application/core semantics surfaced by CLI and
  app adapters; it is not a CLI-private job model.
- Mock-first CLI usage is the default contract path; live provider smoke remains
  opt-in.

## Non-Goals Preserved

- No Photoshop, UXP, React, or UI imports in `apps/cli`.
- No CLI-private provider transport ownership.
- No telemetry, account login, browser auth, remote asset registry, batch
  scheduler, cost accounting, or provider marketplace.
- No generic image CLI positioning.

## Completed Slices

1. Documentation truth pass: CLI README now leads with repo-local automation,
   mock-first usage, `env:` secret references, JSON input, stdout/stderr, and
   `--out` artifacts.
2. Parser and contract hardening: command behavior is covered by subprocess
   contract tests, including parser failures and hermetic config/log dirs.
3. Task-first aliases: `generate` and `edit` are thin CLI parser surfaces over
   the same workflow submission path as `job submit`.
4. Artifact output: `--out` writes a job-scoped output directory with image and
   sidecar metadata.
5. Durable job history: terminal jobs can be listed, inspected, and retried
   across process boundaries without persisting raw secret values.

## Validation Record

Current validation authority is `docs/TESTING.md`, not this historical record.
The completed Loop used the default mock-only gates:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm --filter @imagen-ps/application test
pnpm check:policy
pnpm validate
```

Live provider smoke was treated as opt-in manual evidence and did not become a
default gate.

## Future Change Rules

Future CLI changes should start from the current code, `apps/cli/AGENTS.md`,
`docs/TESTING.md`, and focused contract tests. If a change needs provider
transport, application/core contract changes, or Photoshop / UXP behavior,
produce a new bounded Loop or Decision Packet rather than extending this
completed record.
