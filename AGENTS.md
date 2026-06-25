# AGENTS.md

## Operating Model

This repo uses current-state, harness-first loop engineering.

- Current-state first: zero users, zero production data, no legacy contract to preserve.
- Loop shape: objective, scope, ownership boundary, harness, acceptance gate, stop rule, writeback target.
- Harness before live/manual validation: contract tests, fake adapters, smoke harnesses, fixtures, boundary checks, reproducible commands.
- Stop and re-scope when a slice needs unauthorized cross-boundary ownership changes.

## Entrypoints

- The only authoritative active-loop entrypoint is root `AGENTS.md`. No active loop is currently declared; `docs/loops/` holds only the active loop or is empty.
- Before non-trivial fixes or architecture changes, search project engineering records and current docs with `rg`:
  `rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md`
- Use [docs/agent/LOOP.md](docs/agent/LOOP.md) for the Loop collaboration contract and `.agents/skills/` for repository-specific agent workflows.
- Keep broad context in [docs/ENGINEERING_CONTEXT.md](docs/ENGINEERING_CONTEXT.md), not here.
- `pnpm check:policy` owns mechanical policy checks: package boundaries, current-state wording in high-authority docs, and portable path references.

## Writeback

- Before finishing non-trivial work, decide whether the turn produced reusable knowledge.
- Write only **stable, reusable engineering knowledge that cannot live more naturally in an authoritative doc** to `docs/dev-memory/`. Each record states the current fact, why future development needs it, and how to re-verify it through code, tests, harness, or a command.
- Do not store completed plans, execution logs, task process, raw logs, full investigation transcripts, or one-off implementation details in memory. If the knowledge fits `README.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, or a module doc, write it there instead.
- Unorganized drafts go to `_inbox/`; promote stable ones under the matching `memories/` subdirectory or delete them.
- Ask before writing user/local/profile/cross-project habits to agent memory.
- Never store secrets, raw logs, build output, generated artifacts, or provider keys.

## Language And API

- Documentation and commit messages should be written in English by default.
- Code comments and JSDoc should be written in Chinese.
- Do not use Chinese for identifiers or file names.
- Every cross-package export must have concise Chinese JSDoc.
