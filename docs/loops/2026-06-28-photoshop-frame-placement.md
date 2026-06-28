# Photoshop Capture And Placement Loop

Status: draft
Authority: current user authorization, 2026-06-28
Owner: `apps/app`, with a bounded `packages/providers` MockProvider slice
Created: 2026-06-28

## Context Docs

Current authority:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `packages/providers/AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `docs/loops/review.md`

Repository evidence:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/domain/host-image-asset.ts`
- `apps/app/src/shared/domain/mappers.ts`
- `apps/app/src/shared/image/resize.ts`
- `apps/app/src/shared/ports/host-port.ts`
- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/adapters/chrome/chrome-host-port.ts`
- `apps/app/src/simulators/photoshop/simulator.ts`
- `apps/app/tests/main-page.test.tsx`
- `apps/app/tests/use-conversation.test.tsx`
- `apps/app/tests/image-resize.test.ts`
- `apps/app/tests/fakes.ts`
- `packages/core-engine/src/types/asset.ts`
- `packages/application/src/requests/provider-edit.ts`
- `packages/providers/src/contract/request.ts`
- `packages/providers/src/contract/result.ts`
- `packages/providers/src/providers/mock/provider.ts`
- `packages/providers/src/providers/mock/request-schema.ts`
- `packages/providers/tests/mock-provider.test.ts`

Local Adobe documentation evidence, relative to a checkout that has the local
Adobe mirror:

- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/selection.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/imaging.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/classes/layer.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/batchplay.md`
- `.local/share/uxp-photoshop/src/pages/ps-reference/media/executeasmodal.md`

External implementation reference, relative to the user-provided `monorepo`
checkout:

- `capabilities/resourcing/README.md`
- `capabilities/resourcing/src/ps-adapter/types/boundary-rect-utils.ts`
- `capabilities/resourcing/src/ps-adapter/helpers/image-processing.ts`
- `capabilities/resourcing/src/ps-adapter/tools/get-image.ts`
- `capabilities/resourcing/src/ps-adapter/tools/get-selection.ts`
- `capabilities/resourcing/src/@uxp/image-holder.ts`
- `capabilities/resourcing/src/@uxp/actions/imaging/register-create-from-buffer.ts`
- `capabilities/resourcing/src/@uxp/actions/imaging/register-create-by-content.ts`
- `capabilities/resourcing/src/@uxp/actions/imaging/register-create-by-mask.ts`
- `capabilities/resourcing/src/@uxp/actions/imaging/register-combine-by-cbm.ts`
- `capabilities/resourcing/src/@uxp/actions/imaging/register-request-save-image.ts`
- `packages/sdppp-photoshop/src/providers/base/useTaskExecutor.ts`
- `packages/sdppp-photoshop/src/tsx/App.store.ts`
- `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`
- `packages/ps-common/sdk/sdppp-ps-sdk.d.ts`

The monorepo is an implemented online reference, not current authority for this
repository. Use it to copy proven concepts and failure boundaries, not package
structure or SDK naming.

## Goal

Implement a harness-backed Photoshop image editing loop where an explicit
`Capture` button materializes the active Photoshop selection or active layer as
an attachment, provider calls send only those attachments, MockProvider can echo
the exact uploaded image assets, and returned assets are placed according to a
single request-level placement intent.

Observable outcome:

- A user can click `Capture`, inspect the attachment preview, click `Send`, and
  place a selected result back into Photoshop in the same document frame when
  the request is an exact single-capture edit.
- Multi-image requests never infer output-to-input correspondence. They either
  retain document-only placement context or remain unbound.
- MockProvider returns the prepared upload images as its result assets, so the
  preview/writeback content path shows exactly what would have been uploaded.

## Non-Goals

- Do not keep or extend the old `Target` selector.
- Do not implicitly capture Photoshop content from `Send`.
- Do not put Photoshop geometry into provider `Asset`, provider request wire
  payloads, or provider result stable contracts.
- Do not add provider-specific upload limit UI.
- Do not add live provider smoke as a default gate.
- Do not claim real Photoshop placement correctness from jsdom, Chrome, or fake
  UXP tests.
- Do not import monorepo packages or copy its SDK/resource URI architecture.
- Do not solve cross-document persistence across Photoshop restarts in this
  Loop unless a slice explicitly re-scopes it.
- Do not add CLI behavior; the CLI surface is not current.

## User Decisions

- Replace the composer `Target` control with a direct `Capture` button.
- `Capture` is an explicit user action, equivalent in intent to `+` attaching a
  local file or selected Photoshop layer.
- `Capture` checks the current Photoshop active document and active layer.
- If an active selection exists, capture the active layer constrained to the
  selection bounds.
- If no active selection exists, capture the active Photoshop layer.
- Non-rectangular selections are represented as rectangular PNG attachments:
  the rectangle is the selection bounds, and unselected pixels are transparent.
- `Send` sends existing attachments only. It should not silently choose current
  Photoshop state.
- Empty attachments should block image-edit send with a visible action path:
  capture from Photoshop or add an image.
- "Current layer" means the Photoshop active layer.
- Placement metadata is required in this Loop.
- Multi-image behavior must not collapse to the first input, first output, or
  first captured frame.
- Provider outputs must not be mapped to inputs by array index.
- Each request/round owns exactly one `PlacementIntent`.
- Exact-frame placement is allowed only when the whole provider request has
  exactly one image attachment and that image is a Photoshop Capture.
