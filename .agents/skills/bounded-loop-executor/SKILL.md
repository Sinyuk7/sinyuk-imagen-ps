---
name: bounded-loop-executor
description: Execute an approved repository Loop slice within its stated scope. Use when a Loop or user-approved slice already defines goal, owner boundary, allowed files, forbidden files, validation commands, stop rules, and reporting requirements.
---

# Bounded Loop Executor

Execute one approved slice without expanding ownership or product scope.

## Procedure

1. Read the active Loop or user-approved slice and `docs/agent/LOOP.md`.
2. Run a fast preflight only once:
   - current checkout must be a Git linked worktree, not the main worktree;
   - the worktree should start clean enough for `git add -A` at the end;
   - ignore missing or ignored `.codegraph/` state;
   - if not in a linked worktree, stop and tell the user to create one.
3. Update root `AGENTS.md` so `Active Loop` points at the Loop being executed.
   If `AGENTS.md` has conflicting edits around that field, stop and report the
   conflict.
4. Read only the current authority and targeted records needed for the slice.
5. Confirm:
   - owner package / surface;
   - allowed files;
   - forbidden files;
   - validation category and commands;
   - stop rules.
6. Run baseline validation only when the Loop or current failure attribution
   requires it. Do not repeat broad baseline checks without a concrete reason.
7. Execute slices quickly:
   - prefer direct implementation over repeated exploratory checks;
   - use the smallest change that satisfies the current slice;
   - stop only on real boundary, evidence, or validation blockers.
8. Run focused per-slice validation after the relevant slice when needed.
9. Run final validation near the end. Default final gate is `pnpm validate`
   unless the Loop explicitly names a different final gate.
10. On successful completion:
   - write any durable facts back to canonical authority docs when needed;
   - delete the completed Loop file per `docs/agent/LOOP.md`;
   - stage all current worktree changes with `git add -A`;
   - generate a commit message via `caveman-commit`;
   - commit the result.
11. Report with the execution report contract from `docs/agent/LOOP.md`, kept
   short and evidence-first.

## Validation Selection

Use `docs/TESTING.md` categories:

- quick;
- per-slice;
- final;
- release;
- manual-only;

Do not use `pnpm lint` as a Loop gate unless `docs/TESTING.md` marks it as
supported.

Live provider proof belongs to the `release` category. Real Photoshop / UXP
proof belongs to `manual-only`.

## Stop Conditions

Stop and produce a Decision Packet (A/B/C choice with evidence and recommendation) when:

- the requirement or slice still has multiple incompatible interpretations;
- the needed change crosses forbidden scope;
- a shared contract needs design before implementation;
- a provider claim needs release-level live behavior not covered by existing tests;
- a UXP claim needs real Photoshop proof beyond approved manual-only evidence;
- baseline failure blocks attribution.

## Memory Candidate

In the final report, set `Memory note candidate` to `no` or `yes: <type>`.
Allowed types are:

- `architecture`
- `decision`
- `workflow`
- `bug`
- `manual-host-result`
