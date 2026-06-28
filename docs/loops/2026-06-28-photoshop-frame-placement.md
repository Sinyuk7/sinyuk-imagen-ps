# Photoshop Frame Placement Loop

Status: draft
Authority: current user authorization, 2026-06-28
Owner: `apps/app`
Created: 2026-06-28

## Context Docs

Current authority:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`

Repository evidence:

- `apps/app/public/manifest.json`
- `apps/app/src/shared/domain/host-image-asset.ts`
- `apps/app/src/shared/ports/host-port.ts`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/image-endpoint/build-request.ts`
- `packages/providers/src/transport/chat-image/build-request.ts`

Local Adobe documentation evidence:

- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/selection.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/imaging.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/layer.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/batchplay.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/executeasmodal.md`

Narrow historical reference:

- `MEMORY.md:503`: host writeback currently uses temp file, session token,
  `executeAsModal()`, and `batchPlay(placeEvent)`; repo-side tests do not prove
  real Photoshop host IO.

## Background

Current app image input and output are byte-oriented, not frame-oriented.

UI attachments come from host reads and are submitted as plain `Asset` values.
`useConversation` picks `provider-edit` when attachments exist and sends
`images: attachments.map((attachment) => attachment.image.asset)`. The provider
contract keeps `CanonicalImageJobRequest.images` as host-agnostic `AssetRef[]`.
The provider transport then maps asset data to upstream wire payloads:
`image-endpoint` uses file id, URL, data URL, or multipart file; `chat-image`
uses URL or data URL.

Photoshop writeback is also byte-oriented. `HostPort.placeAssetOnCanvas(asset)`
only accepts the returned `Asset`. `main-page.tsx` calls it with the first output
preview asset. The UXP bridge writes the bytes to a temporary file, creates a
session token, and runs `batchPlay({ _obj: 'placeEvent' })` inside
`executeAsModal()`. No placement rectangle, input source rectangle, upload
scale, or fallback rule is preserved.

The new requirement is not simple request-time image resizing. It is a frame
mapping requirement:

- A Photoshop layer, full image, rectangular selection, or non-rectangular
  selection is treated as a rectangular input frame in document coordinates.
- Non-rectangular selections are uploaded as rectangular PNGs whose unselected
  pixels are transparent.
- The upload image may be downscaled to a global max edge of 2048 before
  provider dispatch.
- The output should be placed back at the same Photoshop document location and
  visual size as the source frame when the returned aspect ratio matches the
  source frame.
- If no coordinate-bearing frame exists, if multiple frames exist, or if the
  returned aspect ratio does not match the source frame, the app uses fallback
  placement. Fallback is the current ordinary `placeEvent` behavior.

The user explicitly decided:

- `max edge = 2048` is global for now; use a local config/policy constant first.
- Selection mask transparency must be strict.
- Pixel source priority is current selected/specified layer first; composite
  document can be considered only when no layer is specified.
- Fallback can stay simple and need not recover exact placement.
- If multiple coordinate-bearing inputs exist, only the first one controls
  placement.
- Smart object canvas behavior is not required for this Loop.

## Source Findings

- `apps/app/public/manifest.json` declares Manifest v5, Photoshop host, and
  `host.minVersion: "26.1.0"`. Selection API min version 25.0 is therefore
  compatible with this manifest target.
- `apps/app/AGENTS.md` requires local Adobe docs for UXP, Photoshop DOM,
  BatchPlay, Imaging API, and manifest questions. Browser compatibility must
  not be used as proof of Photoshop host support.
- `apps/app/src/shared/domain/host-image-asset.ts` currently stores only
  `asset`, shallow metadata, preview, and payload handle. It has no geometry.
- `apps/app/src/shared/ports/host-port.ts` currently exposes
  `placeAssetOnCanvas(asset: Asset): Promise<void>`, so writeback has no way to
  receive placement intent.
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts` already gets layer
  bounds and passes them to `imaging.getPixels({ sourceBounds })`, but
  `imageDataToJpegAsset()` returns a JPEG asset and drops the bounds.
- Adobe `Selection` docs state that `selection.bounds` returns `null` when
  there is no active selection; selections are pixel-based; 8-bit transparency is
  possible; `solid` is false for non-rectangular selections.
