# Loop Collaboration Model

This document defines the repository collaboration contract for future Loop
work. It is process authority, not an active product plan.

Root `AGENTS.md` is the only standing active-loop entrypoint. A Loop document is
executable only when root `AGENTS.md` points at it or the current user turn
explicitly authorizes that Loop.

## Document Authority

Agents must classify documents before using them as planning input.

| Class | Examples | How to use |
|---|---|---|
| Current authority | `AGENTS.md`, package `AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, active Loop named by root `AGENTS.md` | May constrain current work. |
| Active Loop | `docs/loops/*.md` named by root `AGENTS.md` | Executable plan for the current slice only. |
| Historical reference | deleted `docs/dev-memory/` records, old design docs | Read only when the current task explicitly asks for that context. |
| Manual-only workflow | UXP host smoke notes, live provider smoke notes | Use only as manual validation instructions, not default CI proof. |

Completed Loop records are not retained in `docs/loops/`; their durable outcomes
are merged into authoritative docs. `docs/dev-memory/` is read-only historical
reference, not a writeback target. Do not treat a deleted Loop as resumable.

Read targeted current authority first. Broad historical documents can add
context without improving execution and can make completed or abandoned plans
look active.

## Loop Document Contract

A Loop document must start with status and authority metadata.

Required metadata:

- `Status`: `draft`, `active`, `blocked`, `completed`, or `superseded`.
- `Authority`: root `AGENTS.md` declaration or current user authorization.
- `Owner`: package or surface that owns the slice.
- `Created`: date the Loop was opened.
- `Superseded by` or `No follow-up`: required when `Status` is `completed`.

Required sections:

- `Context docs`: current authority and narrow historical records.
- `Goal`: one observable outcome.
- `Non-goals`: tempting but excluded work.
- `Scope`: allowed and forbidden files/packages.
- `Ownership boundary`: App / Provider / Application / Core / UXP ownership.
- `Baseline`: current validation state and what to do if it fails.
- `Slices`: bounded steps with goal, allowed scope, validation, and stop rules.
- `Validation`: quick, per-slice, final, manual-only, and live-provider gates.
- `Decision Packet triggers`: conditions that require stopping.
- `Completion report`: fields the executing agent must report.
- `Memory note candidate`: whether durable project memory should be proposed.

Forbidden content:

- product roadmap ranking;
- provider behavior not evidenced by code, tests, docs, or approved live smoke;
- live credentials, raw logs, or build output;
- claims that fake UXP tests prove real Photoshop behavior;
- broad docs cleanup unrelated to the Loop scope;
- architecture essays without scope, harness, and stop rules.

## File Naming

Date-prefixed names while a Loop is active or newly drafted:

```text
docs/loops/YYYY-MM-DD-short-name.md
```

When a Loop reaches `completed`, merge its durable outcomes into authoritative
docs and delete the file. `docs/loops/`
holds only the current active Loop or is empty. Status and authority metadata,
not the filename, decide whether a Loop is active.

## Goal And Slice Rules

A good Goal names one observable outcome, the owner boundary, and the validation
gate. It excludes adjacent product work.

Each slice must have:

- one owner boundary;
- one behavior, contract, harness, or documentation outcome;
- named validation before implementation claims;
- explicit forbidden scope;
- a stop rule that can fire.

Stop when a slice needs unauthorized cross-boundary ownership changes. Examples:

- `apps/app` needs direct imports from `@imagen-ps/core-engine` or
  `@imagen-ps/providers`.
- `packages/application` needs React, DOM, Node `fs/path/os`, Photoshop, or UXP.
- Provider work needs UI state, local paths, or host IO.
- A claim requires live provider or real Photoshop proof that has not been
  approved.

## Validation Rules

Loop validation must use the categories in `docs/TESTING.md`:

- quick;
- per-slice;
- final;
- manual-only;
- live-provider.

Do not treat `pnpm lint` as a Loop gate until `docs/TESTING.md` marks it as
supported.

If baseline validation fails before implementation, report it and decide whether
it blocks the slice. If no validation exists for a serious behavior claim, add a
harness first or produce a Decision Packet.

## Decision Packets

A Decision Packet is the standard stop mechanism. Format it as a concise
A/B/C choice with evidence, trade-offs, and a clear recommendation.

Produce one when:

- the requirement has multiple incompatible interpretations;
- a slice needs unauthorized package ownership changes;
- validation needs live provider or real Photoshop proof that was not approved;
- provider/API behavior is not evidenced;
- baseline failure blocks attribution.

The blocked question must be answerable as one choice, usually A/B/C. Do not ask
open-ended essay questions. After producing a Decision Packet, do not continue
implementation in the blocked area.

## Execution Report

After executing a Loop slice, report:

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

`Memory note candidate` must be `no` or `yes: <type>`, where `<type>` is one of:

- `architecture`
- `decision`
- `workflow`
- `bug`
- `manual-host-result`

A `yes` candidate proposes that durable knowledge be written into the canonical
doc that owns it (per root `AGENTS.md` Writeback), not into `docs/dev-memory/`.
The execution report proposes candidates; it does not make writes mandatory.

## Skill Entry Index

Repository skills live under `.agents/skills/`. Keep the set small and use the
skill whose trigger matches the task:

| Skill | Trigger |
|---|---|
| `requirement-to-loop-planner` | New non-trivial requirement or architecture / provider / UXP workflow change needs bounded scope, validation, and stop rules before implementation. |
| `bounded-loop-executor` | An approved Loop slice already defines owner boundary, allowed files, forbidden files, validation, stop rules, and reporting requirements. |
| `provider-contract-reviewer` | Provider config schemas, canonical requests, model discovery, transport builders, response parsers, descriptors, mock/live smoke boundaries, or normalization. |
| `uxp-issue-rca` | Final-test Photoshop UXP defects, Chrome-vs-UXP divergence, and UI/non-UI panel failures that need real host logs, owner localization, and a focused UXP UI or runtime verification path. |
| `docs-reducer` | Documentation has grown, `docs/dev-memory` / `docs/loops` / inbox trees have accumulated, `AGENTS.md` files duplicate global rules, or canonical authority is unclear; reduce toward the `scripts/policy/docs.mjs` whitelist. |

Do not create one skill per feature. Do not create generic TypeScript monorepo
skills that ignore this repository's App / Provider / UXP boundaries.
