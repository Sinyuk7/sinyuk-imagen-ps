# AGENTS.md

## Operating Model

This repo uses current-state, harness-first loop engineering.

- Current-state first: zero users, zero production data, no legacy contract to preserve.
- Loop shape: objective, scope, ownership boundary, harness, acceptance gate, stop rule, writeback target.
- Harness before live/manual validation: contract tests, fake adapters, smoke harnesses, fixtures, boundary checks, reproducible commands.
- Stop and re-scope when a slice needs unauthorized cross-boundary ownership changes.

## Entrypoints

- The only authoritative active-loop entrypoint is root `AGENTS.md`.
- Active Loop: `docs/loops/2026-07-05-status-notice-contract.md`.
- The permanent documentation set is exactly the `scripts/policy/docs.mjs` `highAuthorityDocs` list. No permanent doc may exist outside it; amending the list is part of the change that introduces a new permanent doc. `docs/dev-memory/` is read-only historical reference, not current authority.
- Before non-trivial fixes or architecture changes, search current authority first, then historical records:
  `rg -n "<module|symptom|error|decision>" AGENTS.md README.md docs/ENGINEERING_CONTEXT.md docs/TESTING.md docs/loops`
- Use [docs/agent/LOOP.md](docs/agent/LOOP.md) for the Loop collaboration contract and `.agents/skills/` for repository-specific agent workflows.
- Keep broad context in [docs/ENGINEERING_CONTEXT.md](docs/ENGINEERING_CONTEXT.md), not here.
- `pnpm check:policy` owns mechanical policy checks: package boundaries, current-state wording in high-authority docs, and portable path references.

## Release Gate

The production artifact contract and release runbook live in [`docs/RELEASE.md`](docs/RELEASE.md). Key points:

- `pnpm --filter @imagen-ps/app build:production` produces the allowlisted, verified staging directory at `apps/app/release/uxp-production/`.
- `pnpm --filter @imagen-ps/app verify:production` re-runs the artifact verifier on the existing staging directory.
- `pnpm release:verify` is the repo-level release gate. It runs `pnpm validate`, the production build, artifact verification, license verification, and build-metadata/version-consistency checks.
- `pnpm release:verify` defaults to rejecting a dirty git working tree; use `--allow-dirty` only for local rehearsal.
- Adobe `.ccx` packaging is a manual UDT boundary. Use `ccx:pre` before UDT Package and `ccx:post <ccx-path>` after UDT Package to validate the archive and write the `.sha256` sidecar.
- `apps/app/AGENTS.md` owns app-level build/dev commands and UXP-specific constraints.

## Writeback

- Before finishing non-trivial work, decide whether the turn produced reusable knowledge.
- Write stable, reusable engineering knowledge into the canonical doc it belongs to: `README.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, or the matching module `AGENTS.md`. Do not park durable facts in `docs/dev-memory/`; it is read-only historical reference, not a permanent knowledge store.
- Do not store completed plans, execution logs, task process, raw logs, full investigation transcripts, or one-off implementation details anywhere. If a fact is not canonical, it does not belong in maintained docs.
- Do not create new `docs/dev-memory/` records. Existing records are reduced over time by promoting still-needed facts into canonical docs and deleting the rest.
- Ask before writing user/local/profile/cross-project habits to agent memory.
- Never store secrets, raw logs, build output, generated artifacts, or provider keys.

## Language And API

- Documentation and commit messages should be written in English by default.
- Code comments and JSDoc should be written in Chinese.
- Do not use Chinese for identifiers or file names.
- Every cross-package export must have concise Chinese JSDoc.
