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

- Active loop authority is declared only in root `AGENTS.md`.
- `packages/application` is the shared application/session package.
- `apps/app` and `packages/providers` are stable boundaries unless a loop slice explicitly allows changes.
- `apps/app` is a dual-runtime surface: one shared UXP-safe React UI consumed by a Photoshop UXP shell and a Chrome browser shell. See `apps/app/AGENTS.md`.
- Image-model discovery and execution are split by boundary. `packages/providers`
  discovery returns only remote model facts, preserving unknown IDs. Official
  model presets live in the provider catalog as `(apiFormat, modelId)` templates
  with `requestStrategyId` and output constraints. `packages/application` owns
  profile-local reconciliation over discovery cache, user model configs,
  official presets, and profile `selectedModelIds/defaultModelId`.
- Model execution is resolved before provider dispatch. The application picks
  the explicit request model, then `defaultModelId`, then provider fallback,
  resolves it through user config before official preset, and injects
  `request.model`. Production provider request builders consume `request.model`
  and `requestStrategyId`; they must not infer execution config from model ID
  alone or from `providerOptions.model`.
- `gemini-generate-content` is a distinct API format and local catalog
  namespace inside `packages/providers`. The same `modelId` may coexist across
  API formats such as `openai-chat-completions` and
  `gemini-generate-content`; catalog internals may still key by implementation
  ID plus `modelId`, while profile persistence and UI state key by canonical
  `apiFormat`.
- Model avatar icons follow catalog brand identity as the single source.
  `packages/providers` declares `ModelBrand` on `ImageModelCapability`;
  `packages/application` exposes the sync `resolveModelBrand` command over
  `resolveImageModelRule`; `apps/app` owns the `brand → icon slug` map and SVG
  assets. The UI never imports `@imagen-ps/providers` and never re-derives
  model identity via substring matching; non-catalog providers (mock) and
  unknown models fall back to the default icon. Static
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
- `exact-frame` writeback is still app/host-owned, but it is now guarded by
  request/output geometry facts instead of a shared ratio-tolerance shortcut.
  When request data yields one exact output size, returned pixels must match
  it exactly; ratio-resolution semantics may keep `exact-frame` only when the
  returned size preserves that discrete geometry identity; unknown or
  unverifiable output geometry degrades to `document-only`.
- Source-document strong match is always the first placement target path.
  When that fails, app/host may fall back once to the current active document.
  Weak reopen matches still do not auto-write. Under active-document fallback,
  preserved frame evidence may still place as `exact-frame`; degraded evidence
  must place as `document-only`.

## App Surface UI Contracts

- UI localization is `apps/app`-owned. `createPluginHostShell()` reads UXP
  `host.uiLocale`, normalizes it to `en` or `zh-CN` through
  `apps/app/src/shared/locale.ts`, and passes the result to `AppShell`. Typed
  messages and the React provider live under `apps/app/src/shared/ui/i18n/`.
  `packages/application`, `packages/core-engine`, and `packages/providers`
  must not own UI copy or locale state. Translate UI actions, status labels,
  empty states, placeholders, toasts, and tooltips; keep provider/profile/model
  identifiers, `API Key`, `Base URL`, user prompts, and provider/runtime raw
  error messages untranslated.
- `apps/app` owns the shared motion layer via `@tweenjs/tween.js` under
  `apps/app/src/shared/ui/motion/`. Motion is opacity-first. Transform is
  allowed only through the motion layer writing DOM `style.transform`, and the
  transform guard allows only `translateX`, `translateY`, `scale`, `scaleX`,
  and `scaleY`. Direct CSS transitions, CSS animations, keyframes, and CSS
  `transform:` remain banned outside that layer. Reduced motion resolves by
  writing the final visual state immediately and skipping tween scheduling.
- Shared theme generation is `apps/app`-owned. The six source CSS files under
  `apps/app/src/shared/ui/styles/theme-source/` are the authoritative Material
  token source. Generated output is `apps/app/src/shared/ui/styles/generated/theme-css.ts`;
  do not edit it by hand. Build/dev generation runs before bundling, and
  `pnpm check:policy` fails when the source shape is invalid or generated theme
  output is stale.