- Multi-image requests may retain document-only context only when every
  Photoshop Capture in the request comes from the same document.
- Placement must target the document captured at request time. It must not
  silently fall back to the placement-time active document.
- Capture must fail when no layer is selected or when multiple layers are
  selected. The first implementation does not auto-merge layers or choose the
  first active layer.
- MockProvider should echo input images for image-edit requests, preserving
  order. This is a content-path harness, not proof of real provider semantic
  input-output correspondence. It should keep synthetic output only for
  requests without images.

## Current State

`main-page.tsx` currently has a `target` state and a `ComposerSelect` rendered
as `composer-target-selector`. That control only changes UI state; it does not
materialize an attachment.

Attachments are currently created by the `+` menu:

- `pickImageFile()` creates file attachments.
- `readLayerAsAsset(layerId)` creates layer attachments.

`useConversation` chooses workflow by attachment count:

- no attachments -> `provider-generate`
- attachments -> `provider-edit`

For edit requests, `useConversation` sends only the asset bytes/references:

```ts
images: attachments.map((attachment) => attachment.image.asset)
```

Current output placement is also first-only:

- `outputAssets(job.output)` extracts provider result assets.
- `round.previews` stores those output assets as previews.
- `placeAsset(round)` takes `round.previews[0]?.asset`.
- `host.placeAssetOnCanvas(asset)` receives only the asset.

`HostPort.placeAssetOnCanvas(asset)` has no placement intent. The UXP bridge
writes the image bytes to a temporary file, creates a session token, and runs
`batchPlay({ _obj: 'placeEvent' })` inside `executeAsModal()`.

`readLayerAsAsset(layerId)` reads layer pixels through `imaging.getPixels`, but
currently:

- it takes an explicit layer id from the layer picker, not Photoshop active
  layer state;
- it encodes JPEG through `imaging.encodeImageData`;
- it uses `applyAlpha: false`, which is correct for preserving transparency;
- the real defect is that the later JPEG/base64 path cannot preserve transparent
  PNG upload content;
- it does not store capture frame, document snapshot, upload size, or placement
  intent metadata.

MockProvider currently ignores request images and always returns synthetic PNG
assets.

## Reference Findings

### Adobe UXP And Photoshop

Selection:

- `selection.bounds` returns `null` when there is no active selection.
- The selection is pixel-based; 8-bit transparency is possible.
- `selection.solid` is false for non-rectangular selections.
- Selection bounds are a rectangle and can exceed canvas bounds.

Imaging:

- `imaging.getPixels` accepts `documentID`, optional `layerID`,
  `sourceBounds`, `targetSize`, `colorSpace`, `componentSize`, and
  `applyAlpha`.
- `getPixels` may trim the provided `sourceBounds` to pixel-bearing data. The
  implementation must pad/trim back to the requested frame when exact frame
  dimensions matter.
- When `targetSize` is smaller than the requested region, Photoshop may use a
  cache pyramid level, and returned `sourceBounds` can be relative to that cache
  level.
- `imaging.getSelection` returns a pixel representation of the current active
  selection and accepts `sourceBounds` and `targetSize`.
- `imaging.encodeImageData` is documented for JPEG/base64 use with UXP image
  elements. It is not a transparent PNG encoder.

Layer and writeback:

- Layer DOM exposes `bounds`, `boundsNoEffects`, `scale()`, and `translate()`.
- Photoshop state changes must run inside `executeAsModal`.
- BatchPlay is allowed for advanced commands, but the DOM should be preferred
  when it can express the operation.
- Existing `placeEvent` usage is source-level evidence for basic import, not
  proof of exact smart object placement.

### Monorepo Reference

The monorepo implements the core model this Loop should copy conceptually:

- It separates content, boundary, mask, and materialized resource.
- `get-image.ts` computes desired bounds, intersects with actual layer/canvas
  pixels, downscales by max edge, pads/trims to desired bounds, applies mask
  alpha, and returns image data.
- `get-selection.ts` obtains a selection mask with `imaging.getSelection`,
  aligns bit depth, and pads/trims it to the desired frame.
- `image-processing.ts` has the critical alpha operation:
  layer pixel alpha is multiplied by mask alpha, and fully transparent pixels
  have RGB cleared.
- The UXP resource holder stores materialized file/resource entries separately
  from the UI preview.
- Provider task completion captures `docId` and `boundaryUri` at task start,
  then appends each returned output into the preview store with that boundary
  context.
- Preview send calls `sdpppSDK.plugins.photoshop.importImage({ resource,
  boundaryUri, type: 'smartobject' | 'newdoc', sourceWidth, sourceHeight })`.
- The SDK type declares `importImage` with `resource`, `boundaryUri`,
  `sourceWidth`, `sourceHeight`, and `maskUri`. The TypeScript source for the
  host-side implementation is not fully visible outside the bundled plugin, so
  this repository must verify its own writeback behavior in real Photoshop.

Important adaptation:

- Do not import the monorepo resource URI system.
- Do copy the content/boundary/mask/materialized-resource separation.
- Do copy the rule that request/round records carry enough placement context
  for writeback.
- Do add real Photoshop smoke for placement, because the reference is external
  and current repo tests cannot prove host behavior.

## Product Contract

### Capture Button

The composer toolbar replaces `Target` with `Capture`.

Expected UI behavior:

- `Capture` is visible next to other input controls.
- It is disabled while a conversation job is running or while capture is
  already in flight.
- It has an icon-first affordance and tooltip/label copy through existing app
  i18n.
