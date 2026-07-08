---
name: openspec-refine
description: >
  A quality review skill that refines existing OpenSpec changes to implementation-ready quality.
  Performs cross-artifact consistency checks on proposal/design/tasks/specs, code-grounded
  commonality analysis, and targeted best-practice validation when external contracts or
  platform behavior need it. Use after proposal creation, before implementation, or when
  an existing change needs a deeper quality pass than a quick spec review.
---

# OpenSpec Refine

A review skill that refines OpenSpec changes to implementation-ready quality.

Prefer checking current code, tests, and harnesses over trusting project docs by themselves.
Use docs as guidance, then verify important claims against implementation.

## Step 1: Context Collection

```bash
openspec status --change "<name>" --json
```

Read the resolved artifacts for the target change:
- `proposal.md`, `tasks.md`, `design.md`, `specs/`
- related current code, tests, and harnesses for the same area
- nearby existing changes or specs with similar behavior

Useful project guidance:
- `docs/TESTING.md`
- relevant `AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md` when ownership, dependency direction, or runtime limits matter

For Adobe / UXP topics, search local official documentation mirrors before relying on memory:
- `.local/share/uxp-photoshop`
- `.local/share/uxp`
- `.local/share/uxp-photoshop-plugin-samples`

If a document or artifact looks stale, ambiguous, or too abstract, inspect the current implementation and tests directly.
If the investigation naturally splits into multiple independent code-reading lanes and the environment supports it, use read-only explorers to inspect those lanes in parallel.

### Related Skill/Convention Check (Required)

1. Check the project's instruction files, skills, and nearby implementation patterns matching the proposal area
2. Verify the change follows established patterns in current code and tests, not only in documents
3. Document deviations with rationale

## Step 2: Analysis and Review

### Cross-Artifact Scope Consistency (Required)
- [ ] Features listed in proposal scope are not contradicted by design Non-Goals
- [ ] Normative behavior defined in design (e.g. fallback, error handling) is also captured in spec with scenarios
- [ ] Scope boundaries are consistent across proposal, specs, design, and tasks
- [ ] Important claims still match current implementation or are clearly marked as intended changes

### Required Checklist
- [ ] spec.md uses normative language (MUST/SHOULD/MAY) where requirements are intended to be normative
- [ ] Each Requirement has at least one `#### Scenario:`
- [ ] Acceptance criteria are concrete (Given/When/Then preferred)
- [ ] Failure behavior is explicitly defined
- [ ] tasks.md is broken down into implementable granularity
- [ ] No hardcoded values in design — configuration values, paths, thresholds, and URLs have explicit externalization strategies documented in design.md or tasks.md

### design.md Review (if present)
- [ ] **Separation of concerns**: Which layer/class owns what responsibility
- [ ] **Pattern selection**: Design patterns used and rationale for choosing them
- [ ] **Rejected patterns**: Patterns considered but not adopted, with reasons when the choice is non-obvious
- [ ] **Framework consistency**: Alignment with the existing codebase
- [ ] **Dependencies**: Dependency direction between components (no circular deps)
- [ ] **Commonality analysis**: Investigation of overlap with existing code

### Code-Grounded Gap Sweep (Required)

Do not stop after the first obvious `2-3` issues. Deliberately inspect:
- lifecycle coverage: create / edit / delete / empty / first-run / no-default states
- negative paths: failure, fallback, partial-success, retry, cleanup, orphan states
- state boundaries: runtime vs persisted, session vs durable, local UI state vs shared state
- owner boundaries: `apps/app` vs `packages/application` vs `packages/core-engine` vs `packages/providers` vs `packages/foundation`
- validation gaps: what current tests or harnesses already prove, and what they do not prove
- reuse gaps: where the proposal/design ignores existing code paths or helpers

### When design.md Is Needed
Propose creating design.md if any of these apply but design.md is absent:
- Changes span multiple components or layers
- New patterns or architectural decisions are needed
- Deviation from existing design conventions is substantial

## Step 2.3: Best Practice Validation (When Needed)

