Status: draft
Authority: current user authorization (2026-07-02)
Owner: apps/app
Created: 2026-07-02

# Local File Provider Input Without Temp Photoshop Documents

## Context docs

Current authority:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`

Targeted references:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/shared/domain/image-resource.ts`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `docs/loops/2026-07-01-global-generation-settings.md`

## Goal

Redesign `apps/app` local-file attachment handling so Photoshop document/layer/capture inputs keep using Photoshop Imaging API, while local PNG/JPEG file attachments stop opening temporary Photoshop documents for preview and provider-input normalization, using an app-local byte pipeline that can produce a valid `providerInput.storedRef` without crossing package boundaries.

## Non-goals

- Changing Photoshop document/layer/capture attachment materialization away from `imaging.getPixels()` and existing host-native flows.
- Changing placement intent, writeback, or `placeAssetOnCanvas()` semantics.
- Moving image resource lifecycle ownership out of `apps/app`.
- Adding provider-specific resize logic in `packages/providers`.
- Treating browser/jsdom proof as real Photoshop host proof.
- Committing to the full default `jimp` bundle before a custom minimal-build evaluation.

## Scope

Allowed scope for the future implementation Loop:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/shared/domain/image-resource.ts`
- `apps/app/src/shared/domain/host-image-asset.ts`
- `apps/app/src/shared/domain/image-payload-preflight.ts`
- `apps/app/src/shared/image/resize.ts`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- focused `apps/app` tests, harnesses, and app-local dependency wiring
- app-local documentation updates in current authority docs if durable behavior changes

Forbidden scope:

- `packages/application`
- `packages/core-engine`
- `packages/providers`
- provider request/response schemas
- placement contract docs unrelated to local-file provider-input derivation
- broad docs cleanup

## Ownership boundary

- `apps/app` owns image resource lifecycle, including separate `thumbnail` and `providerInput` derivative states.
- Photoshop host-native capture/layer/document pixel reads remain owned by the UXP adapter and must continue to prefer Photoshop Imaging API.
- Provider edit submission stays unchanged at the contract boundary: it must resolve `image.resource.derivatives.providerInput.storedRef`.
- No UI/runtime logic from this slice may leak into `packages/application`, `packages/core-engine`, or `packages/providers`.

## Baseline

Current repository facts:

- Local file import in UXP reads file bytes first, then opens the file as a temporary Photoshop document through `app.open(file)` to generate preview and, when needed, normalized provider-input bytes.
- Even when the file does not need resizing, the current path still opens a temporary document to generate preview.
- Submit-time image edit requires `providerInput.kind === "ready"` and a `storedRef`; preview URLs are not submission inputs.
- `apps/app` already contains:
  - header-only PNG/JPEG/WEBP dimension readers;
  - an app-local PNG encoder for RGBA bytes;
  - payload preflight for PNG/JPEG/WEBP structural validity.

Baseline validation before implementation claims:

```bash
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

If baseline already fails, record it before attributing any new regression to this Loop.

## Design summary

### Preserved paths

- Photoshop document/layer/capture flows remain on:
  - `imaging.getPixels({ targetSize })`
  - host-native scaling/cache pyramid behavior
  - host-native pixel encoding/materialization

Reason:

- Photoshop Imaging API is the preferred path for pixels already owned by Photoshop.
- Pulling full Photoshop-owned RGBA into JS only to re-scale there is not the intended optimization path.

### Local-file target path

Local PNG/JPEG file attachments should be redesigned toward:

```text
UXP file picker
-> binary read
-> app-local preview source without app.open(file)
-> app-local decode/resize/encode only when providerInput requires normalization
-> AssetStore storedRef
-> providerInput.ready
```

### Candidate implementation direction

Primary evaluation target:

- custom Jimp minimal build
  - `@jimp/core`
  - JPEG decoder/encoder
  - PNG decoder/encoder
  - resize plugin

Explicitly not the default starting point:

- full `jimp` package import with unused formats/plugins bundled into the UXP panel

Reason:

- This slice needs a practical byte decode/resize/encode path for local files only.
- The repo already constrains accepted local file formats to PNG/JPEG/WEBP; any extra plugin surface is bundle and runtime risk until proven necessary.

### Open constraint

WEBP support is required by the current file picker and payload preflight. If the evaluated minimal build cannot decode WEBP in the target UXP runtime, the Loop must choose between:

- a mixed strategy that keeps WEBP on the current host-native path while PNG/JPEG move to app-local bytes, or
- a separate minimal WEBP-capable decoder path, or
- keeping the current temp-document path until equivalent coverage is proven.

Do not silently drop WEBP support.

### Recorded viability result

Implementation evidence from this Loop:

