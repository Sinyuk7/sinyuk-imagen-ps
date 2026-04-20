# AGENTS.md — core-engine

## Overview

Host-agnostic execution runtime: job lifecycle, workflow dispatch, event emission. Pure logic — no DOM/UXP/FS.

---

## Structure

```
src/
├── types/          # Shared contract types (Job, Workflow, Provider, Asset, Error)
├── errors.ts       # Structured error factories for failure taxonomy
├── invariants.ts   # Runtime boundary guards (serializable, deepFreeze)
└── index.ts        # Public API barrel export
```

---

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add new shared type | `src/types/*.ts` | One file per domain (job, workflow, provider, assets, errors) |
| Create error factory | `src/errors.ts` | Use `createJobError()` with taxonomy category |
| Add invariant guard | `src/invariants.ts` | Must throw with descriptive path on violation |
| Implement job store | Create `src/store.ts` | Use zustand/vanilla, NOT React state |
| Implement workflow runner | Create `src/runner.ts` | Sequential steps, immutable handoff |
| Implement provider dispatch | Create `src/dispatch.ts` | Schema validation → invoke → envelope |

---

## Critical Rules (HARD BLOCKERS)

### tsconfig Constraint
```json
{ "lib": ["ES2022"] }
```
- **NO** `DOM`, `DOM.Iterable`
- **NO** `document`, `window`, `structuredClone`
- **NO** UXP APIs (`photoshop`, `uxp`)

### Host-Agnostic Enforcement
- **NO** direct file system access (use `AssetIOAdapter`)
- **NO** network calls (providers handle their own HTTP)
- **NO** provider-specific logic (providers own semantics)
- **NO** parameter interpretation (engine validates schema, nothing more)

### What Engine Does
- Orchestrate workflow execution
- Dispatch to registered providers
- Emit lifecycle events via mitt
- Manage job state via zustand/vanilla

### What Engine Does NOT Do
- UI rendering
- Host document manipulation
- Binary asset storage
- Provider-specific transforms

---

## Type Contracts

All types MUST remain:
- **Serializable**: `assertSerializable()` guards workflow outputs
- **Immutable**: `deepFreeze()` at step boundaries
- **Structured**: Failures use `JobError` with taxonomy category

---

## Anti-Patterns

- `as any` / `@ts-ignore` → NEVER
- Browser globals (`fetch` without adapter) → FORBIDDEN
- Mutable step context → REJECTED
- Silent error swallowing → THROWS or returns `JobError`
- `JSON.stringify` for serialization check → Use `assertSerializable()`

---

## Docstring Format

```ts
/**
 * Execute a workflow step using provider dispatch.
 *
 * INTENT: Run single step, return result
 * INPUT: stepSpec, executionContext
 * OUTPUT: StepResult
 * SIDE EFFECT: Emits job:running event
 * FAILURE: Throws or returns structured error
 */
```

---

## Failure Taxonomy

Use these categories in `createJobError()`:

| Category | When |
|----------|------|
| `configuration_error` | Missing registry, bad setup |
| `validation_error` | Input fails schema |
| `workflow_definition_error` | Invalid workflow spec |
| `provider_error` | Provider timeout, remote failure |
| `asset_io_error` | Adapter read/write failure |
| `host_capability_error` | Missing permissions (UXP), unsupported browser API |
| `cancellation_error` | Reserved for v2 |

---

## Testing Notes

- Engine tests run WITHOUT browser
- Mock providers via `ProviderDefinition` interface
- Mock adapters via `AssetIOAdapter` interface
- Verify lifecycle: `created → running → completed|failed`
