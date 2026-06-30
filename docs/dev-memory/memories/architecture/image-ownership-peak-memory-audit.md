# Image Ownership & Peak Memory Audit

> Scope: trace every allocation, copy, persistence, and release of image bytes
> across the six chains — Capture, Attachment, Provider request, Response,
> Preview, Placement. No refactoring. Evidence is `file:line`. Inferences are
> marked `[inference]`.

## Current Fact

This audit is historical evidence for the pre-hardening implementation. The
current provider-bound raster input policy supersedes its implicit "small
source images stay original size" assumption: provider-bound raster input
requires a global minimum long side of `1024` while still using the selected
Provider/Profile max-side as the only ceiling. See
`docs/dev-memory/memories/architecture/image-resource-derivative-lifecycle.md`
for the current derivative lifecycle.

The app treats Photoshop and local image inputs as host-owned image resources at
the React/application boundary:

- Photoshop Capture and `Choose Layer` materialize pixels as PNG bytes in
  `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`, store those bytes in the
  injected `AssetStore`, and keep only `storedRef` / `hostObject` metadata in
  job input and durable history.
- `captureActiveImage()` and `readLayerAsAsset()` both pass
  `targetSize`, `colorSpace: 'RGB'`, `componentSize: 8`, and
  `applyAlpha: false` to `imaging.getPixels()`
  (`photoshop-host-bridge.ts:1014-1022`, `photoshop-host-bridge.ts:1107-1115`).
  `targetSize` is bounded by `resolveCaptureUploadPlan` → `resolveModelSize`
  with `maxSide: 1028`, `multiple: 2` (`shared/image/resize.ts:40-45,255-278`).
- Selection and layer mask reads request `componentSize: 8`, stay grayscale,
  and do not expand mask-only data into RGBA previews
  (`photoshop-host-bridge.ts:741-770`, `photoshop-host-bridge.ts:1150-1183`).
- `PhotoshopImageData` objects are consumed inside one scope and released in
  `finally` through `dispose()` (`photoshop-host-bridge.ts:709-711`,
  `photoshop-host-bridge.ts:767-769`, `photoshop-host-bridge.ts:1170-1172`).
- UXP binary file reads/writes use `require('uxp').storage.formats.binary`.
  Do not read the binary symbol from `localFileSystem.formats`.
- Provider dispatch resolves `storedRef` into transient `Uint8Array` only at the
  application dispatch boundary (`application/runtime.ts:346-362`). Durable job
  history strips image `data` when a `storedRef` is present
  (`application/runtime.ts:229-250`).

---

## Chain 1 — Capture (Photoshop pixels -> PNG bytes -> AssetStore)

Entry: `captureActiveImage()` (`photoshop-host-bridge.ts:986`),
`readLayerAsAsset()` (`photoshop-host-bridge.ts:1091`),
`pickImageFile()` (`photoshop-host-bridge.ts:954`),
`readLayerMaskAsAsset()` (`photoshop-host-bridge.ts:1150`).

### Allocations & copies (in-scope, transient)