- Toast is a shared app-surface primitive, not page-local state. Global toast
  state lives behind `ToastProvider` / `useToast()` / `ToastHost`; page-level
  `useNotice()` remains for inline and persistent notices only. Toast styling
  must consume generated `--toast-*` theme tokens rather than direct positive
  or negative full-surface fills. Use toast for explicit action results,
  command failures, and selection rejections. Keep inline `StatusNotice` for
  persistent section-level status or replacement states only. Field- or
  option-group-local validation belongs to `FieldHelp`, and empty-state
  guidance should use a dedicated host slot with prose copy, not diagnostic
  `detail`. Do not place inline `StatusNotice` inside compact hosts such as
  footers, toolbars, heading rows, action rows, or list rows. Host slots own
  outer spacing; `StatusNotice` itself must stay marginless so one primitive
  can serve multiple placements without stacked margin rules.
- App settings/list surfaces currently allow only two row patterns. Use
  `SettingsListRow` for single-action navigation rows with row-level click and
  no redundant secondary edit button; use `prompt-preset-row` for selectable
  management rows that combine selection state with auxiliary edit/delete
  actions. Keep summaries in `SettingsListRow` as one secondary sans line, and
  drive `prompt-preset-row` selection from one shared `isSelected` state across
  indicator, fill, radio, and ARIA. Do not introduce a third list-row visual
  system in `apps/app` unless the existing two patterns cannot express the
  product need.
- Anchored panel popups must use the shared `PopupLayerProvider` /
  `PopupLayerRoot` as the panel-level coordinate root. Placement converts
  viewport rects to popup-root-local coordinates (`anchorRect - popupRootRect`)
  and must not mix viewport positioning with another container's absolute
  coordinates. Positioning and hit-test shells must not use CSS transforms; if
  a popup animates, apply motion only to an inner visual node. Open popups must
  coalesce resize, scroll, and `ResizeObserver` invalidations through
  `requestAnimationFrame`, avoid state updates when placement is unchanged, and
  disconnect listeners on close.
- Shared text entry in `apps/app` is a popup-layer-owned contract. Public
  single-line text entry stays on `TextField`; multi-line text entry stays on
  `UxpTextArea` / `UxpTextAreaField`; both route through the shared popup-safe
  seam in `uxp-form-controls.tsx`. Raw native text editor markup belongs only
  inside that seam, and `pnpm check:policy` rejects attempts to import the
  internal single-line seam directly instead of using public `TextField`.
- Photoshop UXP native `<textarea>` has an observed runtime instability on the
  main composer path: after some long paste or long-text sessions, `Backspace`
  / `Delete` can reach the element while native value mutation and follow-up
  `input` / `change` / `keyup` / `blur` events never arrive. `UxpTextArea`
  therefore keeps a low-frequency delete fallback: only when the native editor
  shows no delete progress after a short delay does the seam remove the pending
  character or selection itself and sync React state. Keep this fallback in the
  seam rather than page-local handlers.
- Composer textarea sizing must stay CSS-owned. Do not rely on native `rows` or
  `cols` for Photoshop UXP textarea layout; the composer uses CSS min/max
  height instead.
- Long-lived diagnostics for this seam should stay sparse and operationally
  meaningful. Keep only low-frequency anomaly signals such as
  `uxp.ui.textarea.delete.native_fallback_applied`,
  `uxp.ui.textarea.delete.no_native_change`, and
  `uxp.ui.textarea.delete.unsynced`; avoid per-keystroke tracing.

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
- `resolveProviderInputPlan()` is the shared provider-input geometry contract:
  `no-upscale`, integer `fit-inside`, hard `maxSide` ceiling. It returns only
  `kind`, `sourceSize`, `targetSize`, and provenance-only
  `aspectRatioError`; consumers must treat `targetSize` as the sole geometry
  source of truth.
- Photoshop host provider-input reads now request that exact `targetSize` for
  both `imaging.getPixels()` and `imaging.getSelection()`, then fail closed if
  Photoshop returns a different width or height before PNG encoding or asset
  storage.

