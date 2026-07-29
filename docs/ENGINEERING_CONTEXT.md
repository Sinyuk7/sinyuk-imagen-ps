# Engineering Context

This file stores repository engineering context that should stay out of root `AGENTS.md`.

## Project Overview

`sinyuk-imagen-ps` is a Photoshop image-generation monorepo with one shipped
Photoshop UXP app and shared application/runtime packages. Chrome exists only
as a repo-side functional harness; it is not a second shipped product surface.

## Module Roles

| Module | Role | Owns | Must Not Own |
|---|---|---|---|
| `apps/app` | Photoshop UXP product surface and Chrome functional harness | shared React UI, UI state/controllers, app ports, UXP shell/adapters, Chrome shell/adapters, Photoshop simulator, UI-local bindings | runtime internals, provider transport semantics |
| `packages/application` | application/session layer | `GenerationBackend` policy, Task v2, session orchestration, command facade, runtime assembly, profile/model coordination | React, DOM, Photoshop, UXP, Node fs/path/os |
| `packages/core-engine` | job execution kernel | job facts, lifecycle, store, events, workflow runner, backend-neutral execution dispatch | Task state, profile/model selection, host persistence, provider raw transport |
| `packages/providers` | provider adapter layer | stable Provider `ExecutionAdapter`, config/request validation, transport, normalization, error mapping | app/session state, Task projection, job lifecycle, host IO |
| `packages/execution-backends/comfyui` | ComfyUI execution adapter layer | bounded workflow documents and forms, transport-neutral upload/submission/observation, API Graph and Frontend Queue drivers, Bridge protocol validation | Application state, React, DOM, Photoshop, UXP, host persistence |
| `packages/foundation` | lowest-level shared utilities | log record model, context/span helpers, redaction, sink interfaces | React, DOM, Node `fs/path/os`, UXP, Photoshop, provider transport, runtime assembly, workspace reverse dependencies |

## Dependency Direction

```text
surface apps -> application/session -> core-engine + providers + execution backends
```

## Surface Runtime Boundary

- Photoshop UXP is the only delivery runtime and product host.
- Both shells consume the same React UI, application state machines, and
  controllers. Runtime differences belong only in shell composition and host
  adapters; shared behavior must not fork into Chrome-owned and UXP-owned
  implementations.
- Chrome is the fast repo-side functional harness for host-neutral behavior,
  including application flows, UI state transitions, routing, concurrency,
  and error recovery. Its evidence applies to the shared implementation, not
  to Photoshop host compatibility.
- UXP implementation is evaluated from source, official documentation,
  contract/fake tests, and builds by default. Real-host acceptance is
  user-owned; agents do not initiate Photoshop or UXP Developer Tool UI
  interaction. See `docs/TESTING.md` for validation policy.

## Current State

- Active loop authority is declared only in root `AGENTS.md`.
- `packages/application` is the shared application/session package.
- `apps/app` and `packages/providers` are stable boundaries unless a loop slice explicitly allows changes.
- `apps/app` is one shared UXP-safe React application consumed by the shipped
  Photoshop UXP shell and the Chrome functional-harness shell. See
  `apps/app/AGENTS.md`.
- Image-model discovery and execution are split by boundary. `packages/providers`
  discovery returns only remote model facts, preserving unknown IDs. Official
  model presets live in the provider catalog as `(apiFormat, modelId)` templates
  with `requestStrategyId` and output constraints. `packages/application` owns
  profile-local reconciliation over discovery cache, user-owned model configs,
  and official presets.
- For a configured model whose `wireModelId` is an official catalog model, the
  wire model is the execution capability authority. Application projects the
  saved output matrix through that capability; stale preferences outside the
  projection fall back to its default cell and are never sent to the provider.
- Provider model execution is resolved during `GenerationBackend.admit()` before
  queue dispatch. Submission, admission, Profile connection tests, and Profile
  tests require an explicit configured `modelId`; they never infer a first
  model, a profile default, or a provider fallback. Production provider request
  builders consume the resolved `request.model` and `requestStrategyId` only.
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
- Product history is task-oriented. Application-owned `TaskRecord` schema v2 is
  the durable user-intent contract; it uses generic `backend`, `connection`, and
  `target` summaries plus `latestJobId`. `DurableJobRecord` remains execution
  attempt history. A valid send first creates session-only queued work. After
  readiness passes, Session creates a Job, binds a jobId-keyed correlation, and
  persists the running Task before execution side effects. Terminal projection
  updates the same Task. Retry keeps the Task identity and creates a new Job;
  Regenerate creates both a new Task and a new Job. Queued-only work is absent
  from durable history and is dropped on app reload or restart.
