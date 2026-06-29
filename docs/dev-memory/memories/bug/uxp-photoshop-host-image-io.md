# UXP Photoshop Host Image IO

## Current Fact

Photoshop UXP panel runtime should not assume browser globals, JPEG layer
encoding, or inline durable payloads for image IO:

- Photoshop layer and Capture attachments are materialized as PNG bytes through
  the app-local PNG encoder, then stored in the injected `AssetStore`; React
  conversation state and durable job history carry `hostObject` refs rather than
  full-size `Uint8Array` or Base64.
- `imaging.getPixels()` and selection/mask reads must request
  `componentSize: 8`; returned `PhotoshopImageData` is consumed in the same
  scope and released through `finally dispose()`.
- Selection and layer mask data stay single-channel grayscale. Do not expand
  mask-only reads to RGBA just to build a preview.
- UXP binary file reads/writes use `require('uxp').storage.formats.binary`,
  not `localFileSystem.formats.binary`.
- A Photoshop layer attachment can carry source document metadata for
  document-only writeback, but only an explicit Photoshop Capture attachment
  should produce exact-frame placement.

## Why Future Development Needs This

Capture, Choose Layer, Upload Image, provider edit input, durable history, and
Place in PS all share the same host image IO boundary. Reintroducing browser-only
`ImageData`, JPEG layer encoding, inline full-size image bytes, reading picker
files without the storage-level binary symbol, or treating ordinary layer
attachments as exact captures can make real Photoshop UXP fail while browser or
jsdom tests still pass.

## Re-verify

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx tests/use-conversation.test.tsx
pnpm validate
```

For real host proof, reload `apps/app/dist/manifest.json` in UXP Developer Tool,
then check the current log:

```bash
tail -n 200 "$HOME/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/27/Developer/com.imagen-ps.panel/PluginData/logs/$(date +%F)/imagen.jsonl"
```