- A custom Jimp minimal build was evaluated first.
- In the repository UXP/Vite runtime, the PNG branch pulled `pngjs` browser-externalized Node modules (`stream`, `zlib`, `util`) into the bundle path, which was rejected as unacceptable runtime risk for production UXP use.
- The accepted app-local byte path uses:
  - `fast-png` for PNG decode/encode
  - `jpeg-js` for JPEG decode
  - existing app-local `downscaleArea()` / `upscaleBilinear()` for serial resize
- WEBP remains an explicit host-native fallback path because equivalent app-local decode coverage was not proven in this Loop.

Decision:

- Do not ship the Jimp path.
- Ship the thinner PNG/JPEG byte pipeline in `apps/app`.
- Keep WEBP on the existing temp-document path until a proven app-local WEBP decoder is added.

## Slices

### Slice 1: Local-file boundary extraction

Goal:

Document and isolate the behavior differences between:

- Photoshop-owned pixels (`layer`, `capture`)
- external local-file bytes (`file`)

Required outcome:

- A small app-local contract describing which attachment sources may use host-native Imaging API and which may use app-local byte transforms.
- No shared-package API changes.

Allowed scope:

- app docs
- `apps/app` type and adapter shaping only if needed for clarification

Validation:

```bash
pnpm check:policy
```

Stop rule:

Stop if this slice appears to require changing provider/application package contracts instead of clarifying app-local ownership.

### Slice 2: Preview/providerInput derivative split for local files

Goal:

Ensure local-file preview generation can be independent from provider-input normalization.

Required behavior:

- Preview must no longer require `app.open(file)`.
- `thumbnail` and `providerInput` states must stay independently representable.
- Submit semantics must remain unchanged: provider edit still consumes `providerInput.storedRef`.

Allowed scope:

- `host-image-asset.ts`
- `image-resource.ts`
- `photoshop-host-bridge.ts`
- main-page / conversation call sites
- focused app tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- use-conversation main-page
```

Stop rule:

Stop if the slice forces provider edit submission to accept preview URLs, original assets, or inline bytes.

### Slice 3: Custom Jimp minimal-build viability harness

Goal:

Prove whether a custom Jimp minimal build can decode, resize, and encode the repo-required local file formats under the app runtime constraints.

Required behavior:

- Prefer a minimal custom build evaluation over the default `jimp` package.
- Cover PNG/JPEG first.
- Treat WEBP as an explicit acceptance item, not an implicit maybe.
- Measure single-image memory behavior and keep processing serial.

Allowed scope:

- app-local experiment harnesses/tests
- app dependency wiring
- no production path swap until harness passes

Validation:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build
```

Manual-only validation:

- real Photoshop / UXP panel smoke for representative local PNG/JPEG imports
- optional large-image serial import smoke

Stop rule:

Produce a Decision Packet if:

- custom Jimp minimal build cannot cover required formats in the target runtime,
- bundle/runtime cost is clearly unacceptable,
- or WEBP support remains unresolved.

### Slice 4: UXP local-file providerInput refactor

Goal:

Replace the temporary Photoshop-document path for local PNG/JPEG file providerInput derivation when the viability harness is proven.

Required behavior:

- `pickImageFile()` no longer opens a temporary Photoshop document merely to generate preview.
- Local-file normalization runs through the approved app-local byte path.
- Processing is serial and releases intermediate buffers promptly.
- Attachment state retains final payload refs, not long-lived decoded RGBA.
- Submit must not trigger temporary Photoshop document opens for local-file normalization.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- app-local utility helpers and tests

Validation:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
```

Manual-only validation:

- real Photoshop / UXP import of one PNG and one JPEG local attachment
- confirm no temporary Photoshop document visibly opens during attachment add
- confirm provider edit submit still succeeds with prepared provider-input refs

Stop rule:

Stop if refactor pressure pushes local-file normalization into submit-time temp document opens or cross-package ownership changes.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app build:uxp
```

Final:

```bash
pnpm validate
```

Manual-only:

- real Photoshop / UXP import smoke for local PNG/JPEG files
- real Photoshop / UXP confirmation that attachment add no longer flashes temporary documents once the refactor lands
- optional representative large-image serial import smoke

Live-provider:

- none required for design approval
- optional later smoke only after local providerInput readiness is proven through mock/fake harnesses

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- custom Jimp minimal build cannot decode/encode one of the required local formats in UXP runtime;
- WEBP support cannot be preserved without falling back to host-native temp-document handling;
- memory or bundle-cost evidence makes the byte-path unacceptable;
- the clean app-local design still requires `packages/application` or `packages/providers` contract changes;
- real Photoshop manual proof contradicts mock/browser-only harness results.

## Completion report

The executing agent must report:

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

No for this draft.

Promote durable outcome only after the implementation Loop proves:

- the accepted local-file byte pipeline,
- the approved custom Jimp minimal-build boundary,
- and any surviving fallback behavior for unsupported formats.