- ComfyUI is one Application `GenerationBackend` with two internal submission
  drivers: API Graph and Frontend native Queue. Both use the same Session,
  Task, AssetStore, History, resource actions, and Photoshop placement owners.
  ComfyUI remains the workflow JSON authority. The execution package owns
  bounded Frontend/API document handling, format-neutral Workflow Forms, remote
  upload, native submission, history/view collection, and the bounded Bridge
  protocol. Application owns the singleton server state, current workflow,
  revision-scoped mappings and drafts, readiness, retry policy, and Task
  projection. Host adapters only provide the strict persistence allowlist,
  HTTP bytes, and iframe/WebView message transport. A Mask is admitted only
  through a revision-scoped explicit `separate-image-input` binding; it never
  replaces the primary image input. Unsupported custom widgets preserve their
  saved values and do not create plugin-side admission gates.
- Durable ComfyUI state is limited to canonical `baseUrl`,
  `selectedWorkflowId`, and explicit ambiguous mappings scoped by workflow
  revision. Catalogs, workflow documents, capabilities, class metadata,
  diagnostics, parameter drafts, and dirty state are session-only. Remote
  workflow discovery returns bounded identities and defers document loading,
  parser selection, Form conversion, and output preflight until selection.
- ComfyUI connection switching is an Application-owned latest-wins
  transaction. UI owns raw `draftBaseUrl`; persistence owns committed state;
  runtime owns one active target-bound Bridge generation; each in-flight
  attempt owns at most one provisional generation. One immutable canonical
  target derives the API probe URL, Frontend source, exact message origin, and
  optional WebSocket URL. API and Bridge validation complete before atomic
  compare-and-save; active routing changes only after durable commit. Failure,
  abort, or supersession disposes only provisional resources and preserves the
  previous active generation. Promotion invalidates the old catalog, current
  workflow runtime, cache, drafts, and pending refresh results before retiring
  the old generation.
- Dynamic Workflow Parameters are opt-in: only active node titles beginning
  with `#` may expose safe writable primitive editors. Titles beginning with
  `.` and all unmarked, muted, bypassed, linked, read-only, image, mask, video,
  JSON, or unsupported widgets stay hidden without changing saved values.
  Composer prompt and the first attachment are optional overrides applied only
  to resolved mappings; mapping absence never disables Send.
- ComfyUI submission identities are runtime-only. API prompt IDs and Frontend
  operation/receipt IDs must not enter Job input, Task records, History, or
  durable Bridge state. Once a submission call starts, ambiguous outcomes are
  never replayed; reload/startup preserves only the generic
  `remoteMayContinue` Task error fact.
- Terminal ComfyUI History `execution_error` may contribute only a bounded
  node ID, node type, and one-line exception summary to a failed Job/Task and
  UXP. Tracebacks, paths, URLs, secrets, prompt IDs, and a duplicate exception
  type field are never persisted or rendered.
- Output-node metadata is a bounded optimization, not an admission authority.
  Known metadata proving no active output node may fail before submission;
  unknown metadata must defer to native `/prompt` or Queue validation. History
  collects every safe `outputs[*].images[]` descriptor in source order. A
  successful workflow with no safe image remains a completed Task with empty
  outputs; Preview, Download, and Place stay unavailable without fabricating an
  error.
- Chrome Bridge pages use the canonical parent app HTTP origin as nested Bridge
  identity, while the parent independently validates response events against
  the exact ComfyUI connection origin and iframe source. Photoshop UXP Bridge
  pages use plugin id `com.imagen-ps.panel` and `window.uxpHost`; the UXP host
  still validates the remote message event origin against the exact ComfyUI
  connection origin. Both transports rotate `loadId` on reload and reject
  pending work during reload or disposal. Both transports retry only the
  identical, idempotent handshake while ComfyUI finishes async Bridge setup;
  generation commands remain single-send.
