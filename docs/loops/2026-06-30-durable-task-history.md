# Durable Task History And Placement Replay

Status: draft
Authority: current user request on 2026-06-30 to draft a Loop plan; not a standing root `AGENTS.md` declaration
Owner: `apps/app`, `packages/application`, `packages/core-engine`
Created: 2026-06-30

## Context Docs

- Current authority: root `AGENTS.md`, `docs/agent/LOOP.md`,
  `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, relevant package
  `AGENTS.md` files.
- Current code evidence:
  - `packages/core-engine/src/types/durable-job.ts`
  - `packages/core-engine/src/types/asset.ts`
  - `packages/application/src/runtime.ts`
  - `packages/application/src/commands/types.ts`
  - `apps/app/src/shared/ui/hooks/use-conversation.ts`
  - `apps/app/src/shared/ui/pages/history-page.tsx`
  - `apps/app/src/shared/domain/photoshop-placement.ts`
  - `apps/app/src/adapters/uxp/uxp-job-history-adapter.ts`
  - `apps/app/src/adapters/chrome/indexed-db-storage.ts`
  - `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- Project records:
  - `docs/dev-memory/memories/decisions/durable-job-history.md`
  - `docs/dev-memory/memories/architecture/UXP_STORAGE_STRATEGY.md`
  - `docs/dev-memory/memories/architecture/image-ownership-peak-memory-audit.md`
  - `docs/dev-memory/memories/architecture/image-resource-derivative-lifecycle.md`
  - `docs/dev-memory/memories/bug/duplicate-submission-prevention.md`
  - `docs/loops/2026-06-28-photoshop-frame-placement.md`

## Current State

- The app has a session-local `ConversationRound` model with `attachments`,
  `previews`, and `placementIntent`.
- `derivePlacementIntent()` computes placement from current submit attachments:
  `exact-frame`, `document-only`, or `unbound`.
- `DurableJobRecord` is job-oriented. It stores `workflow`, sanitized `input`,
  terminal `status`, `error`, timestamps, retry metadata, and
  `outputs: StoredAssetRef[]`.
- `DurableJobRecord` does not store the full UI attachment snapshot or durable
  placement context.
- `application` already materializes base64 / byte outputs into `AssetStore`
  before writing terminal durable history. URL outputs remain `url`
  `StoredAssetRef`s.
- `StoredAssetRef` already supports `kind`, `ref`, `name`, `mimeType`,
  `sha256`, and `byteSize`; shared code treats `ref` as opaque.
- UXP history and assets are backed by `localFileSystem.getDataFolder()` when
  available, with in-memory fallback. Chrome history/assets are backed by
  IndexedDB.
- `HistoryPage` currently projects durable records into prompt/status/provider
  rows only. Preview URLs and retry actions come from active/current-session
  rounds, not from durable records.
- `assetToPreviewUrl()` supports URL and inline bytes, but does not resolve
  `storedRef` for history previews.
- `photoshop-host-bridge.placeAssetOnCanvas(asset, placement)` can already
  resolve `storedRef`, fetch URL assets, check placement intent, and call
  Photoshop `placeEvent`.

## Goal

Implement a restart-safe durable task model, proven by mock/contract harnesses:
one send creates one durable task; after app restart the history list can decode
valid task records, show stable task rows, resolve available output previews and
downloads, and route Photoshop placement through one runtime validation path.

Real Photoshop restart/reopen placement is manual-only evidence unless this
Loop is explicitly extended to run a UXP Developer Tool + Photoshop smoke.

## User Decisions Captured

- One send click creates one durable task.
- Retry/regenerate creates a new task. If UI keeps retry/regenerate buttons,
  they prefill or resubmit as a new task, not mutate old task attempts.
- No `attempts[]` in the first model.
- Task replay means view/preview/download/place.
- Regeneration is not task replay.
- `TaskRecord` is data and evidence snapshot, not live runtime object state.
- `execution` is optional display/debug metadata only, for example historical
  provider/profile/model labels.
- `execution` must not participate in placement, download, or retry semantics.
- Do not store secrets or raw large image bytes in the task record.
- Task record, resource storage, and placement resolver are separate. Missing
  resources should degrade preview/download/place, not corrupt task history.
