---
name: requirement-to-loop-planner
description: Convert a new repository requirement or multi-step change into a bounded Loop plan before implementation. Use when work is not already a final-test defect RCA or confirmed bug fix and needs goal/scope/ownership/harness/stop-rule planning, including architecture changes, provider behavior, Photoshop UXP workflow changes, or refactors with unclear boundaries.
---

# Requirement To Loop Planner

Create a bounded Loop plan grounded in this repository's current state.

Use this skill when the task is a new requirement, refactor, or multi-step
change that still needs scope definition. Keep planning short and execution-
oriented. If the task is a final-test defect, Photoshop UXP runtime issue,
Chrome-vs-UXP divergence, or confirmed bug with symptom, expected behavior, and
reproduction evidence, recommend `uxp-issue-rca` instead. Do not auto-switch
into that skill unless the user explicitly asks for it.

## Procedure

1. Read current authority first:
   - `AGENTS.md`
   - active Loop named by root `AGENTS.md`, if present
   - `docs/agent/LOOP.md`
   - `docs/TESTING.md`
   - relevant package `AGENTS.md`
   - `docs/ENGINEERING_CONTEXT.md` only if needed for boundary or terminology
2. Search project records before non-trivial work:
   ```sh
   rg -n "<module|symptom|error|decision>" docs/loops AGENTS.md README.md docs/ENGINEERING_CONTEXT.md docs/TESTING.md
   ```
3. Reuse the active Loop when it already covers the request. Draft a new Loop
   only when the current active Loop does not cover the work.
4. Convert the requirement into:
   - Goal;
   - Non-goals;
   - allowed / forbidden scope;
   - owner boundary;
   - baseline;
   - slices (`1-10`, each bounded and executable);
   - validation categories;
   - Decision Packet triggers;
   - memory note candidate rule.
5. Format the Loop doc to satisfy `docs/agent/LOOP.md` required metadata and
   required sections. Keep each section short. Prefer direct bullets over
   narrative.
6. If the user already authorized execution, end with a Loop doc ready for
   `bounded-loop-executor`. Do not implement product changes in this skill.

## Repository Boundaries

- Photoshop / UXP host IO belongs in `apps/app/src/adapters/uxp/` (e.g. `photoshop-host-bridge.ts`, `uxp-secret-storage-adapter.ts`, `uxp-api.ts`); `apps/app/src/host/` is only compatibility re-exports for older tests/imports, not the ownership target.
- Session, profile/model coordination, request builders, and command facades belong in `packages/application`.
- Job lifecycle and dispatch boundary belong in `packages/core-engine`.
- Provider validation, transport, discovery, and response normalization belong in `packages/providers`.
- Pure host-agnostic utilities belong in `packages/foundation`.

## Stop Conditions

Produce a Decision Packet (A/B/C choice with evidence and recommendation) instead of guessing when:

- the requirement has multiple incompatible interpretations;
- a slice needs unauthorized cross-boundary ownership changes;
- validation requires live provider or real Photoshop proof that was not approved;
- provider/API behavior is not evidenced by code, tests, or docs;
- no mock/fake/contract harness can support the claimed behavior.

## Output

Return a Loop plan or Loop doc draft. Do not implement product features while
using this skill unless the user explicitly authorizes execution after the plan.
Treat the Loop file as temporary execution state that will be deleted after
completion per `docs/agent/LOOP.md`.