- Bridge resolvers never read ComfyUI persistence. Chrome and Photoshop UXP
  compositions create target-bound generations and route workflow discovery
  and execution through the active-generation proxy. Outgoing messages always
  use the immutable connection origin as `targetOrigin`; incoming messages
  must match that exact parsed origin, expected iframe/WebView source, and
  Bridge identity. Frontend execution admission freezes the active base URL and
  attempt id as target affinity; Bridge resolution and pre-submit validation
  stale-reject that work if the active generation changes. API network
  permission and UXP WebView permission remain separate gates.
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
- ComfyUI frontend Bridge diagnostics use `comfyui.bridge.resolve.*`,
  `comfyui.bridge.load.*`, `comfyui.bridge.handshake.*`, and
  `comfyui.frontend.discovery.*`, with `comfyui.bridge.exchange.*` for other
  commands. `comfyui.bridge.message.sent` / `.received` show host transport
  progress; `comfyui.bridge.page.*` records only accepted page lifecycle
  stages (`transport_ready`, `listener_attached`, `message_received`,
  `response_sent`, or `setup_failed`). Page diagnostics must match the active
  WebView source and content origin before persistence. Keep attributes bounded to
  `transport`, `command`, `phase`, `reason`, and `result`; never log connection
  endpoints, origins, workflow paths, identities, request IDs, payloads,
  headers, or prompt/operation IDs.
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
  `no-upscale`, hard `maxSide` ceiling, and aspect-safe 16px-grid normalization
  for downscaled inputs. When that grid would exceed the aspect-error limit it
  falls back to integer pixels. It returns only `kind`, `sourceSize`,
  `targetSize`, and provenance-only `aspectRatioError`; consumers must treat
  `targetSize` as the sole geometry source of truth.
- Photoshop host provider-input reads now request that exact `targetSize` for
  both `imaging.getPixels()` and `imaging.getSelection()`, then fail closed if
  Photoshop returns a different width or height before PNG encoding or asset
  storage.

- Provider requests must resolve image-edit inputs from `image.resource.derivatives.providerInput.storedRef`. They must not submit the original asset, thumbnail, inline `data`, or full preview URL. Retry reuses the storedRef already present in the original job input.
- UI previews use the app `ThumbnailStore`. Long-lived round preview state must keep the original output `Asset` locator payload (`storedRef`, `url`, or inline `data`) alongside bounded thumbnail URLs so main-page place/download actions can still resolve the full-size returned image after preview generation.
- For tall portrait result previews in Photoshop UXP, the absolutely positioned `ImageFrame` must reset inherited `width`/`height` back to `auto`. Keeping `width:100%` on an inset absolute frame over-constrains the box and can visibly shift the contained image off center inside the stage.
- Running-task cancellation is not a product capability. Session clear/unmount
  drops queued work and aborts thumbnail work without claiming that dispatched
  provider work was cancelled. The lower application/core `AbortSignal` seam
  remains available to explicit runtime callers.

## Durable Job History

- Record and artifacts are separate stores. `DurableJobRecord` holds metadata only; binary artifacts live in a separate `AssetStore` keyed by asset id. A record survives artifact eviction as a resolvable "evicted" state.
- `StoredAssetRef` is host-neutral, discriminated by channel (`inline` | `url` | `hostObject` | `externalToken`), never a native path. The shared layer treats `ref` as opaque; the matching host adapter interprets it.
- UXP stores durable records in `localFileSystem.getDataFolder()` as schema-versioned JSON files (`task-history.json`, `job-history.json`). UXP binary assets are separate `hostObject` files under the same data folder and are referenced through opaque `StoredAssetRef.ref` values such as `uxp-asset-*`.
- `JobHistoryStore` and `AssetStore` are host-injected interfaces in `packages/application`; shared packages depend only on the interfaces.
- Secrets are never persisted in a job record. Retry re-resolves secrets at execution time via `profileId` + `SecretStorageAdapter`.
- Two read paths: session = hot in-memory view of active jobs; durable = cold `JobHistoryStore`. Terminal jobs flush from session into the durable store.

## UXP Host IO Constraints

- `localFileSystem.getDataFolder()` is the plugin-private persistence root (settings, cache index, plugin database). `getTemporaryFolder()` is non-persistent; `getPluginFolder()` is read-only.
- UXP WebView messages report the loaded content URL through plugin-side
  `event.origin`. Validate its parsed HTTP(S) origin against the canonical
  connection origin while keeping `event.source === webView` exact. Chrome
  iframe messages retain exact browser-origin matching; never accept a
  cross-origin URL or weaken the source check.