- It appends an attachment to the attachment area, matching `+` behavior.
- It does not send the request.
- Capture errors are shown immediately at capture time.

Capture algorithm:

1. Resolve active Photoshop document and freeze a capture snapshot.
2. Require exactly one selected Photoshop layer.
3. Read the snapshot selection bounds once.
4. If bounds exist, materialize a selection capture from the active layer.
5. If bounds are `null`, materialize a layer capture from the active layer.
6. Encode the materialized image as PNG.
7. Return `PhotoshopCaptureResult`.
8. UI converts the result into a `ConversationAttachment`.

Snapshot rule:

```ts
interface PhotoshopCaptureSnapshot {
  readonly documentId: number;
  readonly documentSize: PhotoshopSize;
  readonly layerId: number;
  readonly layerBoundsNoEffects: PhotoshopRect;
  readonly selectionBounds: PhotoshopRect | null;
}
```

- All later imaging calls must pass explicit `documentID`, `layerID`, and
  `sourceBounds` from the snapshot.
- The capture pipeline must not re-read `activeDocument`, `activeLayers`, or the
  active selection to decide source identity after the snapshot is created.
- If the snapshot source becomes invalid before pixels are read, capture fails
  visibly instead of switching to the new active Photoshop state.
- `activeLayers.length === 1` is required. Zero or multiple active layers are
  capture errors.

Selection capture semantics:

- Use canonical selection bounds as the full `captureRect`.
- Read active layer pixels intersecting that frame.
- Read selection mask for the same `captureRect`.
- Map pixels and mask back to the same final upload grid.
- Apply mask alpha to layer pixels.
- Clear RGB where alpha becomes zero.
- Encode a rectangular PNG preserving transparency.

Layer capture semantics:

- Use active layer `boundsNoEffects` as the default source frame.
- Preserve layer alpha when available.
- Pad/trim to the intended layer frame when Photoshop trims returned pixels.
- Encode PNG, not JPEG.
- If product behavior later requires layer effects or composite capture, define
  that as a separate mode instead of mixing it with pixel-layer capture.

Fallback:

- No selection -> active layer.
- No active document -> capture error.
- No active layer -> capture error.
- Multiple active layers -> capture error.
- Empty or unreadable layer frame -> capture error.
- Unsupported document/color mode -> either convert through documented imaging
  options or stop with a Decision Packet if conversion is not evidenced.

Resource lifecycle:

- Every Photoshop `ImageData` or selection image object returned by Imaging APIs
  must be disposed in `finally`.
- The capture path must estimate memory before allocating full-frame RGBA
  buffers: normalized width, normalized height, pixel count, RGBA byte count,
  and intermediate buffer multiplier.
- Oversized captures must apply deterministic max-edge downscale before full
  allocation or return a visible error.

### Send Behavior

`Send` must not inspect Photoshop state.

Expected behavior:

- The submit path must carry explicit operation intent.
- `operation: 'image-edit'` with no attachments is rejected in the hook/domain
  path before provider invocation.
- UI disabled state is only the first UX layer; it is not the behavior
  contract.
- If a future explicit text-to-image mode is needed, it should be a separate UI
  operation such as `operation: 'text-to-image'`, not implicit fallback from
  empty attachments.
- Retry must preserve the original round operation and placement intent. It
  must not re-read Photoshop state.

Reason:

- The plugin's dominant workflow is image editing.
- A silent send-time capture makes the uploaded image invisible to the user.
- Explicit capture lets the user inspect exactly what will be uploaded.

### Placement

Each captured attachment stores placement metadata next to the app-side
attachment, not inside provider `Asset`.

Each conversation round stores one request-level `PlacementIntent` computed
from the submitted attachments. Provider outputs inherit that round-level
intent; they are not paired to input attachments by index.

Placement intent derivation:

- One Photoshop Capture image and no other image attachments -> `exact-frame`.
- One Photoshop Capture plus any local/reference image -> `document-only`.
- Multiple Photoshop Captures from the same document -> `document-only`.
- Captures from multiple documents -> `unbound`.
- Only local files or no Photoshop Capture -> `unbound`.
- Local file attachments do not create a document conflict by themselves, but
  their presence prevents `exact-frame`.

Exact-frame placement:

- All returned outputs are variations for the same request-level frame.
- The user places one selected output at a time.
- The app does not automatically stack every variation into Photoshop.
- The output is imported as an embedded smart object and transformed to the
  captured `placementRect`.

Document-only placement:

- The output is directed to the captured document.
- It uses ordinary smart-object placement.
- It does not scale or translate to any captured layer or selection frame.

Unbound placement:

- The app must not silently choose the first capture, last capture, first
  attachment, or current active document.
- The first implementation may block automatic placement with a visible target
  ambiguity error, or require an explicit user-confirmed ordinary import target.

Placement target:

- Output should be imported as an embedded smart object when exact frame
  placement is requested.
- The smart object should visually occupy the original captured document
  rectangle.
- If the provider returns a different pixel size, scale the placed object to
  the original captured frame dimensions.
- If the provider returns a different aspect ratio, fill the original frame only
  when this behavior is explicitly accepted by implementation evidence. Default
  stop rule: produce a Decision Packet before choosing crop, contain, stretch,
  or fallback.
- Placement resolves and targets the stored `documentId`. If the document no
  longer exists, placement fails visibly.
- Exact-frame placement checks `documentSizeAtCapture` before transform. If the
  document coordinate space changed, it must block or explicitly degrade; it
  must not silently pretend exact placement is reliable.