- TTL/LRU is out of this slice. The model must tolerate future eviction without
  changing task semantics.

## Non-Goals

- No TTL/LRU cleanup policy.
- No automatic regeneration from historical records.
- No `attempts[]` history model.
- No provider transport or provider response contract rewrite.
- No exact resubmit contract from historical attachments.
- No storage of provider secrets, raw provider options, raw request/response
  payloads, or long-lived inline image bytes.
- No native path as durable identity.
- No claim that mock tests prove real Photoshop restart behavior.
- No migration guarantee for external users. This repo is current-state first,
  but local malformed/unknown records must be isolated instead of breaking the
  whole history list.

## Architecture Decisions

This Loop fixes the basic architecture before implementation:

1. `TaskRecord` is the product history source of truth.
2. `DurableJobRecord` remains an internal execution/history compatibility
   record until replaced. It must not own product replay semantics.
3. `TaskStore` is a separate app/application-facing durable store. Adapters may
   physically share backing files/databases with current job history if the
   public contract stays task-oriented.
4. `taskId` is the user-task identity minted at send time. It is stable across
   running and terminal updates.
5. `jobId` is execution identity. A task may point at the current/last job id
   for diagnostics, but history actions use `taskId` + `outputId`.
6. Photoshop-specific evidence belongs in `apps/app` domain/adapters or an
   app-owned extension type. `core-engine` may own only host-neutral base types
   and validation helpers.

If implementation proves this split is impossible without worse boundary
violations, stop and produce a Decision Packet. Do not silently choose a
different model.

## Task Lifecycle

The lifecycle is send-time durable:

```text
send
-> create running TaskRecord
-> execute provider job
-> update the same TaskRecord to completed / failed
```

On app startup, any leftover `running` task with no recoverable active job must
be updated or projected as `interrupted`. The first implementation may persist
that as a terminal `interrupted` status or project it at read time, but the UI
must not show stale `running` forever.

`TaskRecord` may record durable lifecycle state. It must not store live runtime
objects such as `AbortController`, provider clients, stream handles, Photoshop
DOM objects, temp entries, or in-memory progress state.

Status invariants:

| status | error | outputs | finishedAt |
|---|---|---|---|
| `running` | forbidden | empty | forbidden |
| `completed` | forbidden | at least one output unless provider explicitly returns zero outputs | required |
| `failed` | required normalized error | partial outputs allowed only if marked partial | required |
| `interrupted` | required normalized error | empty unless already terminal-materialized | required |

`createdAt` is set when the task is created. `updatedAt` changes on every
durable task update. `finishedAt` replaces `completedAt` and is set for every
terminal status.

## Target Contract Draft

First-class product history:

```ts
interface TaskRecord {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly status: 'running' | 'completed' | 'failed' | 'interrupted';
  readonly operation: 'text-to-image' | 'image-edit';
  readonly prompt: string;
  readonly attachments: readonly TaskAttachment[];
  readonly outputs: readonly TaskOutput[];
  readonly placement: TaskPlacement;
  readonly error?: TaskError;
  readonly execution?: TaskExecutionSnapshot;
  readonly executionJobId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt?: string;
}
```

`TaskAttachment` is first-version history input evidence plus best-effort
composer prefill. It is not an exact resubmit contract. Attachment order is
stable and semantically significant for display/prefill.

```ts
type TaskAttachment =
  | {
      readonly kind: 'photoshop-capture' | 'photoshop-layer';
      readonly attachmentId: string;
      readonly label?: string;
      readonly asset: TaskResourceRef;
      readonly photoshop: PhotoshopSourceSnapshot;
      readonly providerInput?: TaskResourceRef;
      readonly thumbnail?: TaskResourceRef;
    }
  | {
      readonly kind: 'local-file';
      readonly attachmentId: string;
      readonly label?: string;
      readonly asset: TaskResourceRef;
      readonly file?: FileEvidence;
      readonly providerInput?: TaskResourceRef;
      readonly thumbnail?: TaskResourceRef;
    };
```

Attachment resource roles:

- `asset`: original durable resource when available. Used for input evidence
  and best-effort composer prefill.
- `providerInput`: optional execution derivative, such as resized provider
  input. It may be evicted and is not required for replay.
