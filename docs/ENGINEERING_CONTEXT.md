# Engineering Context

This file stores repository engineering context that should stay out of root `AGENTS.md`.

## Project Overview

`sinyuk-imagen-ps` is a Photoshop image-generation monorepo with one surface app and shared runtime/application packages.

## Module Roles

| Module | Role | Owns | Must Not Own |
|---|---|---|---|
| `apps/app` | Photoshop UXP + Chrome app surface | shared React UI, app ports, UXP shell/adapters, Chrome shell/adapters, Photoshop simulator, UI-local bindings | runtime internals, provider transport semantics |
| `packages/application` | application/session layer | session controller, command facade, request builders, runtime assembly, profile/model coordination | React, DOM, Photoshop, UXP, Node fs/path/os |
| `packages/core-engine` | job execution kernel | job facts, lifecycle, store, events, runner, dispatch boundary | profile/model selection, host persistence, provider raw transport |
| `packages/providers` | provider adapter layer | config/request validation, transport, normalization, error mapping | app/session state, job lifecycle, host IO |
| `packages/foundation` | lowest-level shared utilities | log record model, context/span helpers, redaction, sink interfaces | React, DOM, Node `fs/path/os`, UXP, Photoshop, provider transport, runtime assembly, workspace reverse dependencies |

## Dependency Direction

```text
surface apps -> application/session -> core-engine + providers
```

## Current State

- Active loop authority is declared only in root `AGENTS.md`. No active loop is currently declared.
- `packages/application` is the shared application/session package.
- `apps/app` and `packages/providers` are stable boundaries unless a loop slice explicitly allows changes.
- `apps/app` is a dual-runtime surface: one shared UXP-safe React UI consumed by a Photoshop UXP shell and a Chrome browser shell. See `apps/app/AGENTS.md`.
- Image-model selection is repo-owned. `packages/providers` owns the shared
  local image-model capability catalog and resolver; remote `discoverModels()`
  answers are only an availability filter over that local catalog, not the
  authoritative picker source.
- Model avatar icons follow catalog brand identity as the single source.
  `packages/providers` declares `ModelBrand` on `ImageModelCapability`;
  `packages/application` exposes the sync `resolveModelBrand` command over
  `resolveImageModelRule`; `apps/app` owns the `brand → icon slug` map and SVG
  assets. The UI never imports `@imagen-ps/providers` and never re-derives
  model identity via substring matching; non-catalog providers (mock,
  prompt-optimize) and unknown models fall back to the default icon. Static
  visual harnesses pass `iconName` directly without runtime resolution.
- Product history is task-oriented. `TaskRecord` is the durable user-task
  history contract; `DurableJobRecord` remains execution/job compatibility
  history. A send creates a running task, terminal provider execution updates
  the same `taskId`, and retry/regenerate creates a new task.
- Task records store only serializable, secret-free evidence and opaque
  resource refs. Preview/download/place availability is resolved dynamically
  through app resource resolvers; missing or evicted resources must not corrupt
  the history list.
- Photoshop placement replay is app/host-owned. Round placement semantics live
  on the round/task snapshot, not on provider output assets. Frame evidence
  (`document + placementRect`) resolves to `exact-frame`; document-only
  evidence resolves to `document-only`; no surviving evidence resolves to
  `unbound`.
- Source-document strong match is always the first placement target path.
  When that fails, app/host may fall back once to the current active document.
  Weak reopen matches still do not auto-write. Under active-document fallback,
  preserved frame evidence may still place as `exact-frame`; degraded evidence
  must place as `document-only`.

## Logging Contract

`@imagen-ps/foundation` owns the host-agnostic log record model, context/span helpers, redaction, and sink interfaces. Other packages and surfaces depend on foundation; foundation depends on no workspace package.

- Format: JSONL / NDJSON, one stable JSON object per line.
- Trace fields: top-level commands and host entries create a trace; child spans preserve parent/child linkage.
- Redaction: secrets, authorization values, raw provider payload dumps, absolute local paths, and environment dumps are removed or sanitized before logging.
- Sink boundary: shared logging constructs records and applies redaction; host adapters own storage (UXP data-folder sink, Chrome IndexedDB-style sink).
- Failure mode: logging is fail-open and must not break product behavior.
- No raw provider request/response logging and no remote telemetry pipeline.
- Provider response normalization must not retain full inline `data:image/...`
  payloads in surfaced `text`, `raw`, diagnostics, or durable/session-facing
  display paths. Chat-image style markdown inline images may be promoted into
  `assets`, but invalid or oversized inline image payloads must degrade to
  short placeholders plus non-sensitive diagnostics.