### Scaling Strategy

Do not introduce PyTorch or any ML runtime for image scaling in this Loop.

There are two independent strategy axes:

- `captureDownscaleMode`: `photoshop-target-size` or `app-area`.
- `placementScaleMode`: `smart-object-transform` or `raster-bilinear`.

Default strategy:

```ts
export const DEFAULT_IMAGE_RESIZE_STRATEGY = {
  captureDownscaleMode: 'photoshop-target-size',
  placementScaleMode: 'smart-object-transform',
  sizePolicy: {
    maxSide: 1028,
    multiple: 2,
    maxAspectError: 0.0005,
    minLongSideUtilization: 0.9,
  },
} as const;
```

Capture/upload downscale:

- Compute the upload size before reading pixels.
- Prefer dimensions whose width and height are multiples of `2`.
- If an even size would distort aspect ratio beyond `maxAspectError`, allow an
  effective multiple of `1` and record that fallback.
- Compute exact `scaleX = uploadSize.width / captureRect.width` and
  `scaleY = uploadSize.height / captureRect.height` when needed. These are
  diagnostic values, not placement authority.
- In default `photoshop-target-size` mode, pass the resolved upload size as
  Photoshop Imaging `targetSize` for both layer pixels and selection mask. This
  keeps the capture path close to Photoshop's native pixel pipeline and avoids a
  second app-side resample before upload.
- In fallback `app-area` mode, read the frame at source size and use the shared
  TypeScript `downscaleArea` helper on RGBA bytes. Area resampling is the named
  contract for downscale; do not describe this as a generic box or nearest
  resize.

Result placement scale:

- Default `smart-object-transform` mode does not upscale bytes in the app.
- Import the returned asset as an embedded smart object, then transform it to
  the original `placementRect`.
- Smart object transform preserves the returned source pixels as editable source
  data, but Photoshop can still resample for display or export.
- Only `raster-bilinear` mode may generate raster bytes at the original frame
  size, using shared TypeScript `upscaleBilinear`.

Alpha rule:

- Any app-side resize must premultiply RGB by alpha, resize, then
  unpremultiply.
- Fully transparent output pixels must have RGB cleared to zero.
- Provider upload assets use straight alpha at the PNG boundary.

Fallback rule:

- If Photoshop Imaging `targetSize` cannot preserve frame math, alpha, or mask
  alignment in fake tests and real host smoke, switch the strategy variable to
  `app-area` only after the shared TypeScript helper has matching harness
  coverage for the affected case.
- Do not add Node-only, native, GPU, Python, or ML runtimes for resize.
- PNG encoding and resizing are separate concerns. The PNG encoder only writes
  the final RGBA buffer; it does not decide placement scale.

Provider upload pixel contract:

- PNG.
- 8-bit per component.
- RGB or RGBA, interleaved channels.
- Straight alpha at asset boundary.
- Explicit color-space conversion before upload.
- Selection mask is normalized to one-channel 8-bit alpha.
- Final alpha is `layerAlpha * selectionAlpha`.
- If final alpha is zero, RGB is zero.

Pixel grid and bounds:

Canonical bounds normalization:

```ts
left = Math.floor(bounds.left);
top = Math.floor(bounds.top);
right = Math.ceil(bounds.right);
bottom = Math.ceil(bounds.bottom);

width = right - left;
height = bottom - top;
```

The capture pipeline must keep these concepts separate:

- `captureRect`: full user-semantic capture frame.
- `readRect`: intersection of `captureRect` with valid layer/canvas pixels.
- `returnedSourceBounds`: source bounds actually returned by Photoshop Imaging.
- `uploadSize`: final encoded PNG pixel size.

`requested capture rect == returned source bounds == output PNG dimensions` is
not a valid assumption.

Examples:

- Original document: `1000x1000`.
- Selection: `100x100` at `{ left: 300, top: 400 }`.
- Uploaded PNG: `100x100`, or downscaled equivalent with metadata retaining the
  original frame.
- Provider returns `100x100`, `512x512`, or `1000x1000`.
- Placement creates a smart object positioned at `{ left: 300, top: 400 }` and
  visually sized to `100x100` in the original document.

Layer scale example:

- Original active layer frame: `2048x2048`.
- Upload max edge policy downscales to `1024x1024` or another configured max.
- Provider returns `512x512` or `1024x1024`.
- Placement scales the returned image back to `2048x2048` and positions it at
  the original layer frame.

## Data Model

### App-Side Frame Types

Keep frame metadata in `apps/app` domain code.

Proposed shape:

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

export type PhotoshopCaptureKind = 'selection' | 'layer';

export interface PhotoshopCaptureFrame {
  readonly captureId: string;
  readonly kind: PhotoshopCaptureKind;
  readonly documentId: number;
  readonly layerId: number;
  readonly documentSizeAtCapture: PhotoshopSize;
  readonly captureRect: PhotoshopRect;
  readonly placementRect: PhotoshopRect;
  readonly uploadSize: PhotoshopSize;
  readonly resizeStrategy: {
    readonly captureDownscaleMode: 'photoshop-target-size' | 'app-area';
    readonly placementScaleMode: 'smart-object-transform' | 'raster-bilinear';
    readonly requestedMultiple: number;
    readonly effectiveMultiple: number;
    readonly aspectError: number;
  };
}

export interface PhotoshopCaptureResult {
  readonly image: HostImageAsset;
  readonly frame: PhotoshopCaptureFrame;
}

