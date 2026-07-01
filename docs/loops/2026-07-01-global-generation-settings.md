# Global Generation Settings And Placement Integrity

Status: draft
Authority: current user authorization on 2026-07-01 and 2026-07-02
Owner: cross-boundary slices under `apps/app`, `packages/application`, and `packages/providers`
Created: 2026-07-01
Updated: 2026-07-02

## Context docs

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `apps/app/AGENTS.md`
- Current authority: `packages/providers/AGENTS.md`
- Historical comparison: sibling monorepo resourcing chain separates content,
  boundary, mask, and placement metadata. Reuse the semantic separation only;
  do not import its URI framework or image-resize implementation.

## Goal

Wire global generation settings and provider input resize into the real
image-edit request chain while preserving source aspect ratio and Photoshop
placement intent. Provider input preparation must not drop pixels, crop,
stretch, pad, or round into a different ratio. Provider output placement must
not stretch, crop, or resize the returned image unless an explicit exact-frame
contract is valid.

## Incident baseline

A real Photoshop selection capture produced a `345x321` provider input frame.
The provider request succeeded, but preview writeback failed before Photoshop
placement because the app tried exact-frame placement with a returned asset of
`1016x946` against a source frame of `345x321`.

Root cause:

- Provider input resize rounded dimensions through a long-side target and
  model-size candidate selection.
- `multiple: 2` and candidate selection allowed a concrete size that was close
  but not exactly proportional to the source frame.
- Exact-frame placement then correctly rejected the asset because its aspect
  ratio did not match the captured frame.

The failure is an app-side contract bug, not a provider transport failure.

## Product semantics

- Output size controls provider-returned image size, not input image resize.
- Output size options are `512`, `1K`, `2K`, and `4K`.
- Output size has no `auto` option.
- Default output size is `2K`.
- Output format default is `PNG`.
- Quality has no UI in this slice. Do not pass quality by default unless a
  provider-specific policy later requires it.
- Aspect ratio default is `auto` and belongs in the global settings page.
- For image edit with captured Photoshop input, `aspectRatio: 'auto'` means
  preserve the captured input ratio in provider intent. If a provider requires a
  concrete aspect field, the app/application should pass the source ratio
  intent and provider mapping should decide the wire shape.
- Main page should not own an independent aspect-ratio setting. The existing
  main-page aspect-ratio state is a broken request chain and should be replaced
  or removed by the implementation slice.
- Main page may expose output size because it is high-frequency.
- Provider input resize is separate from output size. It controls the size of
  reference/captured images sent into provider edit requests.
- Provider input size presets are app-local upload preprocessing buckets. UI
  labels are `1K`, `2K`, and `4K`; they do not authorize ratio drift or pixel
  deletion.
- `providerInputSizePreset` is not provider/profile config, not provider wire
  output size, and not an output-size preset.
- Provider output is a returned asset. By default, place it back into the source
  document as-is on a new layer when source anchoring is available. Do not
  app-scale, crop, pad, or distort it to fit the captured frame. User-driven
  transform remains a Photoshop operation after placement.

## Non-goals

- No live provider smoke.
- No real Photoshop / UXP host proof.
- No per-provider profile override for global generation settings.
- No output count UI.
- No quality UI.
- No background, moderation, or input-fidelity UI.
- No provider capability or downgrade logic in `apps/app`.
- No broad settings/profile schema redesign.
- No import of the sibling monorepo URI/resource framework.
- No app-side postprocessing to force provider output dimensions to match the
  capture frame.

## Scope

Allowed files and areas:

- `apps/app/src/shared/image/resize.ts`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- new `apps/app/src/shared/ui/pages/*global-settings*` page/component files
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/hooks/*`
- `apps/app/src/shared/ui/i18n/*`
- `apps/app/src/shared/ports/*`
- app storage adapters under `apps/app/src/adapters/chrome/` and
  `apps/app/src/adapters/uxp/`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/simulators/photoshop/*`
- `packages/application/src/requests/*`
- `packages/application/src/runtime.ts`
- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- focused tests under `apps/app/tests`, `packages/providers/tests`, and
  `packages/application/src`

Forbidden files and areas:

- Provider credential handling and secret storage.
- Job lifecycle semantics in `packages/core-engine`.
- Live-provider configuration, credentials, or paid/network smoke.
- Broad UI redesign outside the global settings entry/page and affected
  composer controls.
- Photoshop host IO behavior unrelated to placement-intent selection,
  document anchoring, resize preflight, or simulator parity.
- Any shared package dependency on React, DOM, UXP, Photoshop, local paths, or
  host storage.

## Ownership boundary

- `apps/app` owns UI, app settings persistence, image resource derivatives,
  Photoshop capture/placement ports, placement intent, and provider input image
  materialization.
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

The app should not calculate concrete provider output wire dimensions. It should
pass a semantic output contract:

```ts
output: {
  count: 1,
  sizePreset: '512' | '1k' | '2k' | '4k',
  aspectRatio: 'auto' | 'source' | '1:1' | '16:9' | '9:16',
  outputFormat: 'png' | 'jpeg' | 'webp'
}
```

Provider adapters decide whether the upstream request uses `size`,
`aspect_ratio`, `image_config`, or a combination. The final HTTP body must not
contain contradictory size and ratio parameters for providers where those are
one concept.

Provider input resize should produce an exact-ratio derivative:

```ts
providerInput: {
  maxSideBucket: 512 | 1024 | 2048,
  fit: 'preserve-ratio',
  preferredMultiple: 2,
  effectiveMultiple: 1 | 2,
  width: number,
  height: number
}
```

The planner must choose integer dimensions that are an integer scale of the
reduced source ratio. For `345x321`, the reduced ratio is `115:107`. A near-1K
strict-ratio result is `1035x963` (`115 * 9`, `107 * 9`). It must not choose
`1016x946`, because that is not the same ratio.

`preferredMultiple: 2` is only a preference. If even dimensions cannot preserve
the source ratio near the requested bucket without overshooting beyond the
policy tolerance, the planner must degrade to `effectiveMultiple: 1` rather
than rounding width or height independently.

## Placement contract target

Source anchoring and frame fitting are separate decisions:

- `sourceDocument`: the Photoshop document captured from or explicitly selected.
- `sourceBoundary`: the captured rectangle, selection, layer bounds, or canvas
  bounds used to generate the provider input.
- `providerInput`: the exact-ratio derivative sent to the provider.
- `providerOutput`: the asset returned by the provider.
- `placementPreference`: user/app intent for where to place the output.

Default edit result placement:

- If source document identity is strongly verified, place provider output into
  that document as a new layer.
- Do not require returned provider output ratio to equal `sourceBoundary`.
- Do not transform the provider output to match `sourceBoundary`.
- If source document identity cannot be strongly verified, reject source-bound
  placement rather than choosing the active document silently.

Exact-frame placement:

- Allowed only for assets whose aspect ratio exactly matches the target frame
  under the strict aspect predicate.
- Intended for replaying exact-frame assets or mock echo outputs, not for
  arbitrary provider outputs whose returned dimensions are provider-owned.
- If ratio mismatch occurs, fall back only when the request explicitly allows
  document-only placement. Otherwise surface a clear app-side contract error.

This keeps `apps/app/AGENTS.md` placement ownership intact while avoiding
incorrect app-side output distortion.

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
- `providerInputSizePreset: '1k'`

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
- Input: provider input size preset

Validation:

```bash
pnpm --filter @imagen-ps/app test
```

Stop rule: stop if the page needs a broad navigation redesign outside providers
settings.

### Slice 3: Strict-ratio provider input planner

Goal: Replace provider input size selection with a strict-ratio planner.

Allowed scope:

- `apps/app/src/shared/image/resize.ts`
- app image resize tests
- call sites that pass provider input resize policy

Required behavior:

- Never independently round width and height into a different ratio.
- Use reduced source ratio and integer scale factors.
- Treat the derived numeric provider input policy as a long-side bucket target.
- Prefer `multiple: 2` only when it can preserve exact ratio inside policy.
- Degrade to `effectiveMultiple: 1` before accepting ratio drift.
- Preserve transparent PNG semantics already used by capture materialization.
- Add a regression case for `345x321` proving a strict-ratio near-1K result
  such as `1035x963`, and proving `1016x946` is not selected.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- image-resize
```

Stop rule: produce a Decision Packet if a provider has a documented hard
multiple requirement that conflicts with strict source-ratio preservation.

### Slice 4: Main page request wiring

Goal: Use global settings in submit payload and host input resize calls.

Allowed scope:

- `main-page.tsx`
- `use-conversation.ts`
- app tests/fakes

Required behavior:

- Submit payload includes semantic output settings.
- Image edit requests with captured inputs preserve `aspectRatio: 'auto'` or
  source-ratio intent through the app/application boundary.
- Provider input attachment/capture/read policy derives numeric `maxSide` from
  app-local `providerInputSizePreset`.
- Existing main-page aspect-ratio state no longer silently drops on submit.
- Main-page high-frequency control may expose output size only.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page use-conversation
```

Stop rule: stop if preserving both main-page aspect ratio and global aspect
ratio creates conflicting priority rules. The preferred resolution is global
aspect ratio only.

### Slice 5: Application request bridge

Goal: Preserve semantic output settings and source-ratio intent through
application request binding and task execution snapshots.

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

### Slice 6: Provider output mapping

Goal: Map semantic output settings into provider-specific wire request fields.

Allowed scope:

- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- provider tests

Required behavior:

- `image-endpoint` maps `sizePreset + aspectRatio/sourceRatio` into an
  upstream-compatible `size` only when the provider endpoint expects a concrete
  size.
- `chat-image` maps settings into `image_config` fields where supported.
- `aspectRatio: 'auto'` for image edit does not become a contradictory hard
  output ratio when source-ratio intent is available.
- `4K` downgrade to `2K` is provider-owned, not UI-owned.
- `outputFormat: 'png'` is passed when supported by the provider mapping.
- Quality is not passed by default.

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: stop and produce a Decision Packet if provider docs or existing tests
cannot support the chosen 4K downgrade behavior or source-ratio mapping.

### Slice 7: Placement policy correction

Goal: Place provider outputs into the source Photoshop document without
distorting them, while preserving exact-frame rejection for true exact-frame
contracts.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/simulators/photoshop/*`
- app placement tests

Required behavior:

- Provider outputs from image edit default to source-document placement when
  document identity is strongly verified.
- Provider outputs are not resized to the captured boundary by default.
- Exact-frame preflight remains strict when exact-frame is explicitly required.
- Ratio mismatch error paths are covered by mock host tests.
- Document-only fallback is explicit, not silent.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- photoshop-host-bridge
```

Stop rule: stop if the placement intent cannot distinguish provider output
writeback from exact-frame replay without changing public app command shape.

### Slice 8: Final validation

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
pnpm --filter @imagen-ps/app test -- image-resize
pnpm --filter @imagen-ps/app test -- main-page use-conversation
pnpm --filter @imagen-ps/app test -- photoshop-host-bridge
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
- Manual smoke should verify a real selection capture, provider response, and
  source-document placement with no automatic output distortion.

Live-provider:

- No live-provider smoke in this Loop.

## Decision Packet triggers

Produce an A/B/C Decision Packet and stop when:

- `4K` support or downgrade cannot be proven through provider docs, existing
  provider behavior, or mock tests.
- `sizePreset + aspectRatio: auto/source` cannot be represented without
  guessing for a provider family.
- App settings persistence needs provider or application ownership.
- Current uncommitted UI changes conflict with this Loop's intended edits.
- Default PNG output cannot be represented by a target provider without
  changing provider-specific semantics.
- A provider requires even dimensions and strict source-ratio preservation would
  require overshooting or undershooting beyond the bucket tolerance.
- Source-document placement and exact-frame replay cannot be represented as
  distinct placement intents without changing user-visible behavior.

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
should record the durable separation between output size presets, source-ratio
provider input planning, provider-owned output mapping, and app-owned
source-document placement.
