# Provider-Bounded Image Pipeline & Resource Lifecycle Hardening

Status: active
Authority: current user authorization on 2026-06-29; not a standing root `AGENTS.md` declaration
Owner: `apps/app`, `packages/application`, `packages/core-engine`, `packages/providers`
Created: 2026-06-29

## Context Docs

- Current authority: root `AGENTS.md`, `docs/agent/LOOP.md`, `docs/TESTING.md`, `docs/ENGINEERING_CONTEXT.md`, package `AGENTS.md` files.
- Historical reference: `docs/dev-memory/memories/architecture/image-ownership-peak-memory-audit.md`.
- Adobe local docs: repo-local `.local/share/uxp*` under the project checkout,
  not `$HOME/.local/share/uxp*`.

## Goal

Bound provider-facing image bytes by a single Provider input policy, remove long-lived inline output image payloads, and add lifecycle cleanup/contracts covered by mock-only tests plus documented Photoshop host smoke steps.

## Authority Note

Root `AGENTS.md` still owns standing active-loop declarations. This Loop is
executable only for the current user-authorized sprint. Future agents must not
treat this file as active unless root `AGENTS.md` points to it or a later user
turn explicitly re-authorizes it.

## Product Decision Correction

The pasted sprint text said small images must not upscale. That is superseded by the current user decision:

- Provider-bound raster input has a global minimum long side of `1024`.
- Provider-bound raster input still uses the selected Provider/Profile maximum long side as the ceiling.
- Images smaller than the minimum are upscaled to satisfy the minimum, unless that would exceed the Provider maximum.
- Missing or invalid Provider/Profile max-side remains a configuration error before expensive pixel read/encode.
- Photoshop source/placement geometry remains independent from provider input pixels.

Terminology:

- `effectiveProviderMaxSide`: selected Provider/Profile maximum long-side ceiling.
- `providerInputMinSide`: global minimum long side, currently `1024`.
- `providerInputPlan`: `{ sourceWidth, sourceHeight, targetWidth, targetHeight, scale, minSide, maxSide, multiple, wasResized, wasUpscaled, wasDownscaled }`.

## Non-Goals

- No unrelated UI redesign.
- No provider architecture rewrite.
- No JavaScript upscale of provider output back to Photoshop source frame.
- No claim of real Photoshop memory proof from jsdom/fake UXP tests.

## Scope

Allowed:

- `apps/app/src/shared/image/`
- `apps/app/src/shared/domain/`
- `apps/app/src/shared/ports/`
- `apps/app/src/shared/ui/`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- `apps/app/src/simulators/`
- `packages/application/src/`
- `packages/core-engine/src/`
- `packages/providers/src/`
- focused tests under touched packages.

Forbidden:

- Live provider smoke as a default gate.
- Real Photoshop smoke claims unless actually run.
- Persistent storage of raw image payloads in docs or logs.

## Ownership Boundary

- `apps/app` owns host IO, Photoshop/UXP reads, local file ingest, previews,
  placement, and UI calls into the application port.
- `packages/application` owns session/controller orchestration, request mapping,
  stored asset resolution, retry/cancel boundaries, and history materialization
  hooks.
- `packages/core-engine` owns job lifecycle, terminal output shape, dispatch
  hooks, and snapshot behavior.
- `packages/providers` owns provider config schema, canonical request
  validation, transport request builders, response parsers, and provider-family
  diagnostics.

Provider adapters must not own host storage, UI state, local paths, or
Photoshop/UXP IO.

## Baseline

Before claiming implementation success, establish current failure/success state
with the narrow validation commands below. Existing failures must be attributed
before they are used as evidence for or against this Loop.

Current known documentation correction:

- Historical `docs/loops/2026-06-28-photoshop-frame-placement.md` used
  `maxSide: 1028` and “small images stay original size” as the capture/upload
  sizing context. Provider-bound input sizing in this Loop supersedes that
  provider-input assumption.
- Historical placement guidance that provider output should not be upscaled in
  JavaScript remains valid: Photoshop placement geometry is still separate from
  provider input pixels.

## Slices

1. Provider input policy contract:
   Define and test one provider-bound raster input plan with `minSide: 1024`,
   selected Provider/Profile `maxSide`, dimension multiple, and explicit
   invalid-config errors.

2. Host ingest normalization:
   Thread the policy through Photoshop capture, layer/mask reads, selection
   composites, and local file ingest without preserving raw full-size pixels in
   long-lived state.

3. Dispatch and output lifecycle:
   Resolve stored input bytes under a bounded image-work path and materialize
   provider output before terminal job output, snapshots, React state, durable
   history, or retry state can retain inline base64 image payloads.

4. Cleanup and cancellation:
   Add supported UXP temp/durable asset deletion paths and bounded cleanup for
   provider-input and placement temp files. Mark real Photoshop cleanup proof as
   manual-only unless host smoke is run.

5. Documentation writeback:
   Update durable engineering docs only for stable facts proven by code, tests,
   or local Adobe documentation. Do not store execution logs or raw payloads.

## Validation

Per-slice:

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx tests/use-conversation.test.tsx
pnpm --filter @imagen-ps/application test -- runtime.test.ts
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/providers build
pnpm --filter @imagen-ps/app build
```

Final:

```bash
pnpm validate
git diff --check
```

Manual-only:

- `HOST_SMOKE_UNVERIFIED` unless UXP Developer Tool + Photoshop are run in this turn.

## Decision Packet Triggers

- If local file downsample cannot be implemented without unsupported UXP/browser APIs, stop and document the unsupported native path instead of inventing a decoder.
- If `placeEvent` embedded-vs-linked behavior cannot be evidenced beyond Adobe's embedded Smart Object guidance, keep temp cleanup conservative and mark host smoke required.

## Completion Report

Report:

- goal executed;
- files inspected;
- files changed;
- commands run and results;
- host smoke status, explicitly `HOST_SMOKE_UNVERIFIED` if not run;
- remaining risks or Decision Packets.

## Memory Note Candidate

Write a `docs/dev-memory/` note only if the completed work leaves stable,
reusable engineering knowledge that does not belong more naturally in
`docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, package docs, or tests.