export type PlacementIntent =
  | {
      readonly kind: 'exact-frame';
      readonly documentId: number;
      readonly documentSizeAtCapture: PhotoshopSize;
      readonly placementRect: PhotoshopRect;
    }
  | {
      readonly kind: 'document-only';
      readonly documentId: number;
    }
  | {
      readonly kind: 'unbound';
    };
```

Rules:

- `captureRect` is the full Photoshop document-space rectangle represented by
  the uploaded image.
- `placementRect` is the Photoshop document-space rectangle the result should
  occupy.
- `uploadSize` is the actual PNG size sent to providers.
- `scaleX = uploadSize.width / captureRect.width` and
  `scaleY = uploadSize.height / captureRect.height` are computed when needed,
  not stored as authority.
- `resizeStrategy` records the exact strategy and rounding fallback used for
  this captured image, so later writeback/debug output can explain the uploaded
  pixels.
- `documentSizeAtCapture` is the first stale-context guard for exact-frame
  placement.
- `documentId` is a reference for the currently open Photoshop document
  lifetime. It is not durable across Photoshop restart or document close/reopen.
- `HostImageAsset` describes image content only. `PhotoshopCaptureFrame`
  describes Photoshop placement context only. `ConversationAttachment` combines
  them.
- Provider APIs do not see capture frame or placement intent unless a future
  accepted slice explicitly adds provider metadata.

### Attachment Extension

Extend `ConversationAttachment` to include optional frame metadata:

```ts
export interface ConversationAttachment {
  readonly id: string;
  readonly type: 'layer' | 'file' | 'capture';
  readonly name: string;
  readonly image: HostImageAsset;
  readonly previewUrl: string;
  readonly photoshopFrame?: PhotoshopCaptureFrame;
}

export interface ConversationRound {
  readonly attachments: readonly ConversationAttachment[];
  readonly placementIntent: PlacementIntent;
}
```

Manual file attachments usually have no Photoshop frame. Existing layer-picker
attachments may be upgraded to include layer frame metadata in this Loop only
if the same code path naturally reuses capture materialization.

### Placement Intent And Host Port

Do not change `ProviderInvokeResult.assets`.

Compute `ConversationRound.placementIntent` once at send time from the submitted
attachment snapshot:

- Do not recompute it from provider outputs.
- Do not pair provider outputs to input indexes.
- Do not mutate provider result contracts.
- Retry reuses the original operation and placement intent.

The host placement port should be explicit and discriminated:

```ts
export type HostPlacementIntent =
  | { readonly kind: 'default' }
  | { readonly kind: 'document-only'; readonly documentId: number }
  | {
      readonly kind: 'exact-frame';
      readonly documentId: number;
      readonly documentSizeAtCapture: PhotoshopSize;
      readonly placementRect: PhotoshopRect;
    };

