---
name: openspec-refine
description: Review and optionally refine OpenSpec changes before implementation. Use when the user asks to review, refine, harden, validate, or improve an OpenSpec change, especially proposal.md, design.md, tasks.md, and specs/. Defaults to review-only unless the user explicitly asks to edit files.
license: MIT
compatibility: Requires an OpenSpec project and access to file/terminal tools.
metadata:
  author: local
  version: "1.1"
---

# OpenSpec Refine

Quality-gate an OpenSpec change before implementation. Check whether the change is clear, consistent, implementable, and aligned with existing project conventions.

## Modes

Choose the lightest mode that satisfies the request.

| Mode | Trigger | Behavior |
|---|---|---|
| Quick Review | review, findings, quality check, “do not modify” | Read artifacts, output findings, stop. |
| Deep Review | deep review, architecture review, best-practice comparison, unfamiliar external API/platform | Quick Review plus targeted research or deeper local comparison. |
| Apply Fixes | modify, refine, rewrite, update, apply findings | Review first, edit minimally, then validate. |

Default to Quick Review when intent is unclear.

## Principles

- Do not edit files unless the user explicitly asks.
- Avoid ping-pong. Ask only when missing information blocks correctness.
- Prefer one complete findings report over step-by-step approval loops.
- Use available file/terminal tools directly; shell commands are examples of intent, not text to echo.
- Keep `spec.md` normative; put rationale and discussion in `proposal.md` or `design.md`.
- Keep `tasks.md` implementation-focused; do not use it for research notes or design debate.
- Keep `design.md` focused on decisions, alternatives, rationale, dependencies, and failure handling.
- Treat web research as targeted fallback, not the default path.

## Workflow

### 1. Resolve Target

Identify the OpenSpec change.

Inspect as needed:

- `openspec/changes/`
- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/specs/**`
- related `openspec/specs/**`
- local conventions: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, local skills/prompts, or equivalents

If multiple candidate changes exist and the user did not identify one, ask which change to review.

Do not stop only to ask for a GitHub Issue. If the user already gave one, preserve it. If not, skip issue links.

### 2. Review Matrix

Review once across these dimensions instead of running separate repeated passes.

| Dimension | What to Check |
|---|---|
| Scope Alignment | Proposal, design, specs, and tasks describe the same boundaries. Non-goals do not contradict required behavior. |
| Normative Quality | Requirements use MUST/SHOULD/MAY where useful. Each requirement has at least one concrete scenario. |
| Behavior Coverage | Success, failure, fallback, edge cases, lifecycle, permissions, rollback, and error handling are explicit when relevant. |
| Design Soundness | Responsibilities are separated. Dependencies point in a safe direction. Circular dependency and hidden global state risks are addressed. |
| Alternatives | Major design decisions explain selected and rejected approaches. Missing alternatives on a major decision is P0/P1. |
| Tasks | Tasks are ordered, implementable, testable, and mapped to spec/design behavior. |
| Reuse/Commonality | Existing specs, adapters, utilities, services, or patterns are reused or deliberately extended. Duplication is justified. |
| Operations | Config values, paths, URLs, thresholds, feature flags, provider/model names, and external dependencies have an ownership or externalization strategy. |
| Verification | Validation, tests, examples, manual checks, or acceptance criteria are defined at the right depth. |

### 3. Research Policy

Do not research by default.

Use targeted web research only when:

- the user explicitly requests it
- the change depends on a specific external library, API, standard, platform, or version-sensitive behavior
- a factual claim in the artifacts needs verification
- the design domain is unfamiliar or likely to have changed recently

When researching, prefer official docs, standards, source repositories, and primary references. Use findings for comparison, not as material to copy blindly.

### 4. Severity

| Priority | Meaning |
|---|---|
| P0 Required | Blocks implementation readiness, validation, correctness, safety, or artifact consistency. |
| P1 Recommended | Likely to cause maintainability, duplication, testing, integration, or future refactor cost. |
| P2 Optional | Improves clarity, ergonomics, future-proofing, or documentation quality. |

For trivial changes, use compact bullets. For architecture-level changes, use the full issue format.

### 5. Output Findings

For Quick Review and Deep Review, stop after the report.

```markdown
## Verdict
Ready / Needs fixes / Blocked

## Top Findings
- P0: ...
- P1: ...
- P2: ...

## Detailed Findings
### Issue: <summary>
- Current: <missing, ambiguous, inconsistent, or risky behavior>
- Proposed: <specific fix>
- Priority: P0/P1/P2
- Affected artifacts: <proposal/design/spec/tasks/etc.>

## Suggested Next Action
<one concise recommendation>
```

Use `Blocked` only when the target change or required source artifacts cannot be identified.

### 6. Apply Fixes

Only enter this mode when the user explicitly asks to modify artifacts.

Rules:

- Make minimal edits; do not rewrite whole files unless necessary.
- Preserve user terminology and structure unless it causes ambiguity.
- Add `Related: #<number>` or `Closes: #<number>` only if the user provided an issue number.
- Propagate changes deliberately:
  - design behavior changes may require spec scenarios
  - interface changes may require task updates
  - scope changes may require proposal/spec/task alignment
- Do not put research notes, rationale, or comparisons into `spec.md`.
- If a file is too large, recommend splitting before doing a broad restructure.

### 7. Validate

After edits, validate the change.

Intent:

```bash
openspec validate <change-id> --strict
```

If validation fails, read the error, fix only the validation-related issue, and rerun. If validation cannot run, report why and provide the exact command for the user.

## Common Findings Checklist

Flag these when present:

- `spec.md` contains background or design discussion.
- Requirements lack scenarios.
- Artifacts disagree on scope.
- Failure, fallback, rollback, or error behavior is missing for a non-trivial change.
- Multi-component changes lack design rationale.
- Major decisions have no alternatives or rejected approaches.
- Dependency direction is unclear or circular.
- Existing overlap was not checked before creating a new abstraction.
- Duplicate implementation is proposed without justification.
- Project conventions were ignored.
- Operational values are hardcoded without ownership or externalization.
- Tasks are too broad to implement or verify independently.