- `thumbnail`: optional display derivative. It may be regenerated or missing.

`TaskOutput` stores ordered output refs and sanitized source evidence.

```ts
interface TaskOutput {
  readonly outputId: string;
  readonly index: number;
  readonly kind: 'image';
  readonly asset: TaskResourceRef;
  readonly thumbnail?: TaskResourceRef;
  readonly partial?: boolean;
  readonly source?: {
    readonly providerAssetKind: 'base64' | 'url' | 'fileId' | 'storedRef';
    readonly sanitizedOriginalUrl?: string;
    readonly fileId?: string;
  };
}
```

`TaskResourceRef` does not duplicate metadata already stored on
`StoredAssetRef`. Availability is dynamic resolver output, not durable record
state.

```ts
interface TaskResourceRef {
  readonly ref: StoredAssetRef;
  readonly width?: number;
  readonly height?: number;
}

interface ResolvedTaskResource {
  readonly resource: TaskResourceRef;
  readonly availability: 'available' | 'missing' | 'remote-only' | 'unresolvable';
  readonly bytes?: ArrayBuffer;
  readonly preview?: ResolvedPreview;
}

interface ResolvedPreview {
  readonly url: string;
  readonly dispose?: () => void;
}
```

`execution` is optional display/debug metadata only.

```ts
interface TaskExecutionSnapshot {
  readonly profileId?: string;
  readonly profileName?: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly modelId?: string;
  readonly modelName?: string;
  readonly output?: {
    readonly count?: number;
    readonly size?: string;
    readonly format?: string;
    readonly quality?: string;
  };
}
```

Supporting types must be defined once or reused from existing authoritative
files:

- `TaskError`: normalized category/message/code/details only; no raw provider
  response, authorization header, request body, or stack dump.
- `FileEvidence`: persistent token if available, display name, byte size,
  sha256 if already computed or cheap, MIME type, and optional native path hint
  only for display. Native path hint is never identity.
- `Rect`: use the coordinate contract below. Do not introduce a second
  incompatible rectangle model.

## Resource Durability Policy

`source` is evidence for display/debug only. Resolver actions must use
`TaskOutput.asset` and `TaskAttachment.asset`, never `source.fileId` or raw
provider state.

| Provider output | Task actionable asset | Source evidence |
|---|---|---|
| base64 / bytes | Must materialize to `storedRef` before terminal completion | Record original kind only |
| URL, downloadable during terminal materialization | Best effort materialize to `storedRef`; if successful, replay uses stored ref | Store sanitized URL only if useful |
| URL, not downloadable | Store as `url` ref and resolve as `remote-only`; no durable replay guarantee | Store sanitized URL only |
| fileId | Not actionable unless converted to local stored asset | Debug/display evidence only |
| storedRef | Keep stored ref | Record original kind only |

Downloaded URL materialization must strip or sanitize sensitive URL data before
recording evidence. Query parameters are removed by default; allowlist only
non-sensitive parameters if needed. `providerOptions`, authorization values,
API keys, bearer tokens, raw request bodies, and raw provider responses are
forbidden in task records.

Host file tokens are allowed only when they are host capability references
needed to re-open a user-authorized local file. They must be stored in
host-owned evidence fields, never in provider/source fields, and all token
resolution failures must degrade to missing/unavailable states.

## Persistence Failure Policy

No cross-store transaction is required in the first implementation, but write
ordering is fixed:

1. Create or upsert the `running` `TaskRecord` at send time.
2. Materialize terminal output resources to `AssetStore`.
3. Construct the terminal `TaskRecord` only after required resource refs are
   available.
4. Upsert the same `taskId` with terminal status.

Rules:

- `TaskStore.put` is idempotent upsert by `taskId`.
- A completed task must not be published before required output refs exist.
- If asset materialization fails after provider success, the task becomes
  `failed` with a normalized materialization error unless partial-output policy
  explicitly applies.
- Orphan assets are tolerated and left for future cleanup.
- Retrying materialization must not corrupt an existing completed task.
- Failed tasks may store partial outputs only when each partial output is marked
  `partial: true`.

## Schema Decode Policy

All durable task reads go through `decodeTaskRecord`.

- Unknown `schemaVersion`: skip that record, emit diagnostics, keep listing
  other records.