## Image Resource Lifecycle

`apps/app` owns the image resource lifecycle. Local files, Photoshop layers, captures, and provider outputs are app-local `ImageResource` descriptors with independent `thumbnail` and `providerInput` derivative states.

- In Photoshop UXP, local PNG/JPEG attachments prefer the app-local byte pipeline inside `apps/app` for preview and provider-input refs while source RGBA resizing fits the decode budget.
- Oversized local-file provider-input resizing and provider-output thumbnails fall back to Photoshop host `imaging.getPixels(targetSize)` instead of decoding full-resolution pixels in JavaScript. Local WEBP remains an explicit host-native fallback until an app-local WEBP decode path is proven.

- Provider requests must resolve image-edit inputs from `image.resource.derivatives.providerInput.storedRef`. They must not submit the original asset, thumbnail, inline `data`, or full preview URL. Retry reuses the storedRef already present in the original job input.
- UI previews use the app `ThumbnailStore`. Long-lived round preview state must keep the original output `Asset` locator payload (`storedRef`, `url`, or inline `data`) alongside bounded thumbnail URLs so main-page place/download actions can still resolve the full-size returned image after preview generation.
- Cancellation is cooperative: app clear/unmount aborts in-flight submit and thumbnail work; application/core pass `AbortSignal` through submit → runtime → runner → provider dispatch; runner checks the signal before and after dispatch and after output postprocessing.

## Durable Job History

- Record and artifacts are separate stores. `DurableJobRecord` holds metadata only; binary artifacts live in a separate `AssetStore` keyed by asset id. A record survives artifact eviction as a resolvable "evicted" state.
- `StoredAssetRef` is host-neutral, discriminated by channel (`inline` | `url` | `hostObject` | `externalToken`), never a native path. The shared layer treats `ref` as opaque; the matching host adapter interprets it.
- UXP stores durable records in `localFileSystem.getDataFolder()` as schema-versioned JSON files (`task-history.json`, `job-history.json`). UXP binary assets are separate `hostObject` files under the same data folder and are referenced through opaque `StoredAssetRef.ref` values such as `uxp-asset-*`.
- `JobHistoryStore` and `AssetStore` are host-injected interfaces in `packages/application`; shared packages depend only on the interfaces.
- Secrets are never persisted in a job record. Retry re-resolves secrets at execution time via `profileId` + `SecretStorageAdapter`.
- Two read paths: session = hot in-memory view of active jobs; durable = cold `JobHistoryStore`. Terminal jobs flush from session into the durable store.

## UXP Host IO Constraints

- `localFileSystem.getDataFolder()` is the plugin-private persistence root (settings, cache index, plugin database). `getTemporaryFolder()` is non-persistent; `getPluginFolder()` is read-only.
- `secureStorage` is a secure cache, not a reliable business database. API keys go into secure storage, not JSON, cache index, or logs.
- `nativePath` is not a persistent reference. External file references use persistent tokens; every token resolution must handle failure.
- Photoshop document writes must run inside `require('photoshop').core.executeAsModal` and use session tokens, not native paths.
- UXP binary file reads/writes use `require('uxp').storage.formats.binary`, not `localFileSystem.formats.binary`.
- UXP does not provide browser-style anchor download behavior. Saving a generated image to disk must go through the host save dialog (`localFileSystem.getFileForSaving()` / `HostPort.saveAssetToFile()`), not `<a download>` or synthetic anchor clicks.
- Photoshop layer/capture attachments are materialized as PNG bytes through the app-local PNG encoder (stored deflate, no compression), then stored in `AssetStore`. `imaging.getPixels()` requests `componentSize: 8`; selection/mask data stays single-channel grayscale.
- manifest v5 must declare `requiredPermissions.localFileSystem` and `requiredPermissions.network.domains`.

## Submission And Retry Contract

- Provider profiles persist canonical `connection` config instead of a single endpoint field.
  `selectionMode` and `failoverEnabled` are independent profile semantics;
  `preferredEndpointId` persists only for manual mode, while auto-mode probe
  ranking stays session-only.