placeAsset(asset: HostImageAsset, intent: HostPlacementIntent): Promise<void>;
```

App-side `PlacementIntent` may be isomorphic to `HostPlacementIntent` or mapped
through a pure helper.

If durable history/retry must preserve frame metadata, either:

- keep the frame metadata inside `ConversationRound` snapshots owned by
  `apps/app`, or
- stop and produce a Decision Packet before moving this into
  `packages/application`.

## Ownership Boundary

`apps/app` owns:

- Capture button UI.
- Attachment state.
- Photoshop/UXP active selection and active layer capture.
- PNG materialization for Photoshop captures.
- Placement metadata.
- Request-level placement intent derivation.
- UXP placement implementation.
- Chrome simulator/fake host contract fixtures.
- Manual Photoshop smoke checklist.

`packages/providers` owns:

- MockProvider echo behavior.
- Provider schema/tests proving image-edit requests with `images` return those
  images as result assets in mock mode.

`packages/providers` must not own:

- Photoshop geometry.
- App attachment state.
- Host IO.
- Placement behavior.

`packages/application` owns:

- Existing workflow request mapping.
- Durable job history and asset materialization if an accepted slice proves
  frame data must cross that boundary.

`packages/core-engine` must remain host-agnostic:

- No Photoshop frame types.
- No DOM/UXP/file-system dependencies.

## Proposed Implementation Slices

Expected files listed below are a guide, not a hard allowlist. Necessary files
inside the same ownership boundary may be changed when reported. Cross-package
ownership changes still require the slice to stop and produce a Decision
Packet. Package manifests, lockfiles, build config, and shared test fixtures are
not accidentally forbidden when they are required by the slice.

### Slice 1: Define Capture And Placement Domain Contract

Owner: `apps/app`

Expected files:

- `apps/app/src/shared/domain/host-image-asset.ts`
- `apps/app/src/shared/domain/*capture*.ts`
- `apps/app/src/shared/domain/*placement*.ts`
- `apps/app/src/shared/image/resize.ts`
- `apps/app/tests/**`

Tasks:

- Add `PhotoshopCaptureFrame`, `PhotoshopCaptureResult`, and
  request-level `PlacementIntent`.
- Add canonical rect normalization helpers.
- Add helpers for `captureRect`, `readRect`, returned source bounds mapping,
  pad/trim, intersection, and allocation budget checks.
- Add `derivePlacementIntent(attachments)`:
  - one Photoshop Capture image only -> `exact-frame`;
  - any multi-image request with same-document captures -> `document-only`;
  - no captures or captures from multiple documents -> `unbound`.
- Add shared image resize strategy helpers:
  - `RgbaImage`;
  - `resolveModelSize(originalSize, policy)`;
  - `resolveCaptureUploadPlan(originalSize, strategy)`;
  - `downscaleArea(image, targetSize)`;
  - `upscaleBilinear(image, targetSize)`.
- Keep helpers pure: only `Uint8Array` RGBA plus width/height in and out. No
  DOM, Canvas, UXP, Photoshop, Python, native, GPU, or ML dependency.
- Add tests for bounds rounding, intersections, pad/trim, alpha multiplication,
  RGB clearing, premultiplied-alpha resize, out-of-canvas rects, empty
  intersections, oversized allocation guard, and placement-intent derivation.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy`

Stop rule:

- Stop if TypeScript pressure suggests moving Photoshop frame types into
  `packages/core-engine`, `packages/application`, or `packages/providers`.

### Slice 2: HostPort Contract And Fakes

Owner: `apps/app`

Expected files:

- `apps/app/src/shared/ports/host-port.ts`
- `apps/app/tests/**`

Tasks:

- Add `HostPort.captureActiveImage(): Promise<PhotoshopCaptureResult>`.
- Add `placeAsset(asset, intent)` with a discriminated `HostPlacementIntent`.
- Keep `HostImageAsset` content-only; do not move Photoshop metadata into it.
- Update fakes to return deterministic capture result fixtures.
- Add tests proving host calls carry explicit placement intent.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy`

Stop rule:

- Stop if host placement API shape requires provider or application package
  ownership changes.

### Slice 3: Remove Target, Add Capture Attachment UI

Owner: `apps/app`

Expected files:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/i18n/**`
- `apps/app/tests/main-page.test.tsx`
- `apps/app/tests/fakes.ts`

Tasks:

- Remove `target` state and `composer-target-selector`.
- Add `Capture` button in the same toolbar region.
- Add `capture` in-flight state and duplicate-click guard.
- Call the finalized host capture port.
- Convert `PhotoshopCaptureResult` to `ConversationAttachment`.
- Append captured result to `attachments`.
- Ensure Capture never sends.
- Ensure Send never captures.
- Update tests for capture success, error display, in-flight state, and no
  implicit capture.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:chrome`

Stop rule:

- Stop if existing product requirements still need text-to-image from the same
  send button without an explicit operation. Produce a Decision Packet for
  "image-edit-only send" vs "explicit mode switch".

### Slice 4: UXP Capture Materialization

Owner: `apps/app` UXP adapter

Expected files:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/shared/image-payload-preflight.ts`
- `apps/app/tests/**`

Tasks:

- Create immutable `PhotoshopCaptureSnapshot` at capture start.
- Require exactly one selected layer.
- Read `selection.bounds` once for the snapshot.
- Normalize bounds through the canonical rect helper.
- Use `boundsNoEffects` for default layer capture frame.
- For selection:
  - compute `captureRect` from selection bounds;
  - compute `readRect` by intersecting with valid layer/canvas pixels;
  - resolve upload size and resize strategy;
  - read layer pixels with `applyAlpha: false` so transparency remains a
    channel instead of being composited away;
  - in default `photoshop-target-size` mode, read active layer pixels for the
    snapshot `documentID`, `layerID`, and `sourceBounds` with
    `targetSize = uploadSize`;
  - read selection mask for the same `captureRect` with the same `targetSize`;
  - normalize selection mask to one-channel 8-bit alpha;
  - align image data bit depth to 8-bit;
  - pad/trim to upload dimensions;
  - apply mask alpha;
  - encode PNG.
- For no selection:
  - compute capture frame from active layer bounds;
  - resolve upload size and resize strategy;
  - read layer pixels with `applyAlpha: false`;
  - in default `photoshop-target-size` mode, read active layer pixels with
    `targetSize = uploadSize`;
  - preserve alpha;
  - pad/trim to upload dimensions;
  - encode PNG.
- Record `uploadSize`, `requestedMultiple`, `effectiveMultiple`, `aspectError`,
  strategy mode, `documentId`, and `documentSizeAtCapture`.
- Use the same upload target size for layer pixels and selection mask so alpha
  alignment is stable after downscale.
- If strategy is switched to `app-area`, read the frame at source size and call
  shared `downscaleArea` before mask alpha/PNG encoding.
- Dispose every Photoshop `ImageData`/selection image object in `finally`.
- Estimate capture memory before allocating full-frame RGBA buffers.
- Preview and provider upload must reference the same materialized PNG bytes.
  Do not create one preview rendition and a different provider-upload payload.
- Add fake UXP tests for single-layer success, no-document error, no-layer
  error, multiple-layer error, selection/non-selection branches, selection mask
  alpha, empty layer error, `targetSize` plumbing, fallback strategy plumbing,
  disposal, allocation guard, and metadata values.

Implementation notes:

- Do not use `imaging.encodeImageData` for PNG.
- Choose an app-compatible PNG encoder. If adding a dependency is required,
  produce a small Decision Packet comparing dependency options and UXP
  compatibility evidence.
- Borrow the monorepo algorithmic shape:
  desired bounds -> intersect -> scaled bounds -> pad/trim -> apply mask alpha.
- Do not upscale returned bytes in the default placement flow. Use embedded
  smart object import plus transform to `placementRect`.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:uxp`

Stop rule:

- Stop if UXP cannot provide RGBA data or transparent PNG encoding with current
  dependencies and documented APIs.

### Slice 5: Explicit Send Operation And PlacementIntent

Owner: `apps/app`

Expected files:

- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/domain/mappers.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/tests/use-conversation.test.tsx`
- `apps/app/tests/main-page.test.tsx`

Tasks:

- Keep provider request `images` as plain assets.
- Add explicit operation intent to submit path.
- Reject `operation: 'image-edit'` with no attachments before provider
  invocation.
- Preserve captured attachments snapshot on the round.
- Compute and store `ConversationRound.placementIntent` at send time.
- Ensure Photoshop frame and placement intent do not enter provider requests.
- Retry preserves operation and placement intent and does not re-read Photoshop
  state.
- Update tests for empty-attachment rejection, request mapping, retry behavior,
  and placement-intent derivation.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm check:policy`

Stop rule:

- Stop if durable History retry must preserve placement frames across app
  restart and this cannot remain `apps/app` owned.

### Slice 6: MockProvider Echo

Owner: `packages/providers`

Expected files:

- `packages/providers/src/providers/mock/provider.ts`
- `packages/providers/tests/mock-provider.test.ts`

Tasks:

- For `image_edit` requests with `images.length > 0`, return all input images
  as `assets`, preserving order.
- Include debug-only `raw` fields showing operation, model, input count,
  returned count, and echo mode.
- Keep synthetic PNG output for `text_to_image` or image requests without
  images.
- Keep existing abort/failure/delay behavior.
- Name tests and docs as content-path harness evidence, not provider semantic
  correspondence.
- Do not carry Photoshop geometry in echo results.

Validation:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm check:policy`

Stop rule:

- Stop if echo behavior needs app state, host IO, local paths, or placement
  metadata inside provider contracts.

### Slice 7: UXP Smart Object Placement

Owner: `apps/app` UXP adapter

Expected files:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/tests/**`

Tasks:

- Keep current ordinary `placeEvent` fallback.
- Add placement paths for `document-only` and `exact-frame`.
- Resolve and target stored `documentId`; never fallback to active document.
- Add exact-frame path:
  - write asset bytes to temp file;
  - create session token;
  - run one `executeAsModal` mutation transaction;
  - suspend history where possible;
  - place/import as embedded smart object;
  - inspect placed layer bounds;
  - scale to `placementRect.width/height`;
  - re-read bounds if required;
  - translate to `placementRect.x/y`;
  - validate final bounds against tolerance;
  - resume history and cleanup temp file in success and failure paths.
- For `document-only`, place into the stored document without captured-frame
  scale/translate.
- For `unbound`, fail visibly or require explicit user target confirmation.
- Explicitly check BatchPlay result descriptors and cancellation states.
- If mid-transaction failure leaves partial work, report partial completion
  status rather than success.
- Add fake host tests for descriptor/DOM call sequence and frame math.
- Add fake host tests proving placement scale uses `placementRect`, not the
  returned asset pixel dimensions.
- Add fake host tests for missing document, no active-document fallback,
  document-size stale guard, document-only no-frame-transform behavior,
  BatchPlay error detection, temp-file cleanup, and history suspension
  success/failure paths.
- Add logs that expose document id, frame, asset size, placed bounds, scale, and
  translation without raw image bytes, session tokens, or local paths.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:uxp`

Manual-only validation:

- UXP Developer Tool + Photoshop smoke for layer capture placement.
- UXP Developer Tool + Photoshop smoke for rectangular selection placement.
- UXP Developer Tool + Photoshop smoke for non-rectangular selection alpha.
- UXP Developer Tool + Photoshop smoke for MockProvider echo upload preview.
- UXP Developer Tool + Photoshop smoke for exact-frame, document-only, and
  unbound placement.

Stop rule:

- Stop if `placeEvent` plus DOM `scale/translate` cannot reliably produce the
  expected smart object frame in real Photoshop. Produce a Decision Packet with
  alternatives: BatchPlay transform descriptor, place descriptor with explicit
  transform, or fallback placement.

### Slice 8: Chrome Simulator Parity

Owner: `apps/app`

Expected files:

- `apps/app/src/adapters/chrome/chrome-host-port.ts`
- `apps/app/src/simulators/photoshop/simulator.ts`
- `apps/app/tests/chrome-adapter.test.ts`
- `apps/app/tests/**`

Tasks:

- Expose capture capability as unavailable in Chrome host if simulator cannot
  model it.
- Or add deterministic simulator capture frames for app tests.
- Keep Chrome behavior explicit; do not pretend Chrome proves UXP host IO.
- Do not duplicate Photoshop Imaging algorithms in the simulator. Simulator
  fixtures should return fixed `HostImageAsset + PhotoshopCaptureFrame`
  contracts for UI/request tests only.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:chrome`
- Optional: `pnpm --filter @imagen-ps/app test:chrome-e2e`

Stop rule:

- Stop if simulator changes start duplicating Photoshop imaging logic too
  deeply. Keep simulator deterministic and contract-focused.

## Validation Plan

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
pnpm --filter @imagen-ps/providers test
```

Optional Chrome browser evidence:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Final:

```bash
pnpm validate
```

Automated coverage requirements:

- Capture contract:
  - single active layer capture succeeds;
  - no document errors;
  - no selected layer errors;
  - multiple selected layers errors;
  - selection and no-selection branches;
  - Capture does not trigger Send;
  - Send does not trigger Capture;
  - capture in-flight prevents duplicate calls.
- Request rules:
  - image-edit without attachments is rejected in hook/domain code;
  - attachments map only to plain provider assets;
  - Photoshop frame never enters provider request;
  - retry preserves operation and placement intent.
- PlacementIntent derivation:
  - one Photoshop Capture -> `exact-frame`;
  - one Photoshop Capture plus local file -> `document-only`;
  - multiple same-document captures -> `document-only`;
  - captures from different documents -> `unbound`;
  - local files only -> `unbound`.
- MockProvider:
  - echoes all input images in order;
  - keeps synthetic output without input images;
  - does not mutate stable provider asset contract;
  - does not carry Photoshop geometry.
- Pixel helpers:
  - canonical bounds rounding;
  - intersection;
  - pad/trim;
  - layer alpha multiplied by selection alpha;
  - RGB zeroed when alpha is zero;
  - premultiplied-alpha resize;
  - out-of-canvas rects;
  - empty intersection;
  - oversized allocation guard.
- Placement host mapping:
  - targets stored `documentId`;
  - fails when original document is missing;
  - never falls back to current document;
  - exact-frame scale/translate math;
  - document-only does not run captured-frame transform;
  - BatchPlay error result is detected;
  - temp file cleanup;
  - history suspension success/failure paths.

Manual-only:

- Build UXP app.
- Reload `apps/app/dist/manifest.json` in UXP Developer Tool.
- Record numeric evidence for every placement smoke:
  - `documentId`;
  - document size at capture;
  - `captureRect`;
  - upload pixel size;
  - output pixel size;
  - placed bounds before transform;
  - `scaleX` / `scaleY`;
  - `translationX` / `translationY`;
  - actual bounds after transform;
  - expected bounds;
  - tolerance.
- Cover:
  - ordinary active layer capture;
  - rectangular selection;
  - feathered or anti-aliased selection;
  - non-rectangular selection;
  - selection extending outside canvas;
  - layer partially outside canvas;
  - background layer / no-alpha source;
  - large-image downscale and placement;
  - provider output size different from input upload size;
  - one input with multiple outputs, placing selected outputs one at a time;
  - one Capture plus local references -> document-only placement;
  - multiple captures from one document -> document-only placement;
  - captures from multiple documents -> unbound placement;
  - active document switched after capture;
  - original document closed;
  - document resized/cropped after capture;
  - BatchPlay/transform forced failure;
  - repeated captures for memory stability.

Live-provider:

- No default live-provider gate. There is currently no active live-provider
  smoke harness after CLI removal.

## Decision Packet Triggers

Produce a concise A/B/C Decision Packet before continuing if:

- Transparent PNG encoding cannot be implemented with current UXP-compatible
  dependencies.
- Capture downscale cannot be proven with Photoshop Imaging `targetSize`, and
  the shared TypeScript `app-area` fallback also cannot satisfy the affected
  frame, alpha, or mask case.
- Active layer capture cannot preserve alpha with documented Imaging APIs.
- Photoshop returns trimmed/cache-relative bounds that cannot be mapped back to
  the original document frame in tests.
- Capture cannot reliably freeze source context across async imaging calls.
- Multiple selected layers must be supported in the same release.
- Exact placement would require silently targeting active document instead of
  stored `documentId`.
- The app needs frame metadata inside provider `Asset` or provider stable
  result contracts.
- Durable placement retry/history requires cross-boundary changes into
  `packages/application` or `packages/core-engine`.
- A provider or product requirement needs output-index-to-input-index semantic
  correspondence.
- Returned output aspect ratio differs from captured frame and there is no
  accepted rule for stretch, contain, crop, or fallback.
- Real Photoshop smart object placement contradicts fake-host assumptions.
- Empty-attachment send must keep text-to-image behavior in the same UI without
  an explicit mode.

## Acceptance Criteria

- The old `Target` selector is gone.
- `Capture` appends an attachment and never sends implicitly.
- Capture returns `PhotoshopCaptureResult`; `HostImageAsset` remains
  content-only.
- Capture freezes document/layer/selection snapshot at start and rejects zero or
  multiple selected layers.
- Selection capture uploads a rectangular PNG with transparent pixels outside
  the selection shape.
- No-selection capture falls back to the active Photoshop layer.
- Send uses explicit operation intent.
- Image-edit with no attachments is rejected below UI before provider
  invocation.
- Send with attachments sends plain provider assets; Photoshop geometry stays
  app-side.
- MockProvider image-edit echoes all input images in order.
- MockProvider echo is documented and tested as a content-path harness only.
- Provider contracts remain host-agnostic.
- Conversation rounds store one request-level `PlacementIntent`.
- Outputs are not mapped to inputs by index.
- Exact-frame placement occurs only for a single-image request whose only image
  is one Photoshop Capture.
- Multi-image requests produce document-only or unbound placement, never
  inferred frame placement.
- Placement targets stored `documentId` and never silently falls back to current
  active document.
- Placement imports an embedded smart object and scales/translates it to the
  original captured document rectangle only when exact-frame intent and real
  Photoshop evidence support the chosen implementation.
- Repo-side tests cover UI state, request mapping, mock echo behavior, frame
  placement intent, pixel helpers, and fake host call mapping.
- Manual Photoshop smoke records numeric real-host results before claiming exact
  placement correctness.

## Completion Report Template

Executing agents must report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Manual Photoshop evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

`Memory note candidate` should be `yes: architecture` only if implementation
settles a durable Photoshop capture/placement rule that does not belong in
current authoritative docs. Otherwise use `no`.
