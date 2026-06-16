# Durable Job / History Design Decisions

- Status: decisions resolved (Phase 5 design gate of `docs/loops/cli-surface-contract-loop.md`)
- Scope: `packages/core-engine`, `packages/application` contracts; host adapters in `apps/cli` and `apps/app`
- Constraint: this document is the design output of the Phase 5 gate. It authorizes the follow-up slice breakdown below; it does not authorize implementation in the turn that produced it.
- Grounding evidence:
  - `packages/core-engine/src/types/job.ts` — `Job`, `JobInput`, `JobStore`.
  - `packages/core-engine/src/types/asset.ts` — host-neutral `Asset` with `url` / `data` / `fileId` channels.
  - `packages/core-engine/src/store.ts` — in-memory `JobStore` + `assertSerializable`.
  - `packages/application/src/commands/types.ts` — `SecretStorageAdapter`, `ProviderProfile.secretRefs`.
  - `packages/application/src/commands/provider-profiles.ts` — secret values are write-only, only refs persist.
  - `packages/application/src/session/types.ts` — session-local `getSnapshot` / `submitJob` / `retryJob`.
  - `docs/dev-memory/memories/architecture/UXP_STORAGE_STRATEGY.md` — data folder, secure storage, token, `StoredAssetRef` flow.

## Architectural Principle

Shared packages (`core-engine`, `application`) stay host-agnostic and serializable. All host IO (Node fs, UXP `localFileSystem`, secure storage, Photoshop writeback) is reached only through host-injected adapters, mirroring the existing `SecretStorageAdapter` pattern. The CLI and the UXP app provide adapter implementations; they do not own a private durable job model.

## Decision 1 — Completed job record is stored separately from image artifacts

**Decision: YES. Record and artifacts are separate stores with a reference edge.**

- `DurableJobRecord` holds metadata only: `id`, `workflow`, `status`, sanitized `input`, `profileId`, `createdAt`, `updatedAt`, `originJobId`, `retryAttempt`, and `outputs: readonly StoredAssetRef[]`.
- Binary artifacts live in a separate `AssetStore` keyed by asset id. The record references them via `StoredAssetRef`, never inlines bytes.

Rationale:
- Artifacts are large, binary, and cache-evictable; records are small and durable. The UXP storage doc already separates `cache/images/` (evictable) from `persistent/pinned-assets/` (kept). Embedding bytes in the record would force the record's lifetime onto large binaries.
- A record can survive artifact eviction: a completed job remains listable and inspectable even after its image cache is reclaimed; the missing artifact is a resolvable "evicted" state, not a corrupt record.

## Decision 2 — `StoredAssetRef` is host-neutral

**Decision: New serializable type in `core-engine`. Opaque, discriminated by channel. Never a native path.**

```ts
// packages/core-engine/src/types/asset.ts (additive)
export type StoredAssetRefKind = 'inline' | 'url' | 'hostObject' | 'externalToken';

export interface StoredAssetRef {
  readonly kind: StoredAssetRefKind;
  /** Opaque locator interpreted only by the matching host AssetStore adapter. */
  readonly ref: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly name?: string;
}
```

- `inline` — `ref` is base64 (small previews / fallback only).
- `url` — externally fetchable URL (provider-hosted output before materialization).
- `hostObject` — `ref` is an adapter-private object key. CLI resolves it to a file under its artifact dir; UXP resolves it to a data-folder entry. The shared layer never sees the path.
- `externalToken` — `ref` is a UXP persistent token (user-chosen external location). Resolution may fail and must be handled (re-pick), per UXP storage doc §4.

Rationale: extends the existing `Asset` multi-channel idea (`url`/`data`/`fileId`) one level up to *stored* assets, keeping the same "engine treats it as opaque, adapter interprets it" contract. `nativePath` is explicitly excluded — the UXP doc bans native path as a persistent reference.

## Decision 3 — UXP stores job metadata in `localFileSystem.getDataFolder()`

**Decision: YES. Records + cache index as schema-versioned JSON in the data folder.**