- Malformed record: isolate that record, emit diagnostics, keep listing other
  records.
- Writes always use the latest schema.
- Existing `DurableJobRecord` data may be ignored, cleared by an explicit
  current-state adapter, or read by a best-effort compatibility decoder. The
  chosen implementation must be documented in the execution report.

## Placement Evidence Contract

Photoshop evidence is app-owned and serializable. It is not a live Photoshop
handle.

```ts
interface PhotoshopDocumentSnapshot {
  readonly documentId?: number;
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly resolution?: number;
  readonly colorMode?: string;
  readonly fileToken?: string;
  readonly fileName?: string;
  readonly contentHash?: string;
}

interface PhotoshopSourceSnapshot {
  readonly snapshotId: string;
  readonly document: PhotoshopDocumentSnapshot;
  readonly layer?: {
    readonly layerId?: number;
    readonly name?: string;
    readonly path?: string;
    readonly bounds?: Rect;
    readonly contentHash?: string;
  };
  readonly selection?: {
    readonly bounds?: Rect;
    readonly maskHash?: string;
  };
  readonly captureRect: Rect;
  readonly placementRect: Rect;
}
```

`TaskPlacement` references evidence instead of duplicating it:

```ts
type TaskPlacement =
  | { readonly kind: 'exact-frame'; readonly sourceSnapshotId: string }
  | { readonly kind: 'document-only'; readonly document: PhotoshopDocumentSnapshot }
  | { readonly kind: 'unbound'; readonly reason: 'no-photoshop-source' | 'multiple-documents' };
```

Rect coordinate contract:

- document pixel space;
- origin at document top-left;
- `left` / `top` inclusive;
- `right` / `bottom` exclusive;
- finite numbers only;
- width is `right - left`;
- height is `bottom - top`;
- persisted against the snapshot document width and height;
- independent from provider input resize/downscale dimensions.

## Placement Match Policy

Placement matching produces a typed result before any Photoshop write:

```ts
type PlacementMatchResult =
  | { readonly kind: 'matched'; readonly confidence: 'strong' | 'weak'; readonly documentId: number }
  | { readonly kind: 'missing-document' }
  | { readonly kind: 'ambiguous-document'; readonly candidates: number }
  | { readonly kind: 'document-mismatch'; readonly reason: string }
  | { readonly kind: 'layer-mismatch'; readonly reason: string }
  | { readonly kind: 'unverifiable'; readonly reason: string };
```

Minimum matching matrix:

| Evidence | Result |
|---|---|
| Current-session `documentId` exists and document size matches | `matched: strong` |
| `documentId` missing/not found, persistent file token resolves uniquely and dimensions match | `matched: strong` |
| File identity plus dimensions uniquely match one open document | `matched: weak` |
| Only name plus dimensions match multiple documents | `ambiguous-document` |
| Document exists but dimensions differ for exact-frame placement | `document-mismatch` |
| Required layer evidence exists but layer cannot be verified | `layer-mismatch` |
| Evidence is insufficient to choose one document | `unverifiable` |

Weak match may enable a clear user-confirmed place action later. It must not
silently write to Photoshop in the first implementation unless the Loop is
explicitly extended with a confirmation UI.

## Action Responsibility Path

Use one resolver path for history actions:

```text
History UI
-> TaskActionService.preview/download/place(taskId, outputId)
-> ResourceResolver.resolve(TaskResourceRef)
-> PlacementResolver.match(TaskPlacement)
-> HostPort.placeResolvedAsset(resolvedAsset, matchedTarget)
```

The host bridge is still allowed to enforce final low-level preflight checks
for bytes and Photoshop modal execution, but it must not own a second full
task-resource availability model or a second placement matching policy.

Preview URL lifecycle is owned by the app hook/service that creates the URL.
It must dispose/revoke previews on unmount, replacement, reload, or missing
resource state.

## Scope

Allowed:

- `packages/core-engine/src/types/` for host-neutral base types only
- `packages/core-engine/tests/`
- `packages/application/src/runtime.ts`
- `packages/application/src/commands/`
- `packages/application/src/session/`
- `packages/application/tests/` or existing package test files
- `apps/app/src/shared/domain/`
- `apps/app/src/shared/image/`
- `apps/app/src/shared/ports/`
- `apps/app/src/shared/ui/hooks/`
- `apps/app/src/shared/ui/pages/history-page.tsx`
- `apps/app/src/adapters/uxp/`
- `apps/app/src/adapters/chrome/`
- focused tests under `apps/app/tests/`