- `secureStorage` is a secure cache, not a reliable business database. API keys go into secure storage, not JSON, cache index, or logs.
- `nativePath` is not a persistent reference. External file references use persistent tokens; every token resolution must handle failure.
- Photoshop document writes must run inside `require('photoshop').core.executeAsModal` and use session tokens, not native paths.
- UXP binary file reads/writes use `require('uxp').storage.formats.binary`, not `localFileSystem.formats.binary`.
- UXP does not provide browser-style anchor download behavior. Saving a generated image to disk must go through the host save dialog (`localFileSystem.getFileForSaving()` / `HostPort.saveAssetToFile()`), not `<a download>` or synthetic anchor clicks.
- Photoshop layer/capture attachments are materialized as PNG bytes through the app-local PNG encoder (stored deflate, no compression), then stored in `AssetStore`. `imaging.getPixels()` requests `componentSize: 8`; selection/mask data stays single-channel grayscale.
- Photoshop edit regions bind a primary attachment identity, declared source
  bounds, provider-input target size, and an 8-bit grayscale PNG where white
  means edit. Selection and user-layer-mask acquisition must request the same
  `sourceBounds` and `targetSize` as the primary provider input; callers must
  reject mismatched returned bounds or dimensions instead of independently
  cropping or resizing a mask.
- Photoshop UXP 9.3 can represent an absent user mask as an empty `0x0`
  `getLayerMask()` result with no `imageData`. Treat only that exact sentinel
  as confirmed `none`; a missing image payload with any other result remains a
  host acquisition error.
- `MaskCoordinator` owns draft Mask lifecycle. It derives identity only from
  `attachments[0]`, fences stale host completions, releases superseded assets,
  and never reads a user mask for a non-Photoshop or non-primary attachment.
  Composer blocks a Photoshop primary while an enabled supported Mask is
  loading or failed, but permits `none` and ordinary uploads without a Mask.
- A ready region is frozen into top-level `TaskRecord.editRegion`, never into
  `TaskAttachment[]`. Retry reconstructs it from the durable stored ref, not
  the current Photoshop document. Provider routes only explicit
  `provider-native` plans to a first input with identical dimensions; semantic
  and unsupported routes omit the raster Mask. ComfyUI uploads a Mask only for
  an explicit revision-scoped binding and preserves the primary image ref.
- Photoshop UXP layer-picker host reads split by responsibility: lightweight
  layer-list enumeration should prefer `core.getLayerTree({ documentID })`
  because DOM-proxy traversal over `activeDocument.layers` can stall for
  hundreds of milliseconds or seconds on real documents, while per-layer
  thumbnail generation must still resolve real DOM `PhotoshopLayer` instances
  from `activeDocument.layers`. Do not treat `getLayerTree()` nodes as a
  reliable thumbnail source or bounds authority in the host bridge.
- manifest v5 must declare `requiredPermissions.localFileSystem` and `requiredPermissions.network.domains`.

## Submission And Retry Contract

- Core workflows contain only static `execution` steps routed by an
  `ExecutionAdapter` id. Core owns Job lifecycle, immutable handoff, and error
  boundaries, but does not interpret backend policy or Task state.
- Application `GenerationBackend` implementations own admission, readiness,
  optional concurrency lanes, Retry reconstruction, terminal Task projection,
  and post-persistence follow-up. Provider uses backend id `provider`, a
  per-profile lane cap of 2, and one stable Provider `ExecutionAdapter` that
  performs exact admitted implementation lookup.
- ComfyUI uses backend id `comfyui`, execution adapter id `comfyui`, and a
  singleton-server lane cap of 1. Frontend Canvas lease ownership begins only
  after Session dispatch and ends before the adapter settles. API Graph calls
  App-owned `/prompt` once; pinned Frontend 1.45.20 calls native Queue through
  `/api/prompt` once while App makes no `/prompt` call.
- Provider credentials are resolved for every dispatch from the admitted
  non-secret profile reference. Resolved config, secrets, and materialized
  input bytes remain call-stack-only and must not enter Job, Task, Session,
  output, error, or logs.

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
- A user-visible Profile is always `ready`: it has valid Profile configuration
  and at least one owned `UserModelConfig`. New Profile `Continue` stores an
  internal `setup` Profile only long enough to route to an exact Official Catalog
  model, Model Configuration, or Profile Models. Public list/active Profile
  reads exclude setup Profiles; cancellation and shell startup cleanup remove
  setup Profile, model-config, and secret state. First successful model save
  promotes setup to ready idempotently.
