# Image Resource Derivative Lifecycle

Status: draft
Authority: current user planning request on 2026-06-29; not a standing root `AGENTS.md` declaration
Owner: `apps/app`, `packages/application`, `packages/core-engine`
Created: 2026-06-29

## Context Docs

- Current authority: root `AGENTS.md`, `docs/agent/LOOP.md`,
  `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, package `AGENTS.md` files.
- Active related draft / current sprint context:
  `docs/loops/2026-06-29-provider-bounded-image-pipeline.md`.
- Historical reference:
  `docs/dev-memory/memories/architecture/image-ownership-peak-memory-audit.md`.
- Local Adobe docs mirror checked for planning evidence:
  `.local/share/uxp-photoshop`, `.local/share/uxp`,
  `.local/share/uxp-photoshop-plugin-samples`.
- Local reference implementation checked for planning evidence:
  `Documents/github/monorepo` on the user's machine. It is reference code, not
  repository authority.

## Evidence Summary

- Current app manifest targets Photoshop `26.1.0` with Manifest v5 and
  `localFileSystem: request`; UXP/browser capability must be checked against
  that floor.
- Adobe Photoshop Imaging docs say `getPixels.targetSize` is intended for
  scaled returns, including thumbnails, and advise requesting the smallest
  possible target size and calling `PhotoshopImageData.dispose()` after use.
- Adobe UXP canvas docs say `HTMLCanvasElement` supports only basic shapes.
  Do not assume browser-grade image decode / drawImage / canvas export unless
  host smoke proves it.
- Adobe UXP `ImageBlob` docs support compressed image `ArrayBuffer` and
  uncompressed pixels as image URLs in Photoshop, but do not provide a complete
  resize / transcode pipeline by themselves.
- Adobe UXP `AbortSignal` docs say it works only for web streams. Treat abort as
  cooperative for app code and network, not as proof that Photoshop imaging or
  file APIs are natively interruptible.
- Reference `monorepo` uses a `resource.thumbnail` action and `useThumbnail`
  hook shape: UI asks for thumbnails through a resource action rather than
  coupling preview generation to upload bytes. It also uses `AbortSignal` checks
  cooperatively around image work.
- Reference `monorepo` has a Jimp-based binary decode/resize path in
  `cbm-calculator`; this proves one possible JavaScript implementation pattern,
  not compatibility or bundle suitability for this repo's UXP floor.

## Goal

Introduce a unified image resource and derivative lifecycle so every UI image
uses a bounded thumbnail derivative, every provider-bound image uses a bounded
provider derivative, and attachment/session cancellation can stop or ignore
in-flight derivative and dispatch work without leaving long-lived inline image
payloads.

Observable outcome:

- local files, Photoshop captures/layers, and provider outputs all expose one
  resource descriptor with separately managed `thumbnail` and `providerInput`
  derivatives;
- UI pages render thumbnails from the derivative service instead of ad hoc data
  URLs;
- provider request input resolves only provider derivatives;
- attachment removal, conversation clear, send cancel, and profile switch call a
  shared cancellation / release path;
- mock-only tests cover all contracts and `pnpm validate` passes.

## Non-Goals

- No live provider smoke in the default gate.
- No claim that jsdom/fake UXP proves real Photoshop host memory behavior.
- No broad UI redesign or history-page redesign.
- No provider transport rewrite beyond passing abort / asset refs through the
  existing application dispatch seam.
- No new Node-only, native, GPU, Python, or external helper runtime in the app.
- No JavaScript upscale of provider output back to Photoshop source geometry.
- No unsupported browser API assumption in UXP. If a local-file resize path
  cannot be evidenced, produce a Decision Packet.

## Scope

Allowed:

- `apps/app/src/shared/domain/`
- `apps/app/src/shared/image/`
- `apps/app/src/shared/ports/`
- `apps/app/src/shared/ui/`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- `apps/app/src/simulators/`
- `apps/app/tests/`
- `packages/application/src/session/`
- `packages/application/src/commands/`
- `packages/application/src/runtime.ts`
- `packages/core-engine/src/runtime.ts`
- `packages/core-engine/src/runner.ts`
- focused docs in `docs/ENGINEERING_CONTEXT.md` or `docs/dev-memory/` only if
  durable knowledge remains after implementation.

Forbidden unless re-scoped:

- `packages/providers` transport contract changes beyond consuming existing
  canonical image assets and abort signals.
- Node `fs/path/os`, Photoshop, UXP, DOM, React, or local paths in
  `packages/application` or `packages/core-engine`.
- Adding large third-party image libraries to the UXP bundle without a separate
  size / compatibility Decision Packet.
- Persisting raw original local-file bytes, full data URLs, or full decoded
  pixels in React state, JobStore, durable history, or logs.
- Treating `.local` docs mirror paths as portable repository paths in committed
  high-authority docs.

## Ownership Boundary

- `apps/app` owns image resource descriptors, host IO, thumbnails, derivative
  generation, host storage refs, object URL lifecycle, and React binding.
- `apps/app` UXP adapter owns Photoshop Imaging calls, local file picker reads,
  temporary document / file experiments, and cleanup of UXP object URLs/files.
- `apps/app` Chrome adapter owns browser-only fake/local derivative behavior for
  tests and development parity.
- `packages/application` owns session command orchestration, job submit/retry
  dedupe, dispatch-time storedRef resolution, abort/cancel command surface, and
  durable history sanitization. It must see only generic `Asset`/`storedRef`
  metadata and optional `AbortSignal`.
- `packages/core-engine` owns job lifecycle, runner hooks, and cancellation state
  semantics. It must not own image decode, host storage, or UI resources.
- `packages/providers` continues to own provider request validation and
  transport. It must not own host thumbnail/provider derivative generation.

## Target Contract

Define a host-owned image resource contract in `apps/app` with these logical
parts. Exact names should follow current code style:

```ts
interface ImageResource {
  id: string;
  source: 'local-file' | 'photoshop-layer' | 'photoshop-capture' | 'provider-output';
  original?: {
    width?: number;
    height?: number;
    mimeType?: string;
    name?: string;
    byteSize?: number;
    storedRef?: StoredAssetRef;
    externalUrl?: string;
  };
  derivatives: {
    thumbnail?: ImageDerivativeState;
    providerInput?: ImageDerivativeState;
  };
  placement?: PhotoshopCapturePlacement;
}