Forbidden:

- `packages/providers/src/` except type-only breakage fixes caused by shared
  type changes.
- Direct React/DOM/Photoshop/UXP imports into `packages/application` or
  `packages/core-engine`.
- Photoshop-specific task evidence in `packages/core-engine`.
- Direct provider imports into `apps/app`.
- Raw image bytes in durable JSON records.
- Secret values or raw provider option payloads in task records.
- Broad UI redesign outside history row actions needed for preview/download/place.

## Ownership Boundary

- `packages/core-engine` owns host-neutral serializable base types and
  secret-free invariants only.
- `packages/application` owns task-store command facades, task lifecycle
  materialization, execution display snapshot assembly, stored asset resolution
  for dispatch, schema decoding, and no-secret checks.
- `apps/app` owns Photoshop-specific task evidence, UI projection, host adapter
  persistence, preview URL resolution, download/save affordances, and Photoshop
  placement runtime matching.
- `apps/app/src/adapters/uxp/` owns UXP data-folder and Photoshop host IO.
- `apps/app/src/adapters/chrome/` owns IndexedDB persistence and browser
  download behavior.
- `packages/providers` remains outside the ownership boundary.

## Baseline

Before implementation, establish current-state evidence:

```bash
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/history-page.test.tsx tests/main-page.test.tsx src/adapters/uxp/photoshop-host-bridge.test.ts src/adapters/uxp/uxp-host-adapters.test.ts tests/chrome-adapter.test.ts
pnpm check:policy
```

If baseline fails before implementation, attribute whether the failure is
unrelated, blocks the slice, or reveals an existing contract mismatch.

## Slices

### Slice 1: Task Contract, Decoder, And Invariants

Goal: define the durable task contract, schema decoder, lifecycle invariants,
and secret/resource-ref validation.

Allowed scope:

- `packages/core-engine/src/types/` for host-neutral base types only
- `packages/core-engine/tests/`
- `packages/application/src/commands/types.ts`
- application decoder/validation files
- exports required for compile.

Expected outcome:

- Add `TaskRecord`, `TaskStore`, `TaskResourceRef`, `ResolvedTaskResource`,
  `TaskError`, and decoder contracts in the correct owner boundary.
- Keep `StoredAssetRef` host-neutral and opaque.
- Add status-matrix tests.
- Add sanitizer tests for signed URLs, token-like values, provider options,
  and raw errors.
- Add bad-record/unknown-schema isolation tests.

Validation:

```bash
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/application test
pnpm check:policy
```

Stop rule:

- Stop if the owner boundary would require Photoshop-specific types in
  `core-engine`.

### Slice 2: Submission Snapshot Contract

Goal: define how UI submit state becomes a durable task snapshot before
provider execution starts.

Allowed scope:

- `apps/app/src/shared/domain/`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ports/`
- focused app tests.

Expected outcome:

- Create a running `TaskRecord` at send time.
- Convert `ConversationAttachment` into durable `TaskAttachment` evidence.
- Store Photoshop document/layer/selection/capture/placement evidence once and
  reference it from placement.
- Preserve local-file evidence with persistent token when available, display
  label, size/hash if available, and path only as non-authoritative hint.
- Keep first-version attachment semantics limited to history display and
  best-effort composer prefill, not exact resubmit.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/main-page.test.tsx
pnpm check:policy
```

Stop rule:

- Stop if required Photoshop evidence is unavailable from the current host
  capture result and would require real-host API research before a mock harness
  can represent it.

### Slice 3: Storage Adapter And Resource Resolver

Goal: UXP and Chrome stores expose enough resource behavior for dynamic
availability, preview lifecycle, and download/place actions.

Allowed scope:

- `apps/app/src/shared/image/`
- `apps/app/src/shared/ports/`
- `apps/app/src/adapters/uxp/uxp-job-history-adapter.ts`
- `apps/app/src/adapters/chrome/indexed-db-storage.ts`
- `apps/app/src/adapters/uxp/in-memory-host-storage.ts`
- adapter and image-resource tests.