- Ready Profiles cannot lose their final model through `deleteUserModelConfig`.
  The repository owns the delete-unless-last invariant; UI disabling is only
  preventive feedback. Profile-level `enabled` has no persistence, UI, or
  provider-admission meaning. Legacy reads discard it. This does not change the
  independent failover meaning of `connection.endpoints[].enabled`.
- Session queue ownership lives in `packages/application/src/session/*`.
  `submitJob()` validates and freezes a `GenerationCommand`, delegates policy
  to the registered backend, publishes a FIFO `queuedTasks` entry, and returns
  enqueue acknowledgement before a later scheduler turn can dispatch. The
  global concurrency cap is 5; optional admitted lanes carry their own cap.
  Readiness is rechecked after dequeue and before Job creation.
- Session routes terminal events only through its jobId-keyed
  `TaskJobCorrelation` sidecar. It does not parse profile/model/billing data or
  depend on UI correlation fields in Job input. `inFlightRetry` deduplicates by
  failed Job id and `inFlightSubmit` deduplicates by stable Task id; both locks
  release on every settle path.
- Terminal ordering is fixed: backend projection, terminal Task persistence,
  then optional follow-up. Projection/materialization failure writes a bounded
  failed Task from the admitted running snapshot. Follow-up failure is logged
  and never rewrites the already-persisted Job or Task result.
- UI ref gates (`submitInFlightRef`, `retryInFlightRef`) cover same-tick double-click windows. Queued or running rounds do not globally disable composer editing, capture, model/output selection, or new submission; task-local remove/retry gates remain narrow.
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

## Shared UI Composition

- `apps/app/src/shared/ui/ui-system.ts` is the page-facing public UI boundary. Page roots use `PageFrame`, `PageHeader`, and `PageScroll`; settings and list/form states use the matching public patterns. Owner-local components may retain direct internal imports.
- Page composition policy is AST-based in `scripts/policy/ui-composition.mjs`. It is zero-tolerance for page-level raw native controls, internal UI imports, visual inline styles, raw colors, and direct Material token references. Dynamic page layout values may use only `--ui-*` custom properties inline.
- Visual layout uses existing `--app-*` and component tokens. Theme-source palettes and generated color outputs are separate authority and must not change during composition migration.
- The shared `ui-catalog` is rendered by both shells. Chrome visual snapshots
  prove deterministic shared catalog composition and Settings archetypes, not
  Photoshop UXP layout or rendering.
- Chrome real-provider execution is conditional on browser-compatible transport and provider CORS policy; only the `mock` implementation is repo-side default.
- Real-host observations may still be needed to prove Photoshop-only behavior,
  but they are user-owned evidence rather than an autonomous agent gate.
- UXP first-frame geometry: Spectrum controls can establish custom element definitions and shadow trees but still report collapsed `0x0` first-frame geometry. This is a Photoshop UXP layout instability, not a missing-registration or late-CSS issue. User-supplied real-host geometry is authoritative for this boundary.
- Provider-output base64 in `job.output` has no size cap; a large provider image exists simultaneously as base64 string, decoded copy, data URL, and decoded pixels. No global full-resolution concurrency cap on input resolve.
- `apps/app` now applies best-effort retention at shell startup and after successful generation: task history and job history are count-capped, generated output assets use oldest-first high/low watermark eviction, and UXP logs under `logs/YYYY-MM-DD/imagen.jsonl` are bounded by day retention plus per-day size truncation. This is not a byte-accurate quota or historical orphan cleanup policy.

## Shared Composer Draft Ownership

- `apps/app` `AppShell` owns the in-session Composer draft. The shared draft contract is: prompt text, draft attachments, and the derived Composer operation (`text-to-image` vs `image-edit`).
- `MainPage` and `GlobalGenerationSettingsPage` must resolve output-size availability from the same selected model plus shared draft-derived operation. Settings must not fall back to a page-local or synthetic "no composer context" branch.
- Output preferences remain operation-specific. When `image-edit` has no saved preference, project the same profile/model `text_to_image` selection into the edit matrix without persisting it; retain a saved edit preference when present, and use the closest supported edit cell when an exact projection is unavailable.
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