- Session-level in-flight registry (`packages/application/src/session/session.ts`): `inFlightRetry` deduplicates by failed-job `jobId`; `inFlightSubmit` deduplicates by `__clientRoundId`. Locks release on all settle paths including `{ok:true,value:failedJob}`.
- UI ref gates (`submitInFlightRef`, `retryInFlightRef`) cover same-tick double-click windows. Error-retry and regenerate buttons are disabled while `conversation.running`.
- Shared provider failover executor owns endpoint ordering, same-endpoint retry,
  cross-endpoint failover, cooldown skip, global attempt budget, and attempt
  diagnostics. `paid` mode (default for image-endpoint/chat-image) retries only
  429 on the same endpoint without idempotency and fails over on 503/502/504/
  `network_error` within the logical-request budget. Upstream 400/422
  request-invalid failures never trigger retry, failover, or cooldown.
  `timeout` is never replayed across endpoints. `broad` mode (default for
  discovery) still permits safe endpoint failover for non-paid probes.
- `packages/providers` owns image-edit wire compatibility under
  `descriptor.transport.wire`. `image-endpoint` declares supported request
  codecs (`multipart-bracket`, `multipart-plain`, `json-reference`) plus
  default order, while runtime resolution, compatibility fingerprinting, and
  process-local success cache stay inside provider transport rather than
  leaking into `packages/application` or `apps/app`.
- Provider billing refresh keeps its own runtime-only per-profile cooldown in
  `packages/application/src/commands/profile-billing.ts`. A 429 balance-query
  failure opens a local cooldown immediately, while repeated auth-style balance
  failures open a local cooldown after a small consecutive-failure threshold.
  This throttle is session-scoped, does not persist to profiles, and does not
  change provider connectivity health semantics.

## Current Limitations

- Default validation is mock-only and reproducible. It does not prove real Photoshop / UXP host behavior, real provider transport, CORS behavior, or live credential flows.
- Chrome real-provider execution is conditional on browser-compatible transport and provider CORS policy; only the `mock` family is repo-side default.
- UXP host behavior (panel load/reload, layer/mask read, file picker, `placeEvent`, persistence across Photoshop restart) remains manual-only evidence. When host inspection is possible, the default debug/probe surface is `node scripts/uxp-debug/uxp-debug.mjs`; do not treat ad hoc DevTools-only steps as the repo default workflow.
- Restart/reopen history placement through real Photoshop remains manual-only evidence. Mock tests and Chrome E2E can prove contract behavior, but not real Photoshop document identity after app or host restart.
- UXP first-frame geometry: Spectrum controls can establish custom element definitions and shadow trees but still report collapsed `0x0` first-frame geometry. This is a Photoshop UXP layout instability, not a missing-registration or late-CSS issue. Future RCA should verify host geometry before trying style-only fixes.
- Provider-output base64 in `job.output` has no size cap; a large provider image exists simultaneously as base64 string, decoded copy, data URL, and decoded pixels. No global full-resolution concurrency cap on input resolve.
- `apps/app` now applies best-effort retention at shell startup and after successful generation: task history and job history are count-capped, generated output assets use oldest-first high/low watermark eviction, and UXP logs under `logs/YYYY-MM-DD/imagen.jsonl` are bounded by day retention plus per-day size truncation. This is not a byte-accurate quota or historical orphan cleanup policy.
- `pnpm lint` is not a supported gate; workspace packages do not define package-level lint scripts.

## Shared Composer Draft Ownership

- `apps/app` `AppShell` owns the in-session Composer draft. The shared draft contract is: prompt text, draft attachments, and the derived Composer operation (`text-to-image` vs `image-edit`).
- `MainPage` and `GlobalGenerationSettingsPage` must resolve output-size availability from the same selected model plus shared draft-derived operation. Settings must not fall back to a page-local or synthetic "no composer context" branch.
- Draft reset after send, failed-round fill/restore, and attachment replacement must flow through the shared draft owner so attachment preview disposal has one owner. Menu open state, popup visibility, hover/highlight state, and copy affordances remain page-local UI state.

## Open Questions

- Host storage paths: UXP data-folder and Chrome storage defaults are not yet unified across platforms, and Linux / Windows defaults are not explicitly specified (current defaults are macOS-only).

## Code Placement Rules

| Code | Place |
|---|---|
| React hooks and components | `apps/app/src/shared/ui/` |
| App ports and host image wrappers | `apps/app/src/shared/ports/`, `apps/app/src/shared/domain/` |
| Photoshop / UXP host IO | `apps/app/src/adapters/uxp/`, `apps/app/src/shells/uxp/` |
| Chrome host IO and simulator | `apps/app/src/adapters/chrome/`, `apps/app/src/simulators/photoshop/` |
| Session state, commands, profile/model coordination | `packages/application` |
| Request builders | `packages/application/src/requests/` |
| Job facts, events, runner, dispatch contracts | `packages/core-engine` |
| Provider validation, transport, normalization | `packages/providers` |
