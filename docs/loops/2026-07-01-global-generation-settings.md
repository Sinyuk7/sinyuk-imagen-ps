# Global Generation Settings

Status: draft
Authority: current user authorization on 2026-07-01
Owner: cross-boundary slices under `apps/app`, `packages/application`, and `packages/providers`
Created: 2026-07-01

## Context docs

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `apps/app/AGENTS.md`
- Current authority: `packages/providers/AGENTS.md`

## Goal

Add a global generation settings entry and page, then wire output size, output
format, aspect ratio, and provider input resize into the real app request chain
with mock-only tests and `pnpm validate`.

## Product semantics

- Output size controls provider-returned image size, not input image resize.
- Output size options are `512`, `1K`, `2K`, and `4K`.
- Output size has no `auto` option.
- Default output size is `2K`.
- Output format default is `PNG`.
- Quality has no UI in this slice. Do not pass quality by default unless a
  provider-specific policy later requires it.
- Aspect ratio default is `auto` and belongs in the global settings page.
- Main page should not own an independent aspect-ratio setting. The existing
  main-page aspect-ratio state is a broken request chain and should be replaced
  or removed by the implementation slice.
- Main page may expose output size because it is high-frequency.
- Provider input resize is separate from output size. It controls the size of
  reference/captured images sent into provider edit requests.
- Provider input max side defaults to `2048`.
- Provider input min side remains the current internal default unless a future
  decision explicitly exposes it.

## Non-goals

- No live provider smoke.
- No real Photoshop / UXP host proof.
- No per-provider profile override for global generation settings.
- No output count UI.
- No quality UI.
- No background, moderation, or input-fidelity UI.
- No provider capability or downgrade logic in `apps/app`.
- No broad settings/profile schema redesign.

## Scope

Allowed files and areas:

- `apps/app/src/shared/ui/pages/settings-page.tsx`
- new `apps/app/src/shared/ui/pages/*global-settings*` page/component files
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/hooks/*`
- `apps/app/src/shared/ui/i18n/*`
- `apps/app/src/shared/ports/*`
- app storage adapters under `apps/app/src/adapters/chrome/` and
  `apps/app/src/adapters/uxp/`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- focused tests under `apps/app/tests`, `packages/providers/tests`, and
  `packages/application/src`

Forbidden files and areas:

- Photoshop host IO behavior except passing an existing resize policy value.
- Provider credential handling and secret storage.
- Job lifecycle semantics in `packages/core-engine`.
- Live-provider configuration, credentials, or paid/network smoke.
- Broad UI redesign outside the global settings entry/page and affected
  composer controls.

## Ownership boundary

- `apps/app` owns UI, app settings persistence, the providers action-bar entry,
  and mapping global settings into app-level submit payloads and host input
  resize policies.
- `packages/application` owns session/request binding and task execution
  snapshots. It must not import React, DOM, UXP, Photoshop, or Node host IO.
- `packages/providers` owns canonical provider request fields and provider
  transport mapping, including 4K downgrade and provider-specific wire shape.
- `packages/core-engine` should remain unchanged unless a compile-time type
  boundary requires a narrow extension.

## Baseline

Before implementation:

```bash
pnpm check:policy
```

If baseline fails, report whether the failure is pre-existing. Continue only if
the failure is unrelated to this Loop and does not block attribution.

## Canonical design target

The app should not calculate concrete provider wire dimensions. It should pass a
semantic output contract:

```ts
output: {
  count: 1,
  sizePreset: '512' | '1k' | '2k' | '4k',
  aspectRatio: 'auto' | '1:1' | '16:9' | '9:16',
  outputFormat: 'png' | 'jpeg' | 'webp'
}
```

Provider adapters decide whether the upstream request uses `size`,
`aspect_ratio`, `image_config`, or a combination. The final HTTP body must not
contain contradictory size and ratio parameters for providers where those are
one concept.

## Slices

### Slice 1: App settings contract

Goal: Add global app settings load/save defaults without changing provider
profiles.

Allowed scope:

- app ports and app storage adapters
- app tests and fakes

Expected defaults:

- `outputSizePreset: '2k'`
- `outputFormat: 'png'`
- `aspectRatio: 'auto'`
- `providerInputMaxSide: 2048`

Validation:

```bash
pnpm --filter @imagen-ps/app test
```

Stop rule: stop if persistence requires moving app-local settings into
`packages/providers` or provider profile config.

### Slice 2: Global settings page and providers entry

Goal: Add a providers action-bar entry and global settings page with output and
input groups.

Allowed scope:

- settings page/header
- new global settings page
- app shell route
- app i18n messages
- focused app tests

Settings groups:

- Output: size, format, aspect ratio
- Input: provider input max side

Validation:

```bash
pnpm --filter @imagen-ps/app test
```

Stop rule: stop if the page needs a broad navigation redesign outside providers
settings.

### Slice 3: Main page request wiring

Goal: Use global settings in submit payload and host input resize calls.

Allowed scope:

- `main-page.tsx`
- `use-conversation.ts`
- app tests/fakes

Required behavior:

- submit payload includes semantic output settings.
- provider input attachment/capture/read policy uses
  `providerInputMaxSide`.
- existing main-page aspect-ratio state no longer silently drops on submit.
- main-page high-frequency control may expose output size only.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page use-conversation
```

Stop rule: stop if preserving both main-page aspect ratio and global aspect
ratio creates conflicting priority rules. The preferred resolution is global
aspect ratio only.

### Slice 4: Application request bridge

Goal: Preserve semantic output settings through application request binding and
task execution snapshots.

Allowed scope:

- `packages/application/src/requests/*`
- `packages/application/src/runtime.ts`
- application tests

Validation:

```bash
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if the bridge requires application to know provider-specific
size support.

### Slice 5: Provider output mapping

Goal: Map semantic output settings into provider-specific wire request fields.

Allowed scope:

- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- provider tests

Required behavior:

- `image-endpoint` maps `sizePreset + aspectRatio` into an upstream-compatible
  `size` when the provider endpoint expects a concrete size.
- `chat-image` maps settings into `image_config` fields where supported.
- `4K` downgrade to `2K` is provider-owned, not UI-owned.
- `outputFormat: 'png'` is passed when supported by the provider mapping.
- Quality is not passed by default.

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: stop and produce a Decision Packet if provider docs or existing tests
cannot support the chosen 4K downgrade behavior.

### Slice 6: Final validation

Goal: Prove the complete mock-only repo gate passes.

Validation:

```bash
pnpm validate
```

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/providers test
```

Final:

```bash
pnpm validate
```

Manual-only:

- UXP Developer Tool + Photoshop smoke is not part of this Loop unless the user
  explicitly approves it after mock validation.

Live-provider:

- No live-provider smoke in this Loop.

## Decision Packet triggers

Produce an A/B/C Decision Packet and stop when:

- `4K` support or downgrade cannot be proven through provider docs, existing
  provider behavior, or mock tests.
- `sizePreset + aspectRatio: auto` cannot be represented without guessing for a
  provider family.
- app settings persistence needs provider or application ownership.
- current uncommitted UI changes conflict with this Loop's intended edits.
- default PNG output cannot be represented by a target provider without changing
  provider-specific semantics.

## Completion report

When executed, report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory note candidate

Yes: `architecture`, only if implementation lands and validates. The memory
should record the durable separation between output size presets, aspect ratio,
provider-owned wire mapping/downgrade, and provider input resize.
