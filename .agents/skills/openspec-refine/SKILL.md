---
name: openspec-refine
description: >
  Expand and harden an existing OpenSpec change from brief initial artifacts into an
  implementation-ready contract. Use after initial artifact generation when specs need
  deeper behavioral coverage, cross-artifact gaps must be resolved, or tasks and validation
  still leave implementation choices ambiguous. Always review and present one complete
  Refinement Plan before modifying any artifact; apply changes only after user approval.
---

# OpenSpec Refine

Turn brief OpenSpec artifacts into an implementation-ready change contract.

Focus on removing ambiguity that can change correctness, compatibility, ownership, or
acceptance results. Do not expand artifacts merely to add detail. Success means a later
implementation agent can follow the artifacts without inventing observable behavior.

## Operating Contract

Use exactly two phases.

### Phase 1: Review and Plan

1. Resolve the change and read its artifacts, relevant formal specs, repository evidence,
   and project rules.
2. Build a canonical model of the change and find gaps, ambiguity, contradictions, and
   missing coverage.
3. Present one complete, dependency-ordered `Refinement Plan`.
4. State exactly which artifacts would change, what would be added or corrected, and why.
5. Do not modify any file.

Do not interrupt analysis with piecemeal approval questions. Collect every required user
decision in the complete plan so the user can approve the direction once.

### Phase 2: Apply Approved Plan

Enter this phase only after the user approves the complete plan.

1. Apply only the approved changes.
2. Propagate each decision across every affected artifact.
3. Run forward and reverse coverage checks.
4. Run structural, semantic, and applicable repository validation.
5. Report actual changes, validation evidence, and remaining open questions.

If new evidence invalidates an approved direction, stop before guessing. Present one
consolidated plan delta for approval.

## Phase 1 Procedure

### 1. Resolve the Change

Run:

```bash
openspec status --change "<name>" --json
```

Use the returned schema, planning scope, action context, artifact paths, and artifact states.
Do not assume every schema uses the same file names or locations. When available, load the
current schema instructions for relevant artifacts:

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

Read:

- every existing change artifact required by the resolved schema;
- related formal specs;
- applicable repository and module instructions;
- relevant architecture and testing rules;
- current contracts, types, implementation, callers, and downstream consumers;
- existing tests and harnesses;
- similar modules, domain skills, and historical changes when they provide useful precedent.

Separate current behavior from intended change behavior. A difference from current code is
not a defect when the change intentionally introduces it.

Classify important evidence:

- **Confirmed Fact**: directly supported by current source, tests, formal specs, or project
  rules.
- **Bounded Inference**: supported by evidence but not directly guaranteed; state the bound.
- **Open Question**: cannot be resolved from available evidence and needs a decision.

Use external research only when an important claim depends on an external API, standard,
version-specific behavior, new dependency, or other fact the repository cannot establish.
Prefer primary official sources. Do not use web search as a default refinement step.

Before proposing new behavior, ownership, helpers, or tasks, inspect existing specs, shared
components, services, utilities, harnesses, and similar changes. Prefer reuse or extension
when it preserves the intended contract. When proposing something new, explain why existing
paths cannot own it without distortion or unauthorized coupling.

### 2. Build the Canonical Change Model

Build this traceability chain in working context:

```text
Capability -> Requirement -> Scenario -> Design Decision -> Task -> Validation
```

Do not create a separate artifact solely for this model unless the user requests one. Use it
to perform both checks:

#### Forward Coverage

Confirm that each capability and requirement has sufficient:

- scenarios covering observable behavior;
- design support when an architectural decision is needed;
- implementation work or an explicit existing-behavior basis;
- validation evidence or a planned validation path.

#### Reverse Coverage

Confirm that:

- design does not introduce behavior without requirement support;
- tasks do not silently expand scope;
- test and validation tasks trace to requirements or project rules;
- observable behavior does not exist only in design or tasks;
- no task is orphaned;
- no requirement lacks an implementation path.

### 3. Review Artifact Depth

#### `proposal.md`

Keep the proposal concise by default. Plan changes only when any of these are unclear or
missing:

- problem and objective;
- scope, non-goals, or impact;
- affected capabilities;
- breaking changes or compatibility impact.

Do not move detailed behavioral contracts into the proposal.

#### `specs/**`

Treat specs as the primary expansion target. Evaluate every dimension below and record one
judgment: `Covered`, `Missing`, `Not Applicable`, or `Needs Decision`.

- normal behavior;
- input boundaries;
- invalid, missing, or partial input;
- state transitions;
- ownership and precedence;
- failure, fallback, and retry;
- repeated operations, concurrency, and stale results;
- cancel, reset, reload, and recovery;
- legacy compatibility;
- runtime or environment differences;
- behavior that must explicitly never occur.

