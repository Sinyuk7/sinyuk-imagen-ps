---
name: uxp-boundary-reviewer
description: Review or plan repository Photoshop UXP boundary changes. Use for apps/app React-to-application seams, HostBridge behavior, UXP storage, secureStorage, data folder adapters, manifest permissions, Photoshop writeback, fake UXP tests, or real UXP Developer Tool host smoke planning.
---

# UXP Boundary Reviewer

Separate repo-side app harness proof from real Photoshop / UXP host proof.

## Required Context

Read:

- `apps/app/AGENTS.md`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- relevant files under `apps/app/src/host` or `apps/app/tests`

Use `docs/dev-memory/memories/workflow/uxp-host-debug-prep.md` only when the
task needs manual Photoshop / UXP host smoke planning.
Classify each doc per `docs/agent/LOOP.md` Document Authority before reading;
do not treat completed Loops as active plans.

## Review Procedure

1. Classify the behavior:
   - fake-testable app/service behavior;
   - fake UXP module / adapter behavior;
   - real Photoshop / UXP host-only behavior.
2. Keep app ownership clear:
   - UI calls `AppServices.commands` for application/session behavior;
   - Photoshop / UXP IO stays under `src/host/` or injected adapters;
   - app does not import `@imagen-ps/core-engine`, `@imagen-ps/providers`, or
     `@imagen-ps/cli`.
3. For storage changes, check data folder / secure storage / temporary folder
   semantics before claiming persistence.
4. For writeback changes, check `executeAsModal`, temporary file, session token,
   and `batchPlay` boundaries.
5. Never convert a fake UXP test or Vite build into a claim that real Photoshop
   host IO passed.

## Validation

Use as appropriate:

```sh
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test
pnpm check:policy
pnpm validate
```

Manual-only validation requires UXP Developer Tool + Photoshop and must be
reported as manual evidence, not default CI evidence.

## Stop Conditions

Stop and produce a Decision Packet using `docs/loops/_decision-packet.md` when:

- a claim requires real Photoshop host proof and no manual gate is approved;
- the app needs direct core-engine/provider/CLI imports;
- UXP code needs private APIs or persistent native paths;
- provider network permission policy needs product or packaging decisions.
