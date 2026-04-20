# MEMORY.md

## Project State

Monorepo bootstrapped with pnpm workspace + Turborepo.
All 5 packages build cleanly: `pnpm run build` → 5/5 success.

Active change: `bootstrap-ai-image-system-foundation` (spec-driven, 4/26 tasks done).

---

## Key Decisions

### structuredClone is unavailable in core-engine

`tsconfig.base.json` uses `lib: ["ES2022"]`. `structuredClone` type lives in DOM lib.
Adding DOM to base config would violate engine's host-agnostic constraint.
Resolution: use recursive structural validation instead of `structuredClone` or JSON round-trip.

### assertSerializable uses structural walk, not JSON round-trip

`JSON.stringify` silently handles non-serializable values (functions → dropped, Map/Set → `{}`, class instances → partial).
This defeats the invariant purpose. Fixed to explicit recursive type checking that rejects functions, symbols, bigint, class instances, and cyclic references with descriptive error paths.

### deepFreeze must be cycle-safe

Public utility accepting `unknown` must handle cyclic input. Uses `WeakSet` to track visited objects.

### Vite requires index.html

`apps/web` uses Vite. `vite build` resolves entry from `index.html` in project root, not from `src/main.tsx` directly. Scaffold must include `index.html` referencing the TSX entry.

### Zod is a core-engine dependency

`ProviderDefinition.inputSchema` is typed as `ZodType`. Zod is a runtime dependency of `@imagen-ps/core-engine` (not just devDependency) because provider schema validation happens at runtime.

---

## Package Map

| Package | Layer | DOM? | Purpose |
|---------|-------|------|---------|
| `@imagen-ps/core-engine` | engine | NO | Job lifecycle, types, error factories, invariant guards |
| `@imagen-ps/providers` | provider | NO | Provider registry + concrete providers |
| `@imagen-ps/workflows` | workflow | NO | Declarative workflow specs |
| `@imagen-ps/web` | host/app | YES | Browser job console (React + Vite) |
| `@imagen-ps/ps-uxp` | host/app | NO (UXP) | Photoshop plugin (React panel) |

---

## Remaining Work

Section 1 (Shared Contracts And Scaffolding) — DONE.
Section 2 (Core Contract Implementation) — next: engine store, event bus, workflow runner, provider registry, asset adapter interface.
Section 3 (Host Contract Implementation) — blocked on Section 2.
Section 4 (Contract Verification And Hardening) — blocked on Section 2+3.