Add content only for relevant missing dimensions, but make every judgment deliberately.
Every normative requirement must have enough concrete scenarios to define its observable
contract. Keep function names, file paths, helper structures, and other internal
implementation details out of specs.

#### `design.md`

Expand design according to risk and complexity, not desired length. Check:

- ownership and dependency direction;
- data and control flow;
- important technical decisions;
- failure containment;
- migration, rollback, and cleanup;
- compatibility;
- alignment with existing architecture and shared patterns;
- alternatives and trade-offs for decisions with meaningful choice cost.

Do not require multiple alternatives for routine or already-constrained decisions. If design
is absent, propose creating it only when the change needs architectural decisions that specs
and tasks cannot own.

#### `tasks.md`

Derive task changes from implementation and validation gaps. Add only work required by the
approved contract, which may include:

- implementation;
- automated or integration tests;
- manual validation;
- migration or compatibility work;
- documentation or cleanup;
- final validation.

A change may need only test or validation tasks, or no new implementation tasks. Follow the
project's testing authority; do not hardcode a platform or runtime validation method.

### 4. Identify Refinement Issues

Keep only issues that improve correctness, compatibility, acceptance, ownership clarity, or
traceability. Do not manufacture an issue count and do not repeat equivalent gaps.

For every issue, provide:

```markdown
### <Issue title>
- Current: <current artifact or code state>
- Evidence: <Confirmed Fact, Bounded Inference, or Open Question with source>
- Gap: <missing, ambiguous, or contradictory contract>
- Risk: <different implementation interpretations or acceptance outcomes>
- Proposed direction: <specific behavior or content to lock down>
- Artifact changes: <proposal/spec/design/tasks changes, including no-change decisions>
- Validation impact: <validation to add, adjust, or retain>
- Decision required: <user choice, or No>
- Priority: <P0, P1, or P2>
```

Use priorities as severity metadata, not plan order:

- **P0**: blocks a correct implementation or permits incompatible observable behavior.
- **P1**: creates material correctness, compatibility, ownership, or validation risk.
- **P2**: improves clarity or maintainability without blocking implementation.

Avoid abstract directions such as "add error handling." State the concrete behavior and the
artifact-level change the user is approving.

### 5. Produce the Refinement Plan

Order the plan by dependency:

1. Scope and objective problems
2. Key behaviors requiring user decisions
3. Spec expansion
4. Design additions
5. Task and validation additions
6. Documentation-only cleanup

For each plan item, reference its issue, target artifacts, proposed content, dependencies,
and validation impact. Include:

- a concise canonical change model summary;
- forward and reverse coverage gaps;
- all decisions the user must make;
- explicit artifacts that will remain unchanged;
- a single request to approve the complete plan and provide any listed decisions.

Do not edit files during this phase.

## Phase 2 Procedure

### 1. Apply the Approved Plan

Make minimal, purposeful edits. Expand thin sections when needed to lock down behavior, but
do not rewrite unaffected content. Keep artifact responsibilities distinct:

- proposal owns intent, scope, capabilities, and impact;
- specs own normative observable behavior;
- design owns technical decisions, flows, and trade-offs;
- tasks own implementation and validation work.

Propagate cross-artifact decisions in dependency order. Do not add unapproved scope.

### 2. Validate

Run all three validation layers.

#### Structural Validation

Run strict OpenSpec validation using the syntax supported by the local CLI, normally:

```bash
openspec validate "<change-name>" --type change --strict --json
```

This proves schema and structural validity only.

#### Semantic Validation

Rebuild the canonical change model and confirm:

- capability, requirement, and scenario coverage is sufficient;
- no blocking ambiguity remains;
- design and tasks trace to requirements;
- each key behavior has an appropriate validation path;
- no scope expansion or orphan content exists;
- every approved issue is resolved or explicitly reported as remaining.

#### Repository Validation

Select build, unit, integration, policy, manual, release, or opt-in live checks from current
project rules and the actual change surface. The skill identifies and orchestrates relevant
gates; it does not prescribe one fixed project, platform, or runtime command.

### 3. Report

Report:

- artifacts changed and the contract added or corrected in each;
- forward and reverse coverage result;
- structural, semantic, and repository validation commands and outcomes;
- approved plan items not completed, with reasons;
- remaining open questions or residual risks.

If review finds no material gap, report that no artifact change is needed. Do not create
documentation churn.

## Readiness Gate

Declare the change implementation-ready only when:

- scope and intended capabilities are explicit;
- no unresolved P0 issue or blocking user decision remains;
- observable behavior is normative and adequately scenario-covered;
- forward and reverse coverage checks pass;
- ownership and important design choices are clear;
- tasks cover required implementation and validation work without expanding scope;
- every key behavior has an appropriate validation path;
- structural validation passes and applicable semantic and repository checks are accounted
  for.

Otherwise report the exact remaining blockers.
