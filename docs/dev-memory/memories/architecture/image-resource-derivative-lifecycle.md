# Image Resource Derivative Lifecycle

## Current Fact

`apps/app` owns the image resource lifecycle. Local files, Photoshop layers,
Photoshop captures, and provider outputs are represented as app-local
`ImageResource` descriptors with independent `thumbnail` and `providerInput`
derivative states.

Provider requests must resolve image-edit inputs from
`image.resource.derivatives.providerInput.storedRef`. They must not submit the
original asset, thumbnail asset, inline `data`, or full preview URL. Retry reuses
the storedRef already present in the original job input unless a future profile
policy change explicitly regenerates the derivative.

UI previews use the app `ThumbnailStore`. Long-lived round preview state keeps
sanitized `Asset` metadata and bounded thumbnail URLs only; provider output
inline bytes are materialized into `AssetStore` refs before entering long-lived
state. Photoshop-origin layer/capture previews use a separate thumbnail
derivative with max long side 256; the provider derivative keeps its own
provider-policy size.

Cancellation is cooperative:

- app clear/unmount aborts in-flight submit and thumbnail work and releases
  thumbnail cache entries;
- attachment removal and provider profile switch dispose composer attachment
  preview handles;
- application/core pass `AbortSignal` through submit -> runtime -> runner ->
  provider dispatch context;
- runner checks the signal before provider dispatch, after dispatch, and after
  output postprocessing. If Photoshop/transport work has already started, host
  APIs may still run to completion; aborted results are ignored or failed as
  cancellation.

## Why Future Development Needs This

Image lifecycle changes can easily reintroduce full image bytes into React
state, durable history, or provider retry paths. Future work should treat
`ImageResource` as an app-only descriptor and keep application/core/provider
contracts host-neutral.

## How To Re-verify

Run:

```bash
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/main-page.test.tsx src/adapters/uxp/photoshop-host-bridge.test.ts
pnpm --filter @imagen-ps/application test -- session/session.test.ts runtime.test.ts
pnpm --filter @imagen-ps/core-engine test -- runner.test.ts
pnpm validate
```

Manual Photoshop / UXP proof remains separate. Fake UXP tests do not prove real
host memory behavior or temporary-document cleanup.