interface ImageDerivativeState {
  kind: 'pending' | 'ready' | 'failed' | 'cancelled';
  role: 'thumbnail' | 'provider-input';
  width?: number;
  height?: number;
  mimeType?: string;
  storedRef?: StoredAssetRef;
  previewUrl?: string;
  errorMessage?: string;
}
```

Required semantics:

- thumbnail derivative is for UI only, default max long side `256` or `512`
  decided in implementation after UI audit;
- provider derivative follows `resolveProviderInputPlan()` with
  `providerInputMinSide: 1024`, selected profile `imageMaxSide`, and dimension
  multiple;
- thumbnail and provider derivatives are independent; thumbnail readiness must
  not imply provider readiness;
- provider request builder sees only provider derivative assets;
- UI pages see only thumbnail URL / state, not original or provider bytes;
- all object URLs have a dispose owner;
- every derivative job accepts `AbortSignal` and performs cooperative
  `throwIfAborted()` checks before and after expensive async boundaries.

## Baseline

Before implementation, establish current state:

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx tests/use-conversation.test.tsx tests/chrome-adapter.test.ts
pnpm --filter @imagen-ps/application test -- session/session.test.ts runtime.test.ts
pnpm --filter @imagen-ps/core-engine test -- runner.test.ts
pnpm check:policy
```

If baseline fails, attribute the failure before editing. Do not use failing
baseline as evidence that a slice works.

## Slices

### Slice 1 — Image Resource Contract

Goal:

- Add a single app-local image resource / derivative model and migration helpers
  from current `HostImageAsset` / `ConversationAttachment` shapes.

Allowed scope:

- `apps/app/src/shared/domain/`
- `apps/app/src/shared/ports/`
- app tests / fakes.

Implementation notes:

- Keep `HostImageAsset` compatibility during migration if needed, but make new
  code depend on the resource descriptor.
- Model original source, thumbnail derivative, provider derivative, placement
  metadata, and release/dispose handles separately.
- Add contract tests proving local file, Photoshop capture/layer, and provider
  output can share the same descriptor without inline bytes in long-lived UI
  state.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/fakes.ts tests/main-page.test.tsx tests/use-conversation.test.tsx
