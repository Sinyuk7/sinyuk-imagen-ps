# Loop Collaboration Model

This document defines the repository-level collaboration contract for future
Loop-mode work. It is a process contract, not an active product plan.

Root `AGENTS.md` remains the only authority for the current active loop. A Loop
document is executable only when root `AGENTS.md` points at it or the current
user turn explicitly authorizes that Loop.

## Document Authority

Agents must classify repository documents before using them as planning input.

| Class | Examples | How to use |
|---|---|---|
| Current authority | `AGENTS.md`, package `AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, active Loop named by root `AGENTS.md` | May constrain current work. |
| Completed loop record | `docs/loops/*` with `Status: completed` | Historical evidence only; do not resume as a plan. |
| Design / historical reference | `docs/loops/foundation-logging-sprint.md`, `apps/app/dcos/`, `apps/app/prototype/`, old design docs, completed sprint plans | Read only when the current Loop asks for that context. |
| Manual-only workflow | UXP host smoke notes, live provider smoke notes | Use only as manual validation instructions, not default CI proof. |

Read targeted context first. Broad historical documents can add context without
improving execution and can make stale plans look active.

## Loop Document Contract

A Loop document must start with status and authority metadata.

Required sections:

- `Status`: `draft`, `active`, `blocked`, `completed`, or `superseded`.
- `Authority`: root `AGENTS.md` declaration or current user authorization.
- `Owner`: package or surface that owns the slice.
- `Context docs`: current authoritative docs and narrow historical records.
- `Goal`: one observable outcome.
- `Non-goals`: tempting but excluded work.
- `Scope`: allowed and forbidden files/packages.
- `Ownership boundary`: CLI / Provider / Application / Core / UXP ownership.
- `Baseline`: current validation state and what to do if it fails.
- `Slices`: bounded steps with goal, allowed scope, validation, and stop rules.
- `Validation`: quick, per-slice, final, manual-only, and live-provider gates.
- `Decision Packet triggers`: conditions that require stopping.
- `Completion report`: fields the executing agent must report.
- `Memory note candidate`: whether durable project memory should be proposed.

If `Status` is `completed`, the Loop must also state either `Superseded by:
<path>` or `No follow-up`. This prevents old Loop records from looking like
unfinished active plans.

Optional sections:

- Background evidence.
- Prior Loop references.
- Manual host checklist.
- Live provider smoke checklist.
- Rollback notes for implementation slices.

Forbidden content:

- Product roadmap ranking.
- Provider behavior not evidenced by code, tests, or docs.
- Live credentials, raw logs, or build output.
- Claims that fake UXP tests prove real Photoshop behavior.
- Broad docs cleanup unrelated to execution.
- Large architecture essays without scope, harness, and stop rules.

## Loop File Naming

Use date-prefixed names for active or newly drafted Loops when it helps scan
current work:

```text
docs/loops/YYYY-MM-DD-short-name.md
```

Completed Loop records should prefer stable semantic names when the date no
longer helps execution:

```text
docs/loops/short-name-loop.md
```

Keep creation and completion dates in the metadata. Do not rely on the filename
alone to communicate whether a Loop is active; `Status` and `Authority` remain
required.

## Goal Rules

A good Goal:

- names one observable outcome;
- names the owning package or surface;
- can be validated by existing or planned harness;
- excludes adjacent product work.

A bad Goal:

- improves a broad area without a concrete contract;
- bundles CLI, provider, UXP, and shared-package changes without slices;
- says to make a feature production-ready without defining a gate;
- asks for documentation cleanup as a substitute for tests.

Separate fields this way:

- Goal: desired observable behavior.
- Non-goals: adjacent outcomes that are not authorized.
- Scope: files and packages that may change.
- Ownership boundary: which layer owns the semantics.

When a requirement is ambiguous, the agent must either narrow it with evidence
or produce a Decision Packet. Do not make broad architecture choices by
guessing.

## Slice Rules

Each slice must have:

- one owner boundary;
- one behavior, contract, or harness outcome;
- named tests or harness before implementation;
- explicit forbidden scope;
- a stop rule that can actually fire.

Stop when a slice needs unauthorized cross-boundary ownership changes. Examples:

- CLI needs provider transport or Photoshop/UXP imports.
- `apps/app` needs direct imports from `@imagen-ps/core-engine` or
  `@imagen-ps/providers`.
- `packages/application` needs React, DOM, Node `fs/path/os`, Photoshop, or UXP.
- A provider change needs UI state, CLI flags, or host IO.
- A validation claim requires live provider or real Photoshop proof that has not
  been approved.

## Validation Rules

Loop validation must reference the categories in `docs/TESTING.md`.

- Quick: cheap checks useful during planning or small slices.
- Per-slice: focused package commands tied to touched ownership boundaries.
- Final: `pnpm validate` for non-trivial completed work.
- Manual-only: UXP Developer Tool + Photoshop or other human-observed gates.
- Live-provider: opt-in provider smoke that may use credentials, network, or
  paid APIs.

Do not treat `pnpm lint` as a Loop gate until package-level lint scripts exist
or `docs/TESTING.md` marks it as supported.

If baseline validation fails before implementation, report it and decide whether
it blocks the slice. Do not hide baseline failures inside new changes.

If no validation exists for a serious behavior claim, the first slice should add
a harness or the agent should produce a Decision Packet.

## Decision Packets

A Decision Packet is the standard stop mechanism. Use the template at
`docs/loops/_decision-packet.md`.

Produce one when:

- the requirement has multiple incompatible interpretations;
- the slice needs unauthorized package ownership changes;
- validation needs live provider or real Photoshop proof that was not approved;
- provider/API behavior is not evidenced;
- baseline failure blocks attribution.

The blocked question must be answerable as a single choice, usually A/B/C. Do
not ask open-ended essay questions. After producing a Decision Packet, do not
continue implementation in the blocked area.

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

## Memory Note Policy

Use project memory only for durable project facts that future collaborators need
to share. Draft notes go under:

```text
docs/dev-memory/_inbox/YYYY-MM-DD-short-topic.md
```

Stable notes move to:

- `docs/dev-memory/memories/architecture/`
- `docs/dev-memory/memories/decisions/`
- `docs/dev-memory/memories/workflow/`
- `docs/dev-memory/memories/bug/`

Record:

- root causes;
- architecture or boundary decisions;
- reusable validation workflows;
- confirmed manual host smoke results;
- provider behavior verified by tests or live smoke;
- known limitations with evidence.

Do not record:

- raw logs;
- build output;
- secrets or provider keys;
- local user habits;
- every passing test run;
- speculative future plans;
- summaries that duplicate current authority docs.

The execution report proposes memory candidates. It does not make memory writes
mandatory.

## Repository Skill Workflows

Repository-specific skills live under `.agents/skills/`. They are checked-in
workflow assets, not product roadmap items.

Keep the project skill set small. Use these as the entry index:

| Entry | Use when | Read first | Output |
|---|---|---|---|
| `.agents/skills/requirement-to-loop-planner/SKILL.md` | Convert a new non-trivial requirement, architecture change, provider behavior change, CLI command change, or UXP workflow change into a bounded Loop. | `AGENTS.md`, `docs/agent/LOOP.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, relevant package `AGENTS.md` | Bounded Loop plan with scope, slices, validation, and stop rules. |
| `.agents/skills/bounded-loop-executor/SKILL.md` | Execute an approved Loop slice that already defines owner boundary, allowed files, forbidden files, validation, and stop rules. | Active Loop or user-approved slice, `docs/agent/LOOP.md`, targeted authority docs | Scoped changes, validation evidence, execution report, memory candidate. |
| `.agents/skills/cli-contract-reviewer/SKILL.md` | Review or plan CLI parser, stdout/stderr, profile, job, config/log path, subprocess test, or `--out` changes. | `apps/cli/AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, CLI contract tests | CLI contract risk and validation plan. |
| `.agents/skills/provider-contract-reviewer/SKILL.md` | Review or plan provider config, request, model discovery, transport, response normalization, or live smoke boundaries. | `packages/providers/AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, provider contract files | Provider contract risk and validation plan. |
| `.agents/skills/uxp-boundary-reviewer/SKILL.md` | Review or plan Photoshop host bridge, UXP storage, manifest permission, app host adapter, image workflow, or real host smoke changes. | `apps/app/AGENTS.md`, `apps/app/SPEC.md`, `apps/app/STATUS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md` | Fake harness vs real host validation boundary. |

Do not create one skill per feature. Do not create generic TypeScript monorepo
skills that ignore this repository's CLI / Provider / UXP boundaries.