Use this when:
- the design depends on external or unstable contracts;
- platform behavior matters and local code gives no clear precedent;
- the repo has no strong internal pattern for the decision being made.

### 2.3.1 Build Search Themes
From the problem domain in proposal.md and the key technical decisions in design.md, build a short list of themes worth checking.

### 2.3.2 Research Execution
Prefer these inputs first:
- current repo code and tests
- local official docs
- Adobe local mirrors for Photoshop / UXP topics

If those are insufficient and the decision depends on outside behavior, search the web or consult official external docs.

**Fallback**: If live search is unavailable, use model knowledge as a temporary comparison source and label it clearly.

### 2.3.3 Compare Against Current Design
Compare external or local-reference findings against each important decision in design.md. Focus on:
- alignment with proven repo patterns
- better-known patterns when current design is weak
- missing concerns such as validation, telemetry, fallback behavior, or ownership clarity
- alternatives worth considering when the current design is underspecified

Summarize comparison results:
```
| Decision | Evidence / Reference | Alternatives | Gaps |
|----------|----------------------|-------------|------|
| D1: ... | ... | ... | ... |
```

### 2.3.4 Propose Improvement Strategy
When gaps are found:
1. List each gap as an independent improvement item (Current → Proposed → Source)
2. Group them into practical integration options when there are multiple meaningful directions
3. Ask the user before applying a large design rewrite
4. Add the selected improvements as Issues in Step 3

## Step 2.5: Commonality Analysis (P1: Recommended)

May skip for very small changes.

### Investigation Targets
- Related existing specs
- Existing shared components/services/utilities
- Past changes with similar functionality
- Current implementation paths that already solve part of the same problem

### Decision Categories
| Decision | Description |
|----------|-------------|
| Reuse | Use existing component as-is |
| Extend | Extend existing component |
| New (shared) | Create new, place in shared package |
| New (dedicated) | Dedicated to this feature (document rationale) |

## Step 3: Present Improvement Proposals

```
### Issue: [Summary of the problem]
- Current: [What is missing, inconsistent, stale, or weakly evidenced]
- Proposed: [How to fix it]
- Evidence: [Code / tests / docs / external reference]
- Priority: P0 (Required) / P1 (Recommended) / P2 (Nice-to-have)
```

## Step 4: Update Artifacts

After user approval, update the artifacts.

### Update Rules
- **spec.md**: Normative content only. Background, comparisons, and rationale go in proposal.md or design.md
- **spec.md size limit**: Split into `details/*.md` if approaching 400 lines
- **tasks.md**: Implementation tasks only (no spec content)
- **design.md**: Technical decisions, trade-offs, and architecture notes
- **proposal.md**: Update when scope, capabilities, or intended behavior changes
- **Cross-artifact propagation (Required)**: When updating design.md, check whether the changes affect spec.md or tasks.md, and propagate accordingly
- **Minimal edits**: Edit only what is needed, but expand thin sections when they are the reason review quality is weak

## Step 5: Validation (Required)

```bash
openspec validate "<proposal-id>" --type change --strict --json
```

If the local CLI does not support this exact form, use the closest strict `openspec validate` command available.

If the refine pass also changes implementation or policy-checked docs, choose the relevant validation commands from `docs/TESTING.md` (often `pnpm validate`, `pnpm check:policy`, or focused package tests).

## Quality Gate (Fail Conditions)

- spec.md contains background, comparisons, or discussion in normative sections
- Acceptance criteria are vague (e.g. "works without issues")
- Requirements have no Scenarios
- design.md lists pattern names without selection rationale where rationale is needed
- Multi-layer changes have no design.md
- Dependencies are circular or direction is unclear
- No investigation of overlap with existing specs/shared components/current implementation (P1)
- Clear DRY violation — similar implementation exists with no justification for creating new (P1)
- Important claims rely only on stale docs or abstract reasoning without checking current code/tests when that evidence is available
- Configuration values, paths, thresholds, or URLs have no externalization strategy defined (P0)
