---
name: requirement-to-loop-planner
description: Convert a new repository requirement or multi-step change into a bounded Loop plan before implementation. Use when work is not already a confirmed bug fix and needs goal/scope/ownership/harness/stop-rule planning, including architecture changes, provider behavior, Photoshop UXP workflow changes, or refactors with unclear boundaries.
---

# Requirement To Loop Planner

Create a bounded Loop plan grounded in this repository's current state.

Use this skill when the task is a new requirement, refactor, or multi-step
change that still needs scope definition. If the task is already a confirmed UI
bug fix with symptom, expected behavior, and reproduction evidence, hand off to
`ui-fix-guardrails` instead.

## Procedure

1. Read current authority first:
   - `AGENTS.md`
   - `docs/agent/LOOP.md`
   - `docs/ENGINEERING_CONTEXT.md`
   - `docs/TESTING.md`
   - relevant package `AGENTS.md`
2. Search project records before non-trivial work:
   ```sh
   rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md
   ```
3. Classify docs before using them:
   - current authority;
   - completed Loop record;
   - design / historical reference;
   - manual-only workflow.
4. Convert the requirement into:
   - Goal;
   - Non-goals;
   - allowed / forbidden scope;
   - owner boundary;
   - baseline;
   - slices;
   - validation categories;
   - Decision Packet triggers;
   - memory note candidate rule.
5. Format Loop docs with status/authority/owner metadata, goal/non-goals, scope, slices, and validation categories.

## Repository Boundaries

- Photoshop / UXP host IO belongs in `apps/app/src/host/` or injected app adapters.
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
