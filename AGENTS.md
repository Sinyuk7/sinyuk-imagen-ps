# AGENTS.md

## Boot

* Read AGENTS.md
* Read MEMORY.md if exists
* Inspect only relevant files
* Prefer modify over create
* Keep changes minimal

---

## Priority

* User > MEMORY.md > AGENTS.md > existing code

---

## Mission

* Write correct, minimal, maintainable code
* Keep code clear, compact, explicit
* Fit existing structure
* Respect system boundaries (Engine / Provider / Host)

---

## System Awareness (REQUIRED)

Before coding, identify target layer:

* `core-engine` → execution runtime (pure logic)
* `providers` → API mapping + validation
* `workflows` → declarative execution spec
* `apps/*` → UI + host integration
* `adapters` → IO / environment bridge

Rules:

* Engine MUST remain host-agnostic
* Provider owns parameter semantics
* Workflow is declarative, not executable logic
* IO only allowed via adapters

---

## Non-negotiables

* Clarity > cleverness
* Explicit > implicit
* Small files > large files
* Deterministic > hidden magic
* Simple flow > deep helpers
* Isolation > shared mutable state

---

## Code Rules

* Use clear names
* Keep control flow shallow
* Avoid unnecessary abstraction
* Avoid hidden state
* No silent fallback
* Separate logic from I/O
* Match existing good patterns
* Do NOT mix layers (Engine / Provider / Host)

---

## Engine Rules (CRITICAL)

Applies to `core-engine`:

* No DOM / Browser / UXP API
* No file system access
* No network calls
* No provider-specific logic
* No parameter interpretation

Engine only:

* orchestrates workflow
* dispatches provider
* emits events
* manages state

---

## Provider Rules

Applies to `providers`:

* Own full parameter semantics
* Validate using schema (e.g. Zod)
* Map external API ↔ internal input
* No UI logic
* No engine logic

---

## Workflow Rules

* Workflow = declarative spec
* No embedded business logic
* No direct side effects
* No runtime state mutation

---

## Adapter Rules

* All IO MUST go through adapters
* No direct FS / network in core logic
* Handle host differences (Web vs UXP)
* Be explicit about limitations

---

## File Rules

* Large file = bad design → split
* Split by responsibility
* Prefer small focused modules
* Target: file ≤ 300 LOC
* Target: function ≤ 50 LOC

---

## Function Rules

* One function = one clear job
* Call chain must be traceable
* No vague helpers unless clear
* Failure must be explicit
* Input/output must be explicit

---

## Docstring (REQUIRED)

Format for core functions:

```
"""Execute a workflow step using provider dispatch.

INTENT: 执行单个 workflow step 并返回结果
INPUT: stepSpec, executionContext
OUTPUT: StepResult
SIDE EFFECT: Emits job:running event
FAILURE: Throws explicit error or returns failure result
"""
```

---

## Docstring Rules

* First line = short summary
* INTENT = purpose (why this exists)
* INPUT / OUTPUT = exact types
* SIDE EFFECT = explicit or None
* FAILURE = concrete behavior
* Must explain role in execution chain

---

## Comments

* Short and useful
* Explain intent, not obvious code
* Reference project modules when needed:

```ts
// see: packages/core-engine/executor.ts
// related: providers/flux.ts
```

* Remove stale comments

---

## Side Effects

* Must be explicit
* Keep at system boundaries (Adapters / Providers)
* Engine must remain pure
* No hidden IO

---

## Types

* Prefer strong types
* Express domain meaning
* Avoid weak containers (any / loose objects)

---

## Errors

* No silent failure
* Handle or surface explicitly
* Log only when meaningful
* Default only if intentional and documented

---

## State

* No hidden globals
* No implicit memory
* Explicit ownership only
* No cross-step mutation

---

## Changes

When modifying code:

* Keep change minimal
* Do not introduce new abstractions unless necessary
* Reuse existing patterns
* Preserve system boundaries
* Do not “improve” unrelated code

---

## Done Checklist

* MEMORY.md read (if exists)
* Layer respected (Engine / Provider / Host)
* Change minimal
* Code clearer than before
* Side effects explicit
* Failure defined
* No boundary violations