- Provider requests must resolve image-edit inputs from `image.resource.derivatives.providerInput.storedRef`. They must not submit the original asset, thumbnail, inline `data`, or full preview URL. Retry reuses the storedRef already present in the original job input.
- UI previews use the app `ThumbnailStore`. Long-lived round preview state must keep the original output `Asset` locator payload (`storedRef`, `url`, or inline `data`) alongside bounded thumbnail URLs so main-page place/download actions can still resolve the full-size returned image after preview generation.
- For tall portrait result previews in Photoshop UXP, the absolutely positioned `ImageFrame` must reset inherited `width`/`height` back to `auto`. Keeping `width:100%` on an inset absolute frame over-constrains the box and can visibly shift the contained image off center inside the stage.
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
- Photoshop UXP layer-picker host reads split by responsibility: lightweight
  layer-list enumeration should prefer `core.getLayerTree({ documentID })`
  because DOM-proxy traversal over `activeDocument.layers` can stall for
  hundreds of milliseconds or seconds on real documents, while per-layer
  thumbnail generation must still resolve real DOM `PhotoshopLayer` instances
  from `activeDocument.layers`. Do not treat `getLayerTree()` nodes as a
  reliable thumbnail source or bounds authority in the host bridge.
- manifest v5 must declare `requiredPermissions.localFileSystem` and `requiredPermissions.network.domains`.

## Submission And Retry Contract

- Provider profiles persist canonical `connection` config instead of a single
  endpoint field. Persisted endpoint-selection state is `selectionMode`,
  `selectedEndpointId` (manual mode only), and the endpoint list; provider
  failover is derived from `selectionMode === 'auto'`, and runtime-only
  `resolvedEndpointId` stays session-scoped instead of mutating saved profile
  config. Provider-level connection testing and endpoint measurement are
  separate commands and provider seams.
- User-facing provider profiles are API profiles. Persisted profiles store the
  canonical `apiFormat`; `connection.endpoints[].url` stores base URL nodes only;
  API-format path details live in `config.paths`. UI endpoint paste helpers may
  classify full URLs and paths for feedback, but save/test/measure commands
  revalidate the final API-format config. Persisted profiles do not use legacy
  `providerId` or `family` concepts. This is an intentional current-state
  schema break: old persisted profile records without canonical `apiFormat` are
  rejected rather than migrated.
- Session-level in-flight registry (`packages/application/src/session/session.ts`): `inFlightRetry` deduplicates by failed-job `jobId`; `inFlightSubmit` deduplicates by `__clientRoundId`. Locks release on all settle paths including `{ok:true,value:failedJob}`.
- UI ref gates (`submitInFlightRef`, `retryInFlightRef`) cover same-tick double-click windows. Error-retry and regenerate buttons are disabled while `conversation.running`.
- Provider transport ownership summary lives in `packages/providers/ARCHITECTURE.md`.
  Use that doc for request codec boundaries, replay safety, `RecoveryDisposition`,
  `decideNextAction`, `AttemptPlan`, `DispatchBudget`, and `AttemptLedger`.
- Provider transport harness guidance lives in `packages/providers/TESTING.md`.
  Node multipart capture does not prove Photoshop/UXP host serialization.
- Provider billing refresh keeps its own runtime-only per-profile cooldown in
  `packages/application/src/commands/profile-billing.ts`. A 429 balance-query
  failure opens a local cooldown immediately, while repeated auth-style balance
  failures open a local cooldown after a small consecutive-failure threshold.
  This throttle is session-scoped, does not persist to profiles, and does not
  change provider connectivity health semantics.
- Task-level billing feedback is toast-only in `apps/app`. When terminal task
  state exposes a fresh exact cost, UI shows it immediately; otherwise UI may
  observe one profile-billing refresh window and surface a best-effort balance
  delta toast. Missing or failed billing feedback must stay silent and must not
  mutate message-card footer state, history state, or durable task schema.

## Current Limitations

- Default validation is mock-only and reproducible. It does not prove real Photoshop / UXP host behavior, real provider transport, CORS behavior, or live credential flows.
- Chrome real-provider execution is conditional on browser-compatible transport and provider CORS policy; only the `mock` implementation is repo-side default.
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