pnpm --filter @imagen-ps/app build
```

Stop rule:

- If the contract requires `packages/application` to import app/domain resource
  types, stop and re-scope. Application must continue to consume generic
  `Asset` / `storedRef` shapes only.

### Slice 2 — Unified Thumbnail Derivative Service

Goal:

- Implement one app-owned thumbnail service used by attachments, round previews,
  history previews, and provider outputs.

Allowed scope:

- `apps/app/src/shared/image/`
- `apps/app/src/shared/domain/`
- `apps/app/src/shared/ui/`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- app tests.

Implementation notes:

- Use Photoshop `imaging.getPixels({ targetSize })` for Photoshop-origin
  thumbnails.
- For local files, first implement a verified safe path:
  - if compressed bytes are already small enough, use an object URL or capped
    data URL as thumbnail;
  - if a real local-file decode/resize path is added, it must be verified in
    fake harness and marked for real UXP smoke.
- For provider outputs materialized as `storedRef`, resolve once through the
  thumbnail service and store only bounded thumbnail bytes/URL in UI state.
- Add `ThumbnailStore` semantics: get-or-create, cache by source ref + max side,
  release object URL, invalidate on source delete/profile-clear as needed.
- Avoid using full provider output data URLs in `round.previews`.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/main-page.test.tsx tests/use-conversation.test.tsx tests/chrome-adapter.test.ts src/adapters/uxp/photoshop-host-bridge.test.ts
pnpm --filter @imagen-ps/app build
```

Stop rule:

- If UXP local-file thumbnail generation needs unsupported `canvas.drawImage`,
  `createImageBitmap`, or browser-only APIs, keep local file thumbnail behavior
  to object URL / capped source preview and produce a Decision Packet for real
  resize support.

### Slice 3 — Local Provider Derivative Service

Goal:

- Implement provider derivative generation for local files so Add File no longer
  rejects images that need provider normalization, unless the verified runtime
  path is unavailable.

Allowed scope:

- `apps/app/src/shared/image/`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- `apps/app/src/shared/ports/`
- app tests.

Implementation candidates to evaluate in order:

1. Native Photoshop path:
   - open user file with `app.open(entry)`;
   - use `imaging.getPixels({ targetSize })` on the temporary document or
     active layer/composite;
   - encode PNG via existing local encoder;
   - store provider derivative in `AssetStore`;
   - close temporary document and clean temp artifacts.
2. JavaScript decoder path:
   - add a minimal decoder/encoder only if it is UXP-compatible, bundle-safe,
     and covered by tests;
   - reference `monorepo` Jimp usage only as an implementation pattern, not as
     automatic approval.
3. Unsupported path:
   - keep explicit rejection and write a Decision Packet.

Required behavior:

- 512x512 local file -> provider derivative 1024x1024.
- 10000x6000 local file -> provider derivative <= selected `imageMaxSide`,
  aspect preserved.
- 1200x800 local file -> plan-dependent derivative if multiple rounding or
  min/max policy changes size.
- original local file is not copied into long-lived `AssetStore` unless it is
  already the provider derivative.
- provider derivative stores dimensions and source metadata.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/chrome-adapter.test.ts tests/image-resize.test.ts
pnpm --filter @imagen-ps/app build
```

Manual-only validation:

- UXP Developer Tool + Photoshop smoke for local 512px, 1200px, and 10000px
  images if the UXP path uses `app.open`, temporary documents, or
  `ImageBlob`/object URLs.

Stop rule:

- If neither native Photoshop nor JavaScript decoder path is evidenced for
  Photoshop 26.1 / UXP floor, stop with a Decision Packet. Do not invent a
  browser-only local-file resize path.

### Slice 4 — Provider Input Resolution Uses Provider Derivative

Goal:

- Ensure send/retry/provider dispatch resolves provider derivative assets, not
  original assets or thumbnail assets.

Allowed scope:

- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `packages/application/src/runtime.ts`
- app/application tests.

Implementation notes:

- `assetForJobInput()` should fail clearly if an attachment has no ready
  provider derivative.
- If provider derivative is generated lazily at Send time, the UI must expose
  pending/error state and prevent duplicate generation.
- Retry must reuse the same provider derivative ref unless the source/profile
  policy changed.
- History input remains `storedRef`-only.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/main-page.test.tsx
pnpm --filter @imagen-ps/application test -- runtime.test.ts
```

Stop rule:

- If lazy provider derivative generation requires React state inside
  `packages/application`, stop and move orchestration back to app-level resource
  services.