Expected outcome:

- Resolve `storedRef`, `url`, and missing refs into `ResolvedTaskResource`.
- Generate preview URLs with a dispose contract.
- Resolve missing refs as missing availability, not thrown history corruption.
- Keep `getDataFolder()` for UXP durable data; keep temp folder for placement
  staging only.
- Store/return `byteSize`, `mimeType`, `name`, and sha/hash only where practical
  without creating unnecessary full-image copies.
- Do not implement TTL/LRU yet.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/image-resource.test.ts src/adapters/uxp/uxp-host-adapters.test.ts tests/chrome-adapter.test.ts
pnpm check:policy
```

Stop rule:

- Stop if UXP and Chrome need incompatible download semantics that cannot be
  represented behind the app ports.

### Slice 4: Task Lifecycle Materialization

Goal: provider execution updates the existing task to terminal state with
materialized output refs and optional execution display snapshot.

Allowed scope:

- `packages/application/src/runtime.ts`
- `packages/application/src/commands/`
- `packages/application/src/session/`
- application tests.

Expected outcome:

- Upsert running task on submit before dispatch.
- Materialize output assets into `AssetStore` refs before completed task update.
- Best-effort materialize downloadable URLs; mark non-materialized URLs as
  `remote-only` at resolve time.
- Treat `fileId` as debug/source evidence unless converted to local stored ref.
- Build `execution` from safe profile/provider/model labels where available.
- Do not store `providerOptions` unless a future decision approves a sanitized
  display summary.
- Keep retry/regenerate behavior as new task submission or composer prefill,
  not old-task mutation.
- Apply persistence failure policy and idempotent task upsert behavior.

Validation:

```bash
pnpm --filter @imagen-ps/application test
pnpm check:policy
```

Stop rule:

- Stop if profile/model display names cannot be resolved without making
  `core-engine` or providers own session/profile state.

### Slice 5: History Projection, Preview, And Download

Goal: durable task history rows materialize preview/download actions from task
records rather than current session rounds.

Allowed scope:

- `apps/app/src/shared/image/`
- `apps/app/src/shared/ui/hooks/`
- `apps/app/src/shared/ui/pages/history-page.tsx`
- `apps/app/src/shared/ports/`
- `apps/app/tests/history-page.test.tsx`
- Chrome/UXP adapter tests where action seams need host fakes.

Expected outcome:

- History rows read durable task output refs.
- Multiple outputs preserve stable order.
- Failed/interrupted tasks remain visible and expose no invalid actions.
- Missing/remote-only resources show unavailable state without deleting the
  task row.
- Preview URLs are released on unmount/reload/replacement and are not recreated
  unboundedly for the same resource.
- Chrome can download available resources and reports place as unavailable.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- tests/history-page.test.tsx tests/image-resource.test.ts tests/main-page.test.tsx
pnpm --filter @imagen-ps/app test:chrome-e2e
pnpm check:policy
```

Stop rule:

- Stop if history actions require app UI to import provider or application
  internals directly.

### Slice 6: Photoshop Placement Validation

Goal: placement from history succeeds only through the single action path when
resource availability and Photoshop runtime evidence match the durable
placement snapshot.

Allowed scope:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- `apps/app/src/shared/domain/photoshop-placement.ts`
- `apps/app/src/shared/ports/host-port.ts`
- focused UXP host bridge tests.

Expected outcome:

- Implement `PlacementMatchResult` and the minimum matching matrix.
- `exact-frame` requires strong current-session or equivalent strong reopened
  document match before automatic placement.
- Dimension mismatch rejects exact-frame placement.
- Ambiguous/missing/unverifiable targets do not write to Photoshop.
- Host bridge enforces final byte/preflight/modal safety but does not duplicate
  the full task-resource/placement policy.

Validation:

```bash
pnpm --filter @imagen-ps/app test -- src/adapters/uxp/photoshop-host-bridge.test.ts tests/main-page.test.tsx
pnpm --filter @imagen-ps/app build:uxp
pnpm check:policy
```

Manual-only:

- Real Photoshop restart / document reopen / placement smoke through UXP
  Developer Tool. This is not part of default validation unless explicitly run.

