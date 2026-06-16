# Loop: <name>

## Status

Status: draft
Authority: root `AGENTS.md` or current user authorization
Owner: `<package-or-surface>`
Created: `<YYYY-MM-DD>`
Superseded by: `<path>` or `No follow-up` when completed
Context docs:

- `AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`

## Goal

One observable outcome.

## Non-goals

- Excluded adjacent work.
- Excluded product or architecture expansion.

## Scope

Allowed:

- `<files-or-packages>`

Forbidden:

- `<files-or-packages>`

Ownership boundary:

- CLI:
- Provider:
- Application:
- Core:
- UXP:

## Baseline

Quick:

- `<command-or-not-run-reason>`

Known failing baseline:

- `<none-or-failure>`

Decision if baseline fails:

- Stop and report unless the failure is already documented and unrelated.

## Slices

### Slice 1: <name>

Goal:

- One bounded behavior, contract, harness, or documentation outcome.

Allowed:

- `<files-or-packages>`

Forbidden:

- `<files-or-packages>`

Validation:

- `<per-slice-command>`

Stop:

- Stop if the slice needs unauthorized cross-boundary ownership changes.

Report evidence:

- Files changed.
- Commands run.
- Boundary evidence.

## Validation

Quick:

- `<cheap-command>`

Per-slice:

- `<focused-command>`

Final:

- `pnpm validate`

Manual-only:

- `<manual-gate-or-none>`

Live-provider:

- `<opt-in-live-command-or-none>`

## Decision Packet Triggers

- Requirement has multiple incompatible interpretations.
- Slice needs unauthorized package ownership changes.
- Validation requires live provider or real Photoshop proof that was not approved.
- Provider/API behavior is not evidenced by repository code, tests, or docs.
- Baseline failure blocks attribution.

## Completion Report

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Record if:

- The turn produced a durable project fact in one of these categories:
  `architecture`, `decision`, `workflow`, `bug`, `manual-host-result`.

Do not record:

- Raw logs, build output, secrets, local user habits, routine passing tests, or
  speculative plans.