### Slice 5 — Cancellation And Release Ownership

Goal:

- Add cooperative cancellation and deterministic release for image work,
  attachment removal, conversation clear, send cancel, profile switch, and
  session disposal.

Allowed scope:

- `apps/app/src/shared/domain/`
- `apps/app/src/shared/ui/`
- `apps/app/src/shared/ports/`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- `packages/application/src/session/`
- `packages/application/src/commands/`
- `packages/core-engine/src/runtime.ts`
- `packages/core-engine/src/runner.ts`
- focused tests.

Implementation notes:

- Add a local `ImageWorkController` or equivalent in `apps/app`.
- Each attachment/resource owns or references a controller for in-flight
  thumbnail/provider derivative work.
- Attachment remove:
  abort derivative work, dispose object URLs, optionally delete unreferenced
  derivative refs.
- Conversation clear:
  abort all round/attachment image work, dispose previews, clear UI refs.
- Send cancel:
  abort pre-dispatch derivative work and pass signal to application submit
  command if already dispatching.
- Profile switch:
  invalidate provider derivatives that were planned under the old
  `imageMaxSide` / multiple policy; thumbnails stay valid.
- Application/session:
  add cancel-aware submit/retry command option without importing app resource
  types.
- Core runner:
  check signal before dispatch and after postprocessing; mark cancellation
  distinctly if the existing job model allows it, otherwise use a clear
  validation error category and record the limitation.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/main-page.test.tsx src/adapters/uxp/photoshop-host-bridge.test.ts
pnpm --filter @imagen-ps/application test -- session/session.test.ts runtime.test.ts
pnpm --filter @imagen-ps/core-engine test -- runner.test.ts
```

Stop rule:

- If UXP Photoshop imaging cannot be interrupted once started, document it as
  cooperative cancellation: post-abort results must be ignored and cleaned, but
  the host call may run to completion.

### Slice 6 — Documentation And Durable Knowledge

Goal:

- Update current-state docs only with stable contracts proven by implementation
  and tests.

Allowed scope:

- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- narrowly scoped `docs/dev-memory/` record if the final lifecycle contract is
  reusable and does not fit current docs.

Validation:

```bash
pnpm check:policy
git diff --check
```

Stop rule:

- Do not preserve execution logs or one-off planning notes in memory. Completed
  Loop outcomes should be merged into durable docs or the Loop should be
  removed per `docs/agent/LOOP.md`.

## Validation

Quick:

```bash
pnpm check:policy
git diff --check
```

Per-slice:

```bash
pnpm --filter @imagen-ps/app test -- tests/main-page.test.tsx tests/use-conversation.test.tsx tests/chrome-adapter.test.ts src/adapters/uxp/photoshop-host-bridge.test.ts
pnpm --filter @imagen-ps/application test -- session/session.test.ts runtime.test.ts
pnpm --filter @imagen-ps/core-engine test -- runner.test.ts
pnpm --filter @imagen-ps/app build
```

Final:

```bash
pnpm validate
git diff --check
```

Manual-only:

- `HOST_SMOKE_UNVERIFIED` unless UXP Developer Tool + Photoshop are run.
- Required if local provider derivative uses `app.open`, temporary documents,
  `ImageBlob`, object URLs for UXP display, or any host cleanup path that fake
  UXP cannot prove.

Live-provider:

- None by default.

## Decision Packet Triggers

Produce an A/B/C Decision Packet before implementation continues if:

- local file resize requires unsupported UXP/browser APIs;
- native Photoshop `app.open` temporary-document flow cannot be made safe in
  fake harness or contradicts placement/source ownership;
- adding a JavaScript decoder materially increases UXP bundle size or creates
  unsupported runtime assumptions;
- cancel semantics require changing provider transport contracts rather than
  passing generic `AbortSignal`;
- job cancellation needs a new durable job status that affects core-engine
  compatibility beyond this Loop's owner boundary;
- thumbnail cache eviction conflicts with durable history retention.

## Completion Report

Report:

- Goal executed:
- Slices completed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Manual host status:
- Boundary evidence:
- Remaining risks:
- Decision Packet, if blocked:
- Memory note candidate:

## Memory Note Candidate

Candidate: yes, `architecture`, only after implementation proves a stable
resource / derivative lifecycle contract with tests and current docs cannot
hold the detail naturally.