- Adobe Imaging docs state that `getPixels` accepts `sourceBounds` and
  `targetSize`; `targetSize` scales returned image data. The docs also warn that
  when `targetSize` is smaller, Photoshop may use a cache pyramid level and the
  returned `sourceBounds` are relative to that cache level.
- Adobe Imaging docs state that `getSelection` returns a pixel representation of
  the active selection, like Quick Mask, and also accepts `sourceBounds` and
  `targetSize`.
- Adobe Imaging docs state that `encodeImageData()` currently produces JPEG
  base64 for UXP image elements and requires RGB image data. This is not enough
  for strict transparent selection PNG output.
- Adobe Layer docs expose `layer.scale()` and `layer.translate()`, but exact
  post-place transform behavior must be verified in Photoshop because existing
  repo tests only assert the `placeEvent` call.

## Goal

Create a harness-backed `apps/app` frame placement design that preserves enough
Photoshop input metadata to place provider output back at the same document
rectangle when it is safe to do so, while retaining current ordinary placement
as fallback.

## Non-Goals

- Do not implement provider-specific upload limits or model UI controls.
- Do not change `packages/providers` wire payload semantics beyond tests needed
  to prove existing `Asset` compatibility.
- Do not add smart object canvas creation.
- Do not require live provider calls.
- Do not claim real Photoshop placement correctness from jsdom, Chrome, or fake
  UXP tests.
- Do not solve multi-input compositing; only the first coordinate-bearing input
  controls placement.
- Do not persist raw image bytes, raw logs, provider payload dumps, or secrets in
  docs or memory.

## Scope

Allowed files:

- `apps/app/src/shared/domain/host-image-asset.ts`
- `apps/app/src/shared/domain/*placement*.ts`
- `apps/app/src/shared/ports/host-port.ts`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/adapters/chrome/chrome-host-port.ts`
- `apps/app/src/simulators/photoshop/simulator.ts`
- `apps/app/tests/**`
- `docs/loops/2026-06-28-photoshop-frame-placement.md`

Conditionally allowed:

- `packages/application` only if the selected design requires job/session output
  snapshots to carry placement context across retry/history boundaries.
- `packages/providers` tests only if validating that transformed `Asset` data
  still maps to existing provider request builders.

Forbidden files/packages:

- Provider transport implementation changes for placement behavior.
- Core engine job lifecycle changes unless a Decision Packet is accepted.
- CLI behavior changes in this Loop.
- Broad documentation cleanup outside this Loop.

## Ownership Boundary

- `apps/app` owns Photoshop/UXP host IO, Chrome simulator parity, UI-local
  attachment context, placement fallback selection, and manual-host smoke
  workflow.
- `packages/application` owns session snapshots and command facade. It must not
  import React, DOM, Node, UXP, or Photoshop.
- `packages/providers` owns only canonical request validation and transport
  mapping. It must not own Photoshop geometry, placement, or UI state.
- `packages/core-engine` owns job lifecycle and dispatch. It should not become
  aware of Photoshop placement.

## Decision Packets

### Decision 1: Where should geometry live?

Options:

- A. Put geometry fields directly on provider `Asset`.
- B. Put geometry next to app `HostImageAsset` and UI attachment context.
- C. Put geometry only in provider `providerOptions`.

Recommendation: B.

Why:

- `Asset` is host-agnostic and provider-facing. Adding Photoshop geometry to it
  would leak app/host IO into provider and core boundaries.
- `providerOptions` is provider-specific passthrough and should not carry
  app-side placement semantics.
- `HostImageAsset` is already the app-side wrapper around host image bytes,
  preview, and payload handle. It is the narrowest place to attach Photoshop
  frame metadata without changing provider contracts.

Acceptance:

- Provider request builders still receive plain `Asset` values.
- App code can retrieve frame metadata for output placement without inspecting
  provider payloads.

### Decision 2: What is the placement contract?

Options:

- A. Always scale returned image to the source frame.
- B. Scale and position only when returned aspect ratio matches the source frame;
  otherwise fallback to ordinary place.
- C. Always ordinary place; metadata is only diagnostic.

Recommendation: B.

Why:

- The requirement assumes the server returns the same aspect ratio as the source
  frame. If that invariant fails, exact placement is undefined and complex
  contain/cover/stretch logic would hide the upstream mismatch.
- Current ordinary placement is already available and is acceptable as fallback.

Acceptance:

- Matching aspect ratios choose frame placement.
- Mismatched aspect ratios, missing coordinate metadata, and multiple
  coordinate-bearing inputs beyond the first choose fallback.

### Decision 3: How should selection be represented?

Options:

- A. Treat selection shape as geometry and attempt polygon placement.
- B. Treat selection as bounding rectangle plus PNG alpha mask.
- C. Treat only rectangular selections as supported.

Recommendation: B.

Why:

- Image payloads are rectangular. A triangular selection can only be represented
  as a rectangular image with transparent pixels outside the selected area.
- Adobe selection docs expose `bounds` and pixel selection masks. This supports a
  rect frame plus alpha/mask model.
- This keeps placement simple: only the bounds rectangle controls location.

Acceptance:

- Rectangular and non-rectangular selections share the same frame model.
- Non-selected pixels are transparent in the uploaded PNG for selection inputs.

### Decision 4: Where should max upload size be configured?

Options:

- A. Hardcode `2048` inside UXP read methods.
- B. Add an app-local input image policy constant, defaulting max edge to 2048.
- C. Add provider/model capability negotiation now.

Recommendation: B.

Why:

- The user decided max edge 2048 is global for now.
- A named app-local policy is easier to move behind UI later.
- Provider/model negotiation is valid future work but expands this Loop into
  provider descriptors and settings UI.

Acceptance:

- One app-local policy owns `maxUploadEdge: 2048`.
- Tests reference the policy, not magic numbers scattered across host code.

### Decision 5: How should multiple coordinate-bearing inputs behave?

Options:

- A. Error when multiple coordinate-bearing inputs are present.
- B. Use the first coordinate-bearing input and ignore later placement frames.
- C. Compute a combined bounding rectangle.

Recommendation: B.

Why:

- The user selected first-frame behavior.
- Combined bounds would imply multi-input compositing semantics that are not part
  of this Loop.

Acceptance:

- The placement selector returns the first coordinate-bearing frame.
- Later frames do not affect placement.

### Decision 6: How should no-coordinate inputs behave?

Options:

- A. Error and block placement.
- B. Fallback to ordinary `placeEvent`.
- C. Guess document center and size from output image.

Recommendation: B.

Why:

- File inputs or unknown host sources may not have document coordinates.
- Current place behavior is already the fallback and avoids false precision.

Acceptance:

- Missing frame metadata never blocks generation.
- Missing frame metadata uses fallback writeback.

## Proposed Data Model

```ts
export interface PhotoshopPoint {
  readonly x: number;
  readonly y: number;
}

export interface PhotoshopSize {
  readonly width: number;
  readonly height: number;
}

export interface PhotoshopRect extends PhotoshopPoint, PhotoshopSize {}

export type PhotoshopInputTargetKind = 'selection' | 'layer' | 'document' | 'file' | 'unknown';

export interface PhotoshopInputFrame {
  readonly targetKind: PhotoshopInputTargetKind;
  readonly sourceRect: PhotoshopRect;
  readonly documentRect: PhotoshopRect;
  readonly originalSize: PhotoshopSize;
  readonly uploadSize: PhotoshopSize;
  readonly uploadScale: number;
  readonly hasStrictAlphaMask?: boolean;
}
```

Notes:

- `sourceRect` is the region requested from Photoshop.
- `documentRect` is the intended output placement frame in Photoshop document
  coordinates.
- `originalSize` is derived from `sourceRect`.
- `uploadSize` is the actual pixel size sent to the provider after applying the
  app input image policy.
- `placementSize` is derivable from `documentRect`.
- `placementOffset` is derivable from `documentRect.x/y`.
- The first implementation should keep placement metadata app-local and should
  not modify provider `Asset`.

## Proposed Runtime Flow

Input preparation:

1. User chooses layer or selection target.
2. UXP host resolves a `PhotoshopInputFrame`.
3. UXP host reads pixels from the current selected/specified layer first.
4. If no layer is specified and selection support is active, composite document
   can be considered as a later extension.
5. For selection input, UXP host reads `selection.bounds`, reads selection mask,
   reads pixels within the bounds, applies strict alpha from the mask, and emits
   a rectangular PNG.
6. UXP host applies global max edge 2048 to produce `uploadSize`.
7. The UI submits only `HostImageAsset.asset` to the provider, while retaining
   the frame metadata in attachment/round context.

Output placement:

1. On place action, inspect the originating round attachments.
2. Select the first attachment with `PhotoshopInputFrame`.
3. Inspect output image dimensions when available.
4. If output aspect ratio matches the selected frame aspect ratio within a small
   tolerance, place and transform to `documentRect`.
5. Otherwise use current fallback `placeEvent`.
6. If no frame metadata exists, use current fallback `placeEvent`.

## Baseline

Expected clean baseline before execution:

```sh
pnpm check:policy
pnpm --filter @imagen-ps/app test
```

If baseline fails before implementation:

- Report the failure.
- Classify whether it is dependency/setup, app test, policy, or unrelated.
- Do not attribute the failure to this Loop until a task-touched test proves it.

## Slices

### Slice 1: App Domain Frame Metadata

Goal:

- Add a host-agnostic app-domain frame type and attach optional frame metadata to
  `HostImageAsset`.

Allowed scope:

- `apps/app/src/shared/domain/host-image-asset.ts`
- New `apps/app/src/shared/domain/photoshop-frame.ts`
- App domain tests.

Forbidden scope:

- Provider request builders.
- UXP host implementation.

Validation:

```sh
pnpm --filter @imagen-ps/app test
```

Stop rule:

- Stop if TypeScript requires moving Photoshop frame types into
  `packages/application` or provider contracts.

### Slice 2: Placement Selection And Fallback Policy

Goal:

- Add pure app-domain logic to select the first coordinate-bearing frame and
  decide frame placement vs fallback based on aspect ratio.

Allowed scope:

- `apps/app/src/shared/domain/*placement*.ts`
- `apps/app/tests/**`

Forbidden scope:

- Real Photoshop BatchPlay transform behavior.

Validation:

```sh
pnpm --filter @imagen-ps/app test
```

Stop rule:

- Stop if output image dimensions cannot be obtained from available app-side
  assets without adding heavy binary parsing to UI code. Produce a Decision
  Packet for where dimension extraction should live.

### Slice 3: Preserve Layer Frame Metadata

Goal:

- Preserve layer bounds from UXP layer reads and simulator reads as
  `PhotoshopInputFrame`, with max upload edge policy recorded in metadata.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/adapters/chrome/chrome-host-port.ts`
- `apps/app/src/simulators/photoshop/simulator.ts`
- `apps/app/tests/**`

Forbidden scope:

- Selection mask alpha implementation.
- Provider changes.

Validation:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
```

Stop rule:

- Stop if Adobe Imaging `targetSize` returns cache-level `sourceBounds` that
  makes full-resolution placement ambiguous in current tests. Preserve original
  requested bounds separately or produce a Decision Packet.

### Slice 4: UI Round Context And Writeback Intent

Goal:

- Keep originating attachment frame metadata with conversation rounds and pass a
  placement intent into the host writeback port when the placement selector says
  frame placement is safe.

Allowed scope:

- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ports/host-port.ts`
- Tests for place action behavior.

Forbidden scope:

- Real UXP transform details.

Validation:

```sh
pnpm --filter @imagen-ps/app test
```

Stop rule:

- Stop if session retry/history needs durable placement metadata across app
  reload. Produce a Decision Packet for whether `packages/application` should
  carry app-local placement context.

### Slice 5: UXP Placement Implementation

Goal:

- Extend UXP writeback to place output normally, then scale/translate the placed
  layer to the selected `documentRect` when frame placement is safe.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- UXP host adapter tests.

Forbidden scope:

- Smart object canvas creation.
- Provider/live smoke.

Validation:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
```

Manual-only validation:

- Build UXP bundle.
- Load `apps/app/dist/manifest.json` in UXP Developer Tool.
- In Photoshop, place a returned output for a known layer frame.
- Verify visual bounds match the original layer/selection frame.

Stop rule:

- Stop if layer scale/translate or post-place active layer identity is not
  reliable from repo tests. Use Photoshop BatchPlay recorder / UXP DevTools and
  produce a Decision Packet with real-host evidence.

### Slice 6: Selection PNG With Strict Alpha

Goal:

- Implement selection input as `selection.bounds` rectangular PNG with strict
  transparent pixels outside the selected mask.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- UXP adapter tests/fakes.
- App UI target handling if needed.

Forbidden scope:

- Composite fallback unless explicitly scoped after layer selection path is
  proven.

Validation:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
```

Manual-only validation:

- In Photoshop, create a non-rectangular selection over a pixel layer.
- Send it through the app.
- Inspect the uploaded/preview asset or a local test fixture to verify
  unselected pixels are transparent.
- Verify placement follows the selection bounds when the returned aspect ratio
  matches.

Stop rule:

- Stop if UXP cannot encode RGBA/PNG from Imaging APIs directly. Produce a
  Decision Packet choosing between local PNG encoder, canvas path, or fallback
  to deferred selection support.

## Validation

Quick:

```sh
pnpm check:policy
```

Per-slice:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
```

Final:

```sh
pnpm validate
```

Manual-only:

- UXP Developer Tool + Photoshop host smoke for frame placement.
- UXP Developer Tool + Photoshop host smoke for non-rectangular selection alpha.

Live-provider:

- None by default.
- Do not run paid/live provider smoke for this Loop unless the user explicitly
  approves it.

## Decision Packet Triggers

Produce a Decision Packet instead of continuing when:

- Selection PNG alpha requires a new binary encoder dependency or a large custom
  PNG encoder.
- Placement cannot reliably identify or transform the layer created by
  `placeEvent`.
- Output dimensions cannot be determined without provider-specific response
  assumptions.
- Retry/history persistence requires moving app-specific frame metadata into
  `packages/application`.
- Real Photoshop host behavior contradicts repo-side fakes.
- Implementing composite fallback would require new UX decisions.

## Completion Report

Executing agents must report:

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

## Memory Note Candidate

yes: architecture

Write a stable project memory only after implementation proves the frame
placement contract through app tests and at least one real Photoshop host smoke.
Do not write raw logs, screenshots, or generated image bytes to memory.

## Source References

- `AGENTS.md`: root Loop operating model and writeback rules.
- `apps/app/AGENTS.md`: local Adobe docs and real-host authority rules for UXP,
  Photoshop DOM, BatchPlay, Imaging API, manifest, and SWC.
- `docs/agent/LOOP.md`: required Loop document sections and Decision Packet
  triggers.
- `docs/ENGINEERING_CONTEXT.md`: module ownership and dependency boundaries.
- `docs/TESTING.md`: quick, per-slice, final, manual-only, and live-provider
  validation categories.
- `apps/app/public/manifest.json`: Manifest v5 and Photoshop minVersion 26.1.0.
- `apps/app/package.json`: SWC 0.37.0 and wrapper dependency versions.
- `apps/app/src/shared/domain/host-image-asset.ts`: current app host image
  wrapper lacks geometry.
- `apps/app/src/shared/ports/host-port.ts`: current writeback port only accepts
  `Asset`.
- `apps/app/src/shared/ui/hooks/use-conversation.ts`: current edit request sends
  only attachment assets.
- `apps/app/src/shared/ui/pages/main-page.tsx`: current place action uses the
  first output asset and calls `host.placeAssetOnCanvas(asset)`.
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`: current layer read uses
  bounds as `sourceBounds`; current writeback uses temp file and `placeEvent`.
- `packages/providers/src/contract/request.ts`: canonical provider request owns
  host-agnostic `AssetRef[]`.
- `packages/providers/src/transport/image-endpoint/build-request.ts`: image
  endpoint builder maps `Asset` to file id, URL, data URL, or multipart.
- `packages/providers/src/transport/chat-image/build-request.ts`: chat image
  builder maps `Asset` to `image_url` content.
- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/selection.md`:
  selection bounds, `solid`, and pixel-based 8-bit transparency behavior.
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/imaging.md`:
  `getPixels`, `getSelection`, `targetSize`, cache-level warning,
  `createImageDataFromBuffer`, `putPixels`, and JPEG-only `encodeImageData`
  behavior.
- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/layer.md`:
  layer `bounds`, `boundsNoEffects`, `scale`, and `translate`.
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/batchplay.md`:
  BatchPlay descriptor execution and modal requirement for document-changing
  commands.
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/executeasmodal.md`:
  modal scope requirement for Photoshop state changes.
