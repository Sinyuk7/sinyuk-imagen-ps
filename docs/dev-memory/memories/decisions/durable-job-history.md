# Durable job history design

## Current fact

Durable job history is shared `core-engine` / `application` semantics surfaced
by CLI and UXP app adapters. Host IO (Node `fs`, UXP `localFileSystem`,
secureStorage, Photoshop writeback) is reached only through host-injected
adapters — neither surface owns a private durable job model.

Stable decisions, all realized in current code:

1. **Record and artifacts are separate stores.** `DurableJobRecord` holds
   metadata only (`id`, `workflow`, `status`, sanitized `input`, `profileId`,
   timestamps, `originJobId`, `retryAttempt`, `outputs: readonly StoredAssetRef[]`).
   Binary artifacts live in a separate `AssetStore` keyed by asset id. A record
   survives artifact eviction as a resolvable "evicted" state, not a corrupt
   record.
2. **`StoredAssetRef` is host-neutral.** A serializable type in `core-engine`,
   discriminated by channel (`inline` | `url` | `hostObject` | `externalToken`),
   never a native path. The shared layer treats `ref` as opaque; the matching
   host adapter interprets it. See `packages/core-engine/src/types/asset.ts`.
3. **UXP stores records in `localFileSystem.getDataFolder()`.** Schema-versioned
   JSON for records + cache index; artifacts under
   `cache/images/<yyyy-mm>/<jobId>/`. Not temp/plugin/localStorage/secureStorage.
   See `UXP_STORAGE_STRATEGY.md`.
4. **Two host-injected interfaces in `application`.** `JobHistoryStore` and
   `AssetStore` are injected like `SecretStorageAdapter`; shared packages depend
   only on the interfaces. See `packages/application/src/commands/types.ts`.
5. **Secrets are never persisted in a job record.** Retry re-resolves secrets at
   execution time via `profileId` + `SecretStorageAdapter`. An `assertNoSecrets`
   invariant runs before any `JobHistoryStore.put`.
6. **Two read paths.** Session = hot in-memory view of active jobs; durable =
   cold `JobHistoryStore`. Terminal jobs flush from session into the durable
   store. `job get/retry` over an active id is session-local; over a historical
   id it is a durable lookup, and the response shape signals which.

## Why future development needs this

Without these boundaries a surface could grow a private job model, persist raw
secrets, or inline image bytes into records — all of which break retry,
eviction, and the host-agnostic shared layer.

## How to verify

- `pnpm --filter @imagen-ps/core-engine test` and
  `pnpm --filter @imagen-ps/application test` cover the types, invariants, and
  in-memory adapters.
- `pnpm --filter @imagen-ps/cli test` covers durable `job list/get/retry`.
- `pnpm --filter @imagen-ps/app test` covers the UXP data-folder adapters.
- `pnpm check:policy` keeps `node:*`, `uxp`, `photoshop`, `react`, and surface
  packages out of `application` and `core-engine`.
