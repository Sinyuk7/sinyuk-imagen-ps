---
name: ui-fix-guardrails
description: Use only for confirmed UI bug fixes in apps/app when the symptom, expected behavior, and reproduction evidence are already known. Frame owner boundary and acceptance evidence before editing, then verify regression after the fix. Do not use for screenshot-only review, Photoshop-only RCA before ownership is established, new requirements, refactors, or multi-step planning; use requirement-to-loop-planner instead.
---

# UI Fix Guardrails

A thin before/after guardrail for confirmed UI bug fixes only: establish a
reproducible baseline and an owner hypothesis before editing, then prove the
fix with the same check and complete regression after.

## 1. Purpose

Constrain confirmed UI bug fixes on four points only:

- pre-fix owner boundary framing;
- modification scope constraints;
- post-fix dual-runtime regression;
- evidence-based acceptance.

If the work is a new requirement, refactor, or multi-step change that still
needs scope or slice planning, use `requirement-to-loop-planner` instead.

This skill does not prescribe a debugging method and does not replace general
debugging, Loop execution, or architecture review.

## 1A. Do Not Use

Do not use this skill when:

- the user only wants a screenshot or page review;
- the issue may be Photoshop-only and still needs RCA across wrapper, host, or
  adapter layers;
- the work is still deciding whether a visible issue is a bug or only an
  optimization;
- scope is not yet clear enough to define a concrete acceptance oracle.

## 2. Required Inputs

Before editing, the agent must be able to state:

- user-visible symptom;
- expected behavior;
- reproduction runtime: `UXP` / `Chrome` / `Both` / `Unknown`;
- available evidence: test, log, screenshot, or manual step;
- initial owner hypothesis.

If those inputs are not yet available, stop and plan the work first instead of
using this skill as the entry point.

Insufficient evidence may justify further investigation, but never an assumed
modification layer.

## 3. Pre-fix Frame

Write a short record before editing. This specifies the output, not how the
agent reaches it.

```text
Symptom:
Expected:
Runtime coverage: UXP | Chrome | Both | Unknown
Initial owner:
Reproduction evidence:
Likely touched boundary:
Required acceptance check:
```

Runtime coverage is the strongest initial signal, not a conclusion:

- `Both` → start with shared UI or a shared port contract;
- `UXP only` → start with the UXP adapter / host bridge, or shared code that
  renders differently in the UXP WebView;
- `Chrome only` → distinguish Chrome shell defect, simulator fidelity gap,
  capability difference, or expected degradation; do not default to editing
  shared UI;
- `Unknown` / cross-layer → do not force a classification; investigate first.

Owner hypotheses are initial, not verdicts:

- shared UI (`apps/app/src/shared/ui`);
- ports / application contract (`apps/app/src/shared/ports`, the
  `@imagen-ps/application` seam);
- UXP adapter / host bridge (`apps/app/src/adapters/uxp`, `shells/uxp`);
- Chrome adapter (`apps/app/src/adapters/chrome`);
- Photoshop simulator (`apps/app/src/simulators/photoshop`);
- composition / shell (`apps/app/src/composition`, `apps/app/src/shells`).

## 4. Architecture Guardrails

Stable, UI-fix-specific rules. Everything else follows repo `AGENTS.md`,
`apps/app/AGENTS.md`, `scripts/policy/`, and `docs/TESTING.md`; on conflict,
authoritative docs win.

- Shared UI must not depend on a specific runtime or adapter. Runtime
  differences are expressed through `capabilities`, ports, or adapters — never
  `runtime` / `adapter` / `host.kind` branches (policy-enforced).
- A shared contract change (port or application seam) must be checked against
  both runtimes.
- The simulator is not proof of real Photoshop behavior; fake UXP tests and
  builds are not host IO proof.
- Real UXP host behavior (writeback, secureStorage, persistence) requires real
  Photoshop smoke or equivalent evidence.
- Do not add host-identity branching to shared UI to patch a single-runtime
  symptom.
- Fallbacks are context-dependent: in-memory degradation is expected in
  non-UXP test contexts; the same module missing inside real Photoshop is a
  config, assembly, or host error, not silent degradation.

## 5. Execution Freedom

The agent chooses reproduction, log analysis, search, test design, root-cause
localization, and the fix itself freely. This skill constrains only owner
boundary, acceptance evidence, and regression scope.

## 6. Minimal Harness Contract

Every fix must keep at least one repeatable before/after check. It may be an
automated test or a named manual smoke, but it must state input, expected
result, and evidence.

```text
Baseline (before, fails how):
Acceptance oracle (passes when):
After-fix result:
Regression scope:
Commands or manual steps:
Evidence:
Unverified claims:
```

Core rule: the same check must explain why it failed before and why it passes
after. A set of green tests that never covered the symptom is not acceptance.

## 7. Post-fix Review

After the fix:

- the diff stays inside the framed boundary; no unrelated refactors or
  drive-by changes;
- any change to a port, capability, or user-visible contract was reviewed;
- no runtime-specific branch was added to shared UI;
- the original before/after check passes;
- the other runtime is regressed per Section 8;
- any UXP-only claim needing real host proof is flagged as manual evidence, not
  asserted as CI evidence.

## 8. Regression Selection

By touched layer:

- shared UI / ports / application contract → regress UXP and Chrome;
- UXP adapter / host bridge / persistence → relevant automated tests plus real
  UXP smoke;
- Chrome adapter / simulator → browser adapter tests and Chrome E2E;
- composition / shell / startup → build and startup assembly for both
  entrypoints;
- style-only change → at least verify key pages in both runtimes show no layout
  or interaction regression.

Run categories and commands follow `docs/TESTING.md`. Do not cite `pnpm lint`
as a gate.

## 9. Stop Rules

Stop and escalate (Decision Packet with A/B/C choice, evidence, and recommendation) only
when:

- no acceptance oracle can be defined;
- the fix must leave the authorized owner boundary;
- the fix changes a public contract or architectural responsibility;
- a real-UXP-behavior claim has no real host evidence.

Otherwise keep investigating and fixing; do not stop lightly. A normal UI bug
may legitimately adjust UI or host bridge behavior within boundary.

## 10. Final Report

```text
Classification:
Root cause:
Files changed:
Boundary impact:
Harness evidence:
UXP result:
Chrome result:
Remaining risks:
```