| # | Buffer | Size | Where created | Where released |
|---|---|---|---|---|
| 1 | `PhotoshopImageData` (native) | raw pixels @ `targetSize` (<=1028^2) | `imaging.getPixels()` `:1014` / `getSelection()` `:1034` / `getLayerMask()` `:1160` | `imageData.dispose()` in `finally` `:710`, `:768`, `:1171` |
| 2 | `getData()` TypedArray | `w*h*components` (8-bit) | `imageDataToRgba` `:694`; `selectionMaskToAlpha` `:751` | local; GC after scope |
| 3 | RGBA work buffer | `w*h*4` | `rgbaFromBytes` `:632` / `pasteRgba` `:706` | local; GC |
| 4 | selection alpha | `w*h` (grayscale) | `selectionMaskToAlpha` `:757,764` | local; GC |
| 5 | PNG raw scanline buffer | `(1+w*4)*h` ~= RGBA size | `rgbaToPngBytes` `:536` | local; GC |
| 6 | zlib stored-deflate buffer | `2 + blocks*5 + raw.byteLength + 4` ~= raw size | `zlibStoredDeflate` `:426-446` | local; GC |
| 7 | PNG chunk assembly | signature+IHDR+IDAT+IEND | `rgbaToPngBytes` `:552-565` | local; returned as `png` |
| 8 | defensive copy of PNG | `png.byteLength` | `createStoredHostImageAsset` `:350-351` | local; passed as `copy.buffer` |
| 9 | AssetStore write copy | `bytes.byteLength` | `createUxpAssetStore.put` -> `bytesToArrayBuffer(new Uint8Array(bytes))` (`uxp-job-history-adapter.ts:196`) | written to plugin-data file; local copy GC'd |
| 10 | preflight CRC scan | 0 alloc, full O(n) pass | `preflightStoredAsset` -> `ensurePlaceableImagePayload` (`image-payload-preflight.ts:97-118`; PNG walks every chunk incl. IDAT, `:52-91`) | — |

### Persistence

- PNG bytes persist only as a `hostObject` `StoredAssetRef` in the
  `AssetStore` (plugin-data file). Job input and durable history carry the ref,
  not the bytes (`createStoredHostImageAsset` `:356-361`;
  `durable-job.ts:33-35`).
- Capture preview is a **capped** data URL: `previewUrlForImage` returns
  `undefined` when `bytes.byteLength > MAX_INLINE_PREVIEW_BYTES` (256 KiB)
  (`photoshop-host-bridge.ts:113,324-329`). Capped preview lives on
  `HostImageAsset.preview.url` and in `ConversationAttachment.previewUrl`.

### Release

- All `PhotoshopImageData` released via `dispose()` in `finally`. OK.
- Transient JS buffers (2-9) are function-local; rely on GC. No explicit
  dereference. `[inference]` peak overlap of buffers 2-9 is possible within one
  `executeHostModal` scope, but all are <= ~4 MiB at the 1028^2 cap.

### Notes / risks

- The app-local PNG encoder uses **stored deflate** (no compression), so PNG
  bytes ~= raw RGBA size (`zlibStoredDeflate` `:426`). Acceptable as a
  UXP-safe encoder, not memory-optimal.
- `createUxpAssetStore.put` double-copies PNG bytes (buffer 8 + buffer 9).
- `createUxpAssetStore.resolve` re-runs the full CRC preflight on every read
  (`uxp-job-history-adapter.ts:208-212`) — a full O(n) scan per resolve.
- `readLayerMaskAsAsset` disposes the mask `imageData` but returns `undefined`
  (no preview, not encoded) (`:1168-1178`) — mask bytes never leave the scope.

---

## Chain 2 — Attachment (storedRef handoff into job input -> dispatch resolve)

Entry: `useConversation.submit` -> `assetForJobInput`
(`use-conversation.ts:158,287`) -> `session.submitJob` -> runner ->
`resolveStoredAssetsForDispatch` (`application/runtime.ts:364-385`).

### Allocations & copies