- Layout follows UXP storage doc §1: `data/` for durable records and `cache/index.v1.json`; artifacts under `cache/images/<yyyy-mm>/<jobId>/`.
- Not `getTemporaryFolder()` (non-persistent), not `getPluginFolder()` (read-only), not `localStorage` (too small, doc §6), not `secureStorage` (for secrets only).
- Records go through a repository with explicit schema version + migration, same as provider config.

## Decision 4 — CLI / UXP storage adapter contract

**Decision: Two host-injected interfaces in `application`, implemented per host. Shared packages depend only on the interfaces.**

```ts
// packages/application/src/commands/types.ts (additive), injected like SecretStorageAdapter
export interface JobHistoryStore {
  put(record: DurableJobRecord): Promise<void>;
  get(id: string): Promise<DurableJobRecord | undefined>;
  list(query?: { limit?: number; status?: JobStatus }): Promise<readonly DurableJobRecord[]>;
  delete(id: string): Promise<void>;
}

export interface AssetStore {
  put(bytes: ArrayBuffer, meta: { mimeType?: string; name?: string }): Promise<StoredAssetRef>;
  resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined>; // undefined = evicted/expired
  delete(ref: StoredAssetRef): Promise<void>;
}
```

- CLI adapters: `node:fs` under `IMAGEN_CONFIG_DIR` / default config dir.
- UXP adapters: `localFileSystem` data folder + token resolution.
- Boundary guard: `pnpm check:policy` / the Phase 5 `rg` check keeps `node:*`, `uxp`, `photoshop`, `react`, `@imagen-ps/app`, `@imagen-ps/cli` out of `application` and `core-engine`.

## Decision 5 — Durable retry without persisting secret values

**Decision: Secret values are NEVER persisted in a job record. Retry re-resolves secrets at execution time via `profileId` + `SecretStorageAdapter`.**

- `DurableJobRecord` stores `profileId` and a sanitized `input`. It stores secret *references* only (consistent with `ProviderProfile.secretRefs`), never values.
- Retry reconstructs the request from `(workflow, sanitized input, profileId)` and resolves secrets through the existing resolver chain at dispatch — identical to a first submit.
- Enforcement: an `assertNoSecrets(input)` invariant (extending the existing `assertSerializable` step) runs before any `JobHistoryStore.put`. The CLI's `provider-secrets.json` / `env:` refs and the UXP secure storage stay the only secret sources; neither flows into the record.

Stop condition honored: if a retry path ever required a persisted raw secret, that design is rejected.

## Decision 6 — Session-local vs durable semantics for `get` / `retry` / `list`

**Decision: Two explicit read paths. Session = hot in-memory view of the active session; durable = cold `JobHistoryStore`. Terminal jobs flush from session into durable store.**

| Command | Session-local | Durable |
|---|---|---|
| `getSnapshot()` / active jobs | yes (current in-memory `Map`) | — |
| `job get <id>` | active id → session | unknown/old id → `JobHistoryStore` |
| `job list` | — | `JobHistoryStore.list` |
| `job retry <id>` | active failed job → session retry | old failed job → rehydrate from record, then submit |

- On reaching a terminal state (`completed` / `failed`), the runtime writes a `DurableJobRecord` (with `outputs` materialized into `AssetStore`) so the job is recoverable after the session ends.
- Session remains the source of truth for *live* lifecycle/events; durable store is the source of truth for *history*. A durable `get` returns a record, not a live session handle (no `canCancel`).
- This removes the current ambiguity flagged in the loop doc: CLI `job get/retry` over an active id is session-local; over a historical id it is a durable lookup, and the response shape signals which.

## Follow-up Slice Breakdown (post-approval)

1. **Core types slice** — add `StoredAssetRef`, `DurableJobRecord`, `assertNoSecrets`; pure types + invariant, no IO. Tests in `core-engine`.
2. **Application contract slice** — add `JobHistoryStore` / `AssetStore` interfaces + injection (mirror `setSecretStorageAdapter`); terminal-state flush in runtime; in-memory test adapters.
3. **CLI adapter slice** — `node:fs` `JobHistoryStore` + `AssetStore`; wire durable `job get/retry/list`; contract tests; README update.
4. **UXP adapter slice** — `localFileSystem` data-folder adapters + token resolution; app history wiring; `apps/app` tests.

Each slice keeps `pnpm check:policy` green and names tests before implementation, per the loop's Review Checklist.