Stop rule:

- Stop if real Photoshop identity semantics cannot be represented by current
  mock harnesses and the slice needs live host proof before changing the
  contract.

### Slice 7: Restart/Reopen Acceptance Matrix

Goal: cover restart-safe behavior with contract tests and keep real-host proof
separate.

Allowed scope:

- focused app/application tests and test fixtures.

Expected scenarios:

| Scenario | Expected |
|---|---|
| completed + storedRef | restart projection shows preview/download available |
| completed + multiple outputs | output order is stable |
| failed task | record remains visible, no invalid output actions |
| interrupted task | record remains visible with interrupted status |
| storedRef deleted | task remains visible, resource state is missing |
| remote-only URL fails | resource unavailable, history remains valid |
| corrupted record | isolate one record, keep list usable |
| unknown schemaVersion | skip one record, keep list usable |
| exact-frame same document | placement path succeeds in fake host |
| document closed | `missing-document` |
| multiple weak matches | `ambiguous-document` |
| document size changed | `document-mismatch`, no placement |
| Chrome runtime | download available, place unavailable |
| UXP runtime | preview/download/place follow capability state |

Validation:

```bash
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test -- tests/history-page.test.tsx tests/main-page.test.tsx src/adapters/uxp/photoshop-host-bridge.test.ts
pnpm check:policy
```

Stop rule:

- Stop if any claimed restart-safe behavior lacks a mock/contract harness.

### Slice 8: Documentation Writeback

Goal: update authoritative docs or stable memory only for durable facts proven
by this Loop.

Allowed scope:

- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- focused `docs/dev-memory/memories/` note if the completed work leaves durable
  architecture knowledge that does not belong in current authority docs.

Expected outcome:

- Current task/resource/placement boundary is documented once.
- Manual-only Photoshop restart smoke remains clearly separate from mock tests.

Validation:

```bash
pnpm check:policy
git diff --check
```

Stop rule:

- Stop if documentation starts duplicating implementation details better covered
  by tests or type definitions.

## Validation

Quick:

```bash
pnpm check:policy
git diff --check
```

Per-slice:

```bash
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test -- tests/use-conversation.test.tsx tests/history-page.test.tsx tests/main-page.test.tsx src/adapters/uxp/photoshop-host-bridge.test.ts src/adapters/uxp/uxp-host-adapters.test.ts tests/chrome-adapter.test.ts
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Final:

```bash
pnpm validate
git diff --check
```

Manual-only:

- UXP Developer Tool + Photoshop host smoke for restart/reopen placement.
- Verify real Photoshop document close/reopen either passes runtime placement
  validation or returns a precise unavailable/ambiguous/mismatch state.

Live-provider:

- Out of scope. Provider outputs are covered through mock/fake assets unless a
  future user turn explicitly authorizes live provider traffic.

## Decision Packet Triggers

Preflight decisions already fixed by this draft:

- `TaskRecord` is product history; `DurableJobRecord` remains internal /
  compatibility execution history.
- Send creates a running durable task; terminal state updates the same task.
- Resource availability is resolver output, not persisted task state.
- Photoshop placement uses a typed match result and never writes on ambiguous
  or unverifiable matches.

Produce an A/B/C Decision Packet instead of guessing when:

- Implementation evidence shows the fixed `TaskRecord` / `DurableJobRecord`
  split causes worse package-boundary violations than alternatives.
- Photoshop document/layer identity after restart cannot be represented by the
  stated matching matrix.
- Download semantics differ between UXP and Chrome in a way that changes the
  app port contract.
- Profile/model display snapshot requires storing sensitive provider config or
  raw provider options.
- A slice needs provider package ownership beyond type-only fallout.
- No mock/fake/contract harness can support the claimed behavior.

## Completion Report

Executing agents must report:

- Goal executed:
- Files inspected / changed:
- Behavior delivered:
- Contract decisions:
- Validation commands and results:
- Manual Photoshop evidence:
- Known limitations / risks:
- Decision Packet or follow-up:
- Documentation / memory writeback:

## Memory Note Candidate

Yes: `architecture` or `decision`, only after implementation proves the final
task/resource/placement boundary and if that knowledge does not fit better in
`docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, or the type definitions.
