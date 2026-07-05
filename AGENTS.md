# AGENTS.md

## Operating Model

This repo uses current-state, harness-first loop engineering.

- Current-state first: zero users, zero production data, no legacy contract to preserve.
- Loop shape: objective, scope, ownership boundary, harness, acceptance gate, stop rule, writeback target.
- Harness before live/manual validation: contract tests, fake adapters, smoke harnesses, fixtures, boundary checks, reproducible commands.
- Fake structure must follow stable boundaries. See `docs/TESTING.md` for fake, stub, fixture, builder, spy, and `createTestHarness()` rules.
- Stop and re-scope when a slice needs unauthorized cross-boundary ownership changes.
- Root `AGENTS.md` owns repo-level operating rules. `apps/app/AGENTS.md` owns app-surface, placement, and UXP-specific constraints.

## Adobe Photoshop UXP Research

- Search the local official Adobe documentation mirrors before relying on memory:
  - `.local/share/uxp-photoshop`
  - `.local/share/uxp`
  - `.local/share/uxp-photoshop-plugin-samples`
  - `~/Documents/github/monorepo`

## Release Gate

- The production artifact contract and release runbook live in [`docs/RELEASE.md`](docs/RELEASE.md).
- `pnpm release:verify` is the repo-level release gate.
- Adobe `.ccx` packaging is a manual UDT boundary. Use `ccx:pre` before UDT Package and `ccx:post <ccx-path>` after packaging validation.

## Writeback

- Before finishing non-trivial work, decide whether the turn produced reusable knowledge and write stable facts into the canonical doc they belong to: `README.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, or the matching module `AGENTS.md`.
- Do not park durable facts in `docs/dev-memory/`; it is read-only historical reference, not a permanent knowledge store. Do not create new `docs/dev-memory/` records.
- Do not store non-canonical material in maintained docs: completed plans, execution logs, task process, raw logs, full investigation transcripts, one-off implementation details, build output, generated artifacts, secrets, or provider keys.
- Ask before writing user/local/profile/cross-project habits to agent memory.

## Language And API

- Documentation and commit messages should be written in English by default.
- Code comments and JSDoc should be written in Chinese.
- Do not use Chinese for identifiers or file names.
- Every cross-package export must have concise Chinese JSDoc.