| # | Object | Size | Where | Release |
|---|---|---|---|---|
| 1 | `storedRef`-only Asset (no `data`) | ref metadata | `assetForJobInput` `:158-174` (host-object path) | React/GC with round |
| 2 | resolved ArrayBuffer | full PNG bytes | `getAssetStore().resolve(storedRef)` (`runtime.ts:354`; `uxp-job-history-adapter.ts:199-217` reads whole file) | local to dispatch |
| 3 | `new Uint8Array(bytes)` **view** (no copy) | 0 (view over #2) | `resolveStoredAssetForDispatch` `:360` | lives as long as #2 |

- `images[]` and `maskImage` are resolved in **parallel** via `Promise.all`
  (`runtime.ts:371,377`). `[inference]` N input attachments hold N full
  ArrayBuffers concurrently during dispatch resolution. No global concurrency
  cap on full-resolution resolve.

### Persistence

- Job input keeps `storedRef` only (`assetForJobInput`).
- Durable history strips inline `data` when a `storedRef` is present:
  `sanitizeAssetForDurableInput` (`runtime.ts:229-239`);
  `sanitizeJobInputForDurableHistory` (`runtime.ts:241-250`). OK.
- Retry reuses `round.attachments` (storedRef + capped preview) — no re-read of
  pixels (`use-conversation.ts:334-353`).

### Release

- Resolved dispatch bytes (#2/#3) are local to the dispatch call; no explicit
  cleanup on abort/error. `[inference]` an aborted dispatch leaves the
  resolved ArrayBuffer referenced by the provider `params` until GC.

### Notes / risks

- `resolveStoredAssetForDispatch` skips resolution if `asset.data/url/fileId`
  is already set (`runtime.ts:351`) — inline assets pass through unchanged.
- No abort-driven eviction of resolved bytes; `AbortController` is threaded
  through `httpRequest` (`transport/image-endpoint/http.ts:78-91,130-132`) for
  the network leg only, not for the resolve leg.

---

## Chain 3 — Provider request (request body construction & upload)

Entry: provider `invoke` -> `buildChatImageRequestBody`
(`chat-image/build-request.ts:174`) / `buildEditMultipartBody`
(`image-endpoint/build-request.ts:491`); HTTP via `httpRequest`
(`transport/image-endpoint/http.ts:205`).

### image-endpoint (multipart, edit)

| # | Object | Size | Where | Release |
|---|---|---|---|---|
| 1 | `Blob([asset.data])` | wraps Uint8Array (view/copy impl-defined) | `assetToBlob` `:262-271` | fetch body; GC after send |
| 2 | boundary + parts array | small strings + Blob refs | `createMultipartBody` `:301-318` | local |
| 3 | final multipart `Blob(bodyParts)` | aggregates #1 (no byte copy) | `createMultipartBody` `:324` | fetch body |
| 4 | `JSON.stringify(body)` for non-multipart | request JSON | `http.ts:127` | local |

- Multipart path **avoids base64** on input: `assetToBlob` accepts `Uint8Array`
  directly (`:267-268`) and wraps it in a Blob. OK.
- `image_url` JSON path (`assetToImageRef` `:212-228`) builds a
  `data:...;base64,${data}` string (1.33x) only when `asset.data` is a string.

### chat-image (JSON, edit)

- `assetToImageUrl` (`chat-image/build-request.ts:64-76`) accepts **only**
  `asset.url` (string) or `asset.data` (string). It **rejects `Uint8Array`**
  with `BuildChatImageRequestError`.
- **Contract gap [risk]:** `resolveStoredAssetForDispatch` (Chain 2) produces
  `data: Uint8Array`. A Photoshop-capture (storedRef) attachment reaching the
  chat-image edit path would throw at request-build time. If/when chat-image is
  taught to accept `Uint8Array`, it must base64-encode -> a full ~1.33x string
  in the request body. Currently this path is non-functional for capture
  inputs.

### Network body & response buffering

- `http.ts:121-128`: body is `multipartBlob.body` (Blob), `FormData`, or
  `JSON.stringify(body)`.
- `http.ts:139-147`: response is read via `response.json()` (or `text()`
  fallback) — **full response buffered** into a parsed object. No streaming.
- `response.clone()` is **not** used. OK.

### Persistence

- Request body is not persisted. Retry rebuilds from `params` (which carry the
  resolved `Uint8Array` view over the storedRef bytes).
- `assertSerializable` (`core-engine/invariants.ts:33`) treats typed arrays as
  opaque binary pass-through (no recursion, no copy).

### Release

- Request body Blob/JSON is local to `fetchOnce`; GC after `fetch` resolves.
- Timeout/abort signal disposed in `finally` (`http.ts:182-184`).

### Notes / risks

- No explicit dereference of the resolved `Uint8Array` between retry attempts;
  the view over the resolved ArrayBuffer stays alive across `withRetry`
  iterations. `[inference]`
- `safeStringify` (`core-engine/invariants.ts:125`) is for logs only; request
  bodies are not logged.

---

## Chain 4 — Response (provider result -> job.output -> durable refs)

Entry: `parseResponse` (`image-endpoint/parse-response.ts:178`),
`parseChatImageResponse` (`chat-image/parse-response.ts:88`); handoff in
`dispatchProvider` (`core-engine/dispatch.ts:184`) and `executeWorkflow`
(`core-engine/runner.ts:155-167`); persistence in `flushTerminalJobHistory`
(`application/runtime.ts:299`).

### Allocations & copies

| # | Object | Size | Where | Release |
|---|---|---|---|---|
| 1 | parsed JSON object | full response (incl. base64) | `response.json()` `http.ts:141` | local; GC |
| 2 | `Asset.data` = base64 string | `b64_json` (1.33x bytes) | `parseResponse` `:209-215`; `parseChatImageResponse` `:67-86` | lives in `job.output` |
| 3 | dispatch snapshot | shallow `{...result}` | `dispatch.ts:166` | deepFreeze; lives in `job.output` |
| 4 | decoded bytes (materialize) | decoded image size | `bytesFromAsset` -> `decodeBase64` (`runtime.ts:202-208`) | local; GC |
| 5 | materialize copy | decoded size | `copy.set(bytes)` `:206-207` | local; GC |
| 6 | AssetStore.put copy | decoded size | `createUxpAssetStore.put` (`uxp-job-history-adapter.ts:196`) | plugin-data file |
| 7 | preflight CRC scan | 0 alloc, full pass | `preflightStoredAsset` on put | — |

### Persistence

- **In-memory `job.output`** holds the `ProviderInvokeResult` with base64
  `data` strings (from #2). This stays in the in-memory `JobStore` and is
  exposed via the session snapshot to the UI until the session is cleared.
  `[risk]` Full-size base64 lives in memory across the whole session.
- **Durable history** stores only `StoredAssetRef[]`: `materializeOutputRefs`
  (`runtime.ts:252-292`) converts each output asset to a `hostObject`/`url`/
  `externalToken` ref. Inline `data` is stripped from the durable record. OK.
- `deepFreeze` (`dispatch.ts:62-91`) freezes the snapshot but does **not** copy
  typed arrays or strings (pass-through) — no extra allocation.

### Release

- Parsed JSON (#1) is local to `fetchOnce`; GC'd after `parseResponse`.
- Materialization buffers (#4-6) are local to `flushTerminalJobHistory`.
- **`job.output` base64 (#2) is NOT released** after materialization — the
  in-memory JobStore keeps it. `[risk]`
- `materializeOutputRefs` runs on terminal jobs (`runtime.ts:299-323`). It runs
  concurrently with the UI preview build (Chain 5) reacting to the same
  `job.output`. `[inference]` both paths decode the same base64 -> transient
  double-decode peak on completion.

### Notes / risks

- Provider JSON responses can still include base64 in `job.output.image.assets`
  before output refs are materialized (memory record confirms).
- `assertNoSecrets` (`durable-job.ts:68-101`) validates the durable record but
  does not touch `job.output` bytes.
- No cap on response/base64 size; a large provider image -> large base64 in
  `job.output` + session snapshot.

---

## Chain 5 — Preview (UI data URL / object URL in React state & `<img>`)

Entry: `roundFromSessionJob` -> `assets.map(assetToPreview)`
(`use-conversation.ts:123`); `assetToPreview`/`assetToPreviewUrl`
(`shared/domain/mappers.ts:126-158`); render in `main-page.tsx:592-608` and
`history-page.tsx:163-171`.

### Allocations & copies (per provider-output preview)

| # | Object | Size | Where | Release |
|---|---|---|---|---|
| 1 | decoded bytes | decoded image size | `bytesFromDataString` -> `base64ToBytes` (`mappers.ts:82-107`) | local; GC |
| 2 | ArrayBuffer copy | decoded size | `arrayBufferFromBytes` (`mappers.ts:76-80`) | local; GC |
| 3 | preflight CRC scan | 0 alloc, full pass | `ensurePlaceableImagePayload` (`image-payload-preflight.ts:97`) | — |
| 4 | data URL string | `~1.33x bytes` (+header) | `data:${mimeType};base64,${asset.data}` or `bytesToBase64` (`mappers.ts:140,147`) | lives in `round.previews[].url` |
| 5 | `<img src>` | browser decode of #4 | DOM | unmount / round clear |

- `[risk]` Provider-output previews are **NOT size-capped**. The 256 KiB cap
  (`MAX_INLINE_PREVIEW_BYTES`) applies only to capture previews
  (`photoshop-host-bridge.ts:113,324-329`), not to `assetToPreviewUrl`.
- Building one b64 preview transiently allocates: decoded bytes (#1) + copy
  (#2) + CRC scan (#3, no alloc) + data URL (#4). Peak ~= 3-4x the image size
  per preview, plus the original base64 string in `job.output`.

### Persistence (long-lived)

- `round.previews: readonly AssetPreview[]` (`use-conversation.ts:40`) holds the
  full data URL `url` and the `asset` (with base64 `data`) for each round.
- `round.attachments` holds the `HostImageAsset` (storedRef + capped preview).
- `ConversationRound[]` lives in React state until `clear()`.

### Release

- `clear()` -> `setRounds([])` (`use-conversation.ts:389`). Drops all preview
  URLs and attachment refs at once; GC handles strings.
- **No object-URL revoke for provider-output previews** (they are data URLs,
  not object URLs). Capture previews are also data URLs.
- Chrome file-pick previews use `URL.createObjectURL` with a `disposePreview`
  revoke callback (`chrome-host-port.ts:13,24`) — but this is the Chrome shell,
  not the UXP/Photoshop path.
- No lazy activation / virtualization of the round list; all `<img>` for all
  rounds render while rounds exist (`main-page.tsx:471-608`). `[risk]`

### Notes / risks

- `assetToPreviewUrl` re-decodes + re-validates the same base64 that
  `materializeOutputRefs` (Chain 4) also decodes on the same tick.
- Retry/regenerate of an `ok` round calls `submit` with the old
  `attachments` (storedRef) — no pixel re-read — but the old `previews`
  (data URL) remain until the new round replaces them.

---

## Chain 6 — Placement (result bytes -> Photoshop canvas)

Entry: `placeAsset` (`main-page.tsx:373-385`, user-triggered button) ->
`HostBridge.placeAssetOnCanvas` (`photoshop-host-bridge.ts:1185`).

### Allocations & copies

| # | Object | Size | Where | Release |
|---|---|---|---|---|
| 1 | resolved ArrayBuffer | full image bytes | `assetToArrayBuffer` -> `assetStore.resolve(storedRef)` (`:824-832`) | local |
| 2 | defensive copy (Uint8Array path) | full bytes | `new Uint8Array(asset.data.byteLength); bytes.set(...)` (`:834-840`) | local; GC |
| 3 | decoded bytes (data-URL path) | decoded size | `arrayBufferFromDataUrl` `:809-821` (atob + Uint8Array) | local; GC |
| 4 | fetched bytes (URL path) | full response | `fetch(asset.url)` + `response.arrayBuffer()` (`:845-853`) | local; GC |
| 5 | `Uint8Array` view over #1-4 | 0 (view) | `new Uint8Array(data)` (`:1201`) | local |
| 6 | preflight CRC scan | 0 alloc, full pass | `ensurePlaceableImagePayload` (`:1200`) | — |
| 7 | temp file in `plugin-temp` | full bytes on disk | `folder.createFile` + `file.write(data)` (`:1205-1209`) | **not cleaned up** |
| 8 | session token | small | `fs.createSessionToken(file)` (`:1210`) | session-scoped |

### Placement execution (no JS re-encode)

- `batchPlay` `placeEvent` with the session token (`:1215-1226`) -> Photoshop
  imports the temp file as a placed layer (Smart Object).
- `transformActivePlacedLayer` (`:793-807`) calls `placedLayer.scale()` +
  `translate()` — **Photoshop-native transform**, no JS pixel ops.
- `assertExactPlacementAspect` (`:509-528`) reads image size from headers only
  (`readPngSize`/`readJpegSize`/`readWebpSize` `:448-507`) — no full decode. OK.
- `PlacementScalePlan.shouldResizeBytes = (placementScaleMode === 'raster-bilinear')`
  (`resize.ts:273-276`); default is `'smart-object-transform'` ->
  `shouldResizeBytes: false`. No JS resampling on placement. OK (matches memory
  record).
- No `putPixels` / `createImageDataFromBuffer` / `encodeImageData` on the
  placement path. `encodeImageData` is declared on the `PhotoshopImaging`
  interface (`:74`) but unused on this path.

### `executeAsModal` boundaries

- Capture: inside one short `executeHostModal` (`:1012-1058`, `:1105-1131`).
- Placement: `placeEvent` + `transformActivePlacedLayer` inside one short
  `executeHostModal` (`:1212-1232`).
- Network (provider dispatch) runs in the runner (`core-engine/runner.ts:155`),
  **outside** any `executeAsModal`. OK — Adobe guidance honored: the long
  network wait does not hold the modal scope.
- `createHostModalRunner` serializes modal ops via a promise queue
  (`:166-191`) so repeated clicks / reloads cannot overlap modal scopes. OK.

### Persistence

- Temp file (`plugin-temp`) is created per placement and **never deleted**
  (`:1205-1209`). `[risk]` repeated placements accumulate orphan temp files.
- `createUxpAssetStore.delete` is a no-op (`uxp-job-history-adapter.ts:218-220`);
  artifact eviction is unimplemented.

### Release

- Resolved/copied/decoded bytes (#1-4) are local to `placeAssetOnCanvas`; GC.
- Temp file (#7) persists on disk across the session. `[risk]`
- No cleanup on placement error (the `try/finally` only logs via span).

---

## Peak Memory Shape (intended, per chain)

| Chain | Peak transient buffers | Long-lived copies | Cap |
|---|---|---|---|
| Capture | PhotoshopImageData + getData + RGBA + raw + deflate + chunk + 2 store copies | PNG bytes in AssetStore (hostObject file) | targetSize <=1028^2; preview <=256 KiB |
| Attachment | resolved ArrayBuffer per input (parallel) | storedRef only | none on resolve concurrency |
| Provider request | multipart Blob chain (image-endpoint) / JSON.stringify | none | — |
| Response | parsed JSON + base64 string + decode+copy+store | **base64 in job.output + session snapshot** | **none** |
| Preview | decode + copy + CRC + data URL | **full data URL in round.previews + `<img>`** | **none on provider output** |
| Placement | resolve/copy/decode + temp file write | **temp file in plugin-temp** | none |

## Remaining Risks (consolidated)

1. **Provider-output base64 is the dominant long-lived multiplier.** A single
   generated image exists simultaneously as: base64 string in `job.output`
   (in-memory JobStore + session snapshot), decoded copy in
   `materializeOutputRefs`, data URL in `round.previews[].url`, and decoded
   pixels in `<img>`. No size cap on any of these (Chain 4, 5).
2. **Preview build peak ~= 3-4x image size** per preview (decode + copy + CRC
   scan + data URL), re-decoding the same base64 that `materializeOutputRefs`
   also decodes on the same tick (Chain 4 vs 5).
3. **chat-image edit rejects `Uint8Array` capture inputs** — contract gap in
   `assetToImageUrl` (`chat-image/build-request.ts:64-76`) vs
   `resolveStoredAssetForDispatch` producing `Uint8Array` (Chain 2/3).
4. **`AssetStore.resolve`/`put` do a full CRC preflight on every call**
   (`uxp-job-history-adapter.ts:193,211`); `put` double-copies PNG bytes
   (Chain 1, 2, 6).
5. **No global full-resolution concurrency cap.** `images[]`/`maskImage`
   resolve in parallel (`runtime.ts:371,377`); UI gates (`submitInFlightRef`,
   `retryInFlightRef`) only cover same-tick double-clicks
   (`use-conversation.ts:221-222,255-258,337-340`), not cross-job concurrency.
6. **No abort-driven cleanup** of resolved dispatch bytes or in-flight fetch
   buffers; abort only signals `fetch` (`http.ts:130-132`).
7. **Temp files accumulate** in `plugin-temp` (Chain 6);
   `AssetStore.delete` is a no-op (`uxp-job-history-adapter.ts:218-220`).
8. **PNG encoder uses stored deflate** -> PNG ~= raw RGBA size (Chain 1).
9. **Round list is not virtualized** — all `<img>` for all rounds render while
   rounds exist (`main-page.tsx:471-608`); no `IntersectionObserver` lazy
   activation (Chain 5).
10. **Mock UXP tests only verify bridge contracts**; real Photoshop / UXP host
    smoke is still required to validate peak memory under 8/16-bit, large docs,
    and repeated capture->generate->place cycles.

## OOM Harness & Acceptance Gates (recommended, not yet implemented)

### Test matrix

- 4096^2 / 8192^2 source docs; 8-bit / 16-bit; RGB / RGBA.
- Full doc / selection / single layer; with/without transparency.
- Single Capture; 10x consecutive Capture->Generate->Place.
- Mid-task cancel; failed-then-Retry; rapid Send/Capture double-click.
- Panel hide/show; provider returning oversized image or error JSON.
- Disk-write failure / network drop / timeout.

### Per-stage metrics (no image content)

`jobId, stage, width, height, components, componentSize, estimatedRawBytes,
encodedBytes, responseContentLength, activeFullResolutionJobs, tempFileCount,
tempBytes, captureDuration, encodeDuration, uploadDuration, downloadDuration,
disposeResult, cleanupResult`.

### Acceptance gates

1. Every `PhotoshopImageData` statically traceable to a `finally` `dispose()`.
   OK — already true (Chain 1).
2. Every file descriptor `finally` `close()` (when chunked I/O is added).
3. No full-resolution base64/ArrayBuffer in React global state or durable
   history. FAIL — `round.previews[].url` holds full data URLs for provider
   output (Chain 5).
4. At most one full-resolution pixel-transform task in flight. FAIL — no
   global scheduler (risk 5).
5. Retry does not coexist with old request. PARTIAL — UI gate only
   (`retryInFlightRef`), not at dispatch/resolve layer.
6. Network not inside long `executeAsModal`. OK (Chain 6).
7. Temp files cleaned on success/error/cancel. FAIL (risk 7).
8. Memory returns to a stable band after idle across 10 consecutive tasks
   (not monotonically rising). UNVERIFIED — requires host smoke.
9. UDT shows no sustained `Plugin memory usage increased` warning growth.
   UNVERIFIED — requires host smoke.
10. Pre-allocate peak estimate before allocation, not post-OOM catch.
    UNVERIFIED — requires `estimatedPeakImageBytes` budget (~300 MiB target,
    conservative engineering budget, not an Adobe official limit; calibrate
    on macOS/Windows, 8/16-bit, across Photoshop versions).

## Re-verify

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx tests/use-conversation.test.tsx
pnpm --filter @imagen-ps/application test -- runtime.test.ts
pnpm validate
```

Re-trace evidence: `rg -n "dispose\(\)|\.resolve\(|assetStore.put|JSON.stringify|response.json|arrayBuffer|bytesToBase64|createObjectURL|revokeObjectURL|ensurePlaceableImagePayload" apps/app/src packages`
