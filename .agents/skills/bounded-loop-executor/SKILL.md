---
name: bounded-loop-executor
description: Execute an approved repository Loop slice within its stated scope. Use when a Loop or user-approved slice already defines goal, owner boundary, allowed files, forbidden files, validation commands, stop rules, and reporting requirements.
---

# Bounded Loop Executor

Execute one approved slice without expanding ownership or product scope.

## Procedure

1. Read the active Loop or user-approved slice and `docs/agent/LOOP.md`.
2. Read only the current authority and targeted historical records needed for
   the slice.
3. Confirm:
   - owner package / surface;
   - allowed files;
   - forbidden files;
   - validation category and commands;
   - stop rules.
4. Check `git status`. Preserve unrelated changes. If unrelated changes affect
   the slice and cannot be worked around safely, ask before proceeding.
5. If baseline validation is required, run it before edits.
6. Make the smallest change that satisfies the slice.
7. Run per-slice validation after the slice. Run final validation
   (`pnpm validate`) only after all slices are complete or when the Loop
   explicitly requires it.
8. Report with the execution report contract from `docs/agent/LOOP.md`.

## Validation Selection

Use `docs/TESTING.md` categories:

- quick;
- per-slice;
- final;
- manual-only;
- live-provider.

Do not use `pnpm lint` as a Loop gate unless `docs/TESTING.md` marks it as
supported.

## Stop Conditions

Stop and produce a Decision Packet using `docs/loops/_decision-packet.md` when:

- the needed change crosses forbidden scope;
- a shared contract needs design before implementation;
- a provider claim needs live behavior not covered by existing tests;
- a UXP claim needs real Photoshop proof;
- baseline failure blocks attribution.

## Memory Candidate

In the final report, set `Memory note candidate` to `no` or `yes: <type>`.
Allowed types are:

- `architecture`
- `decision`
- `workflow`
- `bug`
- `manual-host-result`
