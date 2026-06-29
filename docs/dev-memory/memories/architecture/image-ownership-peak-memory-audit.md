# Image Ownership & Peak Memory Audit

## Current Fact

The app treats Photoshop and local image inputs as host-owned image resources at
the React/application boundary:

- Photoshop Capture and `Choose Layer` materialize pixels as PNG bytes in
  `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`, store those bytes in the
  injected `AssetStore`, and keep only `storedRef` / `hostObject` metadata in
  job input and durable history.
- `captureActiveImage()` and `readLayerAsAsset()` both pass
  `targetSize`, `colorSpace: 'RGB'`, `componentSize: 8`, and
  `applyAlpha: false` to `imaging.getPixels()`.
- Selection and layer mask reads request `componentSize: 8`, stay grayscale, and
  do not expand mask-only data into RGBA previews.
- `PhotoshopImageData` objects are consumed inside one scope and released in
  `finally` through `dispose()`.
- UXP binary file reads/writes use `require('uxp').storage.formats.binary`.
  Do not read the binary symbol from `localFileSystem.formats`.
- Provider dispatch resolves `storedRef` into transient `Uint8Array` only at the
  application dispatch boundary. Durable job history strips image `data` when a
  `storedRef` is present.

## Peak Memory Shape

For Photoshop Capture / Choose Layer, the intended peak shape is:

| Stage | Representation | Lifetime |
|---|---|---|
| Photoshop pixels | `PhotoshopImageData` | disposed in the same call |
| JS pixels | `Uint8Array` from `getData()` | local only |
| RGBA work buffer | `Uint8Array` | local only |
| PNG bytes | `Uint8Array` | copied into `AssetStore`, then local dies |
| UI preview | small data URL or none | React state |
| Job input | `storedRef` / `hostObject` | application state / durable history |
| Provider request | transient `Uint8Array` / multipart body | dispatch only |

This avoids the previous failure mode where one image could exist as full-size
typed arrays, PNG/JPEG bytes, Base64 strings, JSON request bodies, React
attachments, and durable history at the same time.

## Remaining Risks

- The app-local PNG encoder uses stored deflate, so PNG bytes are close to raw
  RGBA size. This is acceptable as a minimal UXP-safe encoder but not memory
  optimal.
- `AssetStore.resolve()` reads the whole object into an `ArrayBuffer`; provider
  dispatch is not streaming.
- Provider JSON responses can still include base64 in `job.output` before
  output refs are materialized.
- Chrome object URL preview disposal and UXP asset eviction are still separate
  lifecycle work.
- Real Photoshop / UXP host smoke is still required; mock UXP tests only verify
  bridge contracts.

## Re-verify

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx tests/use-conversation.test.tsx
pnpm --filter @imagen-ps/application test -- runtime.test.ts
pnpm validate
```
