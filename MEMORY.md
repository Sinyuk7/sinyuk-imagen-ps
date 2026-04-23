# MEMORY.md

## Project State

Monorepo bootstrapped with pnpm workspace + Turborepo.
Current structure is `app/ + packages/*`.

Active change: `bootstrap-ai-image-system-foundation`.

---

## Key Decisions

### structuredClone is unavailable in core-engine

`tsconfig.base.json` uses `lib: ["ES2022"]`. `structuredClone` type lives in DOM lib.
Adding DOM to base config would violate engine's host-agnostic constraint.
Resolution: use recursive structural validation instead of `structuredClone` or JSON round-trip.

### assertSerializable uses structural walk, not JSON round-trip

`JSON.stringify` silently handles non-serializable values.
Resolution: explicit recursive type checking with descriptive error paths.

### deepFreeze must be cycle-safe

Public utility accepting `unknown` must handle cyclic input.
Resolution: use `WeakSet` to track visited objects.

### Single-app structure is intentional

The repository keeps a single application directory: `app/`.
This version does not include a `web` application.

---

## Package Map

| Module | Layer | Purpose |
|--------|-------|---------|
| `app` | host/app | Photoshop plugin application |
| `@imagen-ps/core-engine` | engine | Job lifecycle, types, invariant guards, runtime |
| `@imagen-ps/providers` | provider | Provider registry + concrete provider boundary |
| `@imagen-ps/workflows` | workflow | Declarative workflow specs |

---

## Remaining Work

Section 1 (Shared Contracts And Scaffolding) - partly done.
Section 2 (Core Contract Implementation) - continue runtime / provider / workflow convergence.
Section 3 (Host Contract Implementation) - blocked on shared command surface becoming clearer.
Section 4 (Contract Verification And Hardening) - blocked on Section 2+3.
