Status: draft
Authority: current user authorization (2026-07-02)
Owner: apps/app
Created: 2026-07-02

# App Retention And Generated Asset Eviction

## Context docs

Current authority:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`

Targeted current-state refs:

- `apps/app/src/adapters/uxp/uxp-job-history-adapter.ts`
- `apps/app/src/adapters/uxp/uxp-log-sink.ts`
- `apps/app/src/adapters/chrome/indexed-db-storage.ts`
- `apps/app/src/composition/chrome/create-chrome-app-shell.ts`
- `apps/app/src/shells/uxp/create-plugin-host-shell.ts`
- `apps/app/src/shared/image/task-resource-resolver.ts`
- `apps/app/src/shared/image/thumbnail-store.ts`
- `packages/application/src/runtime.ts`

Relevant historical / completed-record facts:

- No current Loop in `docs/loops/` owns retention or asset eviction.
- `docs/ENGINEERING_CONTEXT.md` currently contains stale statements about
  `AssetStore.delete` and UXP artifact layout; implementation must use current
  source of truth first, then update authority docs if durable behavior changes.

## Goal

Add a bounded, cross-runtime retention policy for `apps/app` that:

- prevents unbounded growth of generated output assets, task/job history, and
  UXP host logs;
- preserves current architecture where durable history stores refs and survives
  artifact eviction;
- remains best-effort and does not turn a successful generation into a failed
  task because cleanup failed.

## Non-goals

- No true LRU based on `lastAccessAt`.
- No system free-space probing or OS-specific disk pressure handling.
- No lifecycle governance for attachment originals or `providerInput` assets.
- No provider/package boundary changes in `packages/providers`.
- No `packages/core-engine` ownership changes.
- No claim that default tests prove real Photoshop host persistence behavior.
- No broad documentation cleanup unrelated to retention/storage ownership.

## Scope

Allowed scope for the future implementation Loop:

- `apps/app/src/adapters/uxp/uxp-job-history-adapter.ts`
- `apps/app/src/adapters/uxp/uxp-log-sink.ts`
- `apps/app/src/adapters/chrome/indexed-db-storage.ts`
- `apps/app/src/composition/chrome/create-chrome-app-shell.ts`
- `apps/app/src/shells/uxp/create-plugin-host-shell.ts`
- new app-local retention/sweeper modules under `apps/app/src/shared/` or
  `apps/app/src/adapters/`
- focused app tests and harness seed helpers
- current authority doc updates if durable behavior changes or stale statements
  are corrected

Forbidden scope:

- `packages/providers`
- `packages/core-engine`
- provider transport semantics
- Photoshop placement contract changes
- changing task/history product semantics beyond retention and eviction
- introducing background daemons, timers, or always-on monitors

## Ownership boundary

- `apps/app` owns host-local retention policy, sweep orchestration, and runtime
  storage adapters for UXP and Chrome.
- `packages/application` may remain the source of task/job command APIs and
  output materialization behavior, but V1 should avoid changing its shared store
  contracts if current task-linked ownership is sufficient.
- Shared packages must continue to treat `StoredAssetRef.ref` as opaque and must
  not grow host-specific file listing logic.

Stop and produce a Decision Packet if V1 requires:

- `AssetStore.list()` or other shared contract changes in
  `packages/application`;
- `currently in use` asset protection that cannot be implemented inside
  `apps/app` without new cross-layer ownership;
- retention semantics that depend on provider-specific output knowledge.

## Baseline

Current repository facts evidenced by source:

- `TaskRecord` is the durable product history contract and stores output refs,
  not raw image bytes.
- Provider output bytes are materialized into `AssetStore` refs before terminal
  task history is written.
- History/resource resolution already tolerates evicted or missing assets.
- UXP task/job history is persisted in `task-history.json` and
  `job-history.json`.
- UXP logs are appended under `logs/YYYY-MM-DD/imagen.jsonl`.
- UXP and Chrome asset stores persist binary assets but do not currently expose
  list/stat/index semantics.
- Current stores do not enforce TTL, record count limits, asset count limits, or
  log retention.

Baseline validation before implementation claims:

```bash
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

If baseline already fails, record it before attributing regressions to this
Loop.

## Design summary

### Retention classes

History:

- `task-history.json`: retain newest terminal records only, while active or
  retryable records remain protected and do not count toward the terminal cap.
- `job-history.json`: retain a smaller compatible window; it does not own output
  asset deletion.

Logs:

- retain newest day directories by age;
- additionally enforce a simple log size bound to avoid runaway single-day
  growth.

Generated assets:

- only govern provider generated outputs linked from `TaskRecord.outputs`;
- do not govern attachment originals or `providerInput` refs in V1;
- use `oldest-first eviction`, not LRU;
- use high/low watermarks, not `1000 -> delete 500`.

### Required deletion order

History trimming and output-asset cleanup must be bound together in this order:

1. Load full history.
2. Determine records that would be trimmed.
3. Collect output refs from those records.
4. Remove refs that are still protected or still referenced by retained
   records.
5. Delete eligible assets first.
6. Persist trimmed history after deletion attempt.

Reason:

- if history is trimmed first, orphan asset refs become undiscoverable with the
  current `AssetStore` contract;
- if asset deletion happens first and a crash follows, history temporarily
  points to missing assets, which is an already-supported state.

### V1 generated-asset policy

Recommended V1 defaults:

- `highWatermark = 1000`
- `lowWatermark = 850`
- eviction order = oldest eligible generated outputs first, by
  `TaskRecord.updatedAt` / terminal time

This is an emergency object-growth bound, not a reliable byte-capacity bound.
Do not describe it as storage-quota enforcement.

### Protected refs

Every sweep must compute a protected-ref set before any deletion:

- outputs referenced by retained terminal task records;
- all refs owned by running tasks;
- refs owned by explicit retryable/resumable tasks;
- shared refs still referenced by any surviving record;
- newest retained completed task outputs by policy;
- any additional app-local in-use refs if a safe signal already exists inside
  `apps/app`

V1 must not rely on `failed` meaning retryable forever. Retry protection must be
bound to an explicit lifecycle rule, not indefinite pinning.

### Sweep runtime semantics

Sweep orchestration must be:

- `best effort`: cleanup failure logs and exits; generation success stays
  successful;
- `single-flight`: at most one full sweep runs at a time per app shell;
- `coalesced`: bursts of successful generations collapse into one follow-up
  sweep;
- `non-blocking for success UX`: user-visible generation success is not delayed
  on cleanup completion.

## Slices

### Slice 1: Retention contract and owner boundary

Goal:

Write and verify an app-local retention contract covering history, logs, and
generated outputs without changing shared package ownership.

Required outcome:

- named retention classes and caps;
- documented deletion order for history-linked assets;
- explicit stop triggers for shared-contract changes or in-use protection gaps.

Allowed scope:

- current authority docs if durable retention facts need correction
- no runtime behavior changes yet

Validation:

```bash
pnpm check:policy
```

Stop rule:

Stop if asset cleanup cannot be defined safely without shared `AssetStore`
listing/index APIs.

### Slice 2: History trimming with asset-linked deletion

Goal:

Add deterministic task/job history trimming that preserves asset deletion
discoverability.

Required behavior:

- load complete history before trimming;
- compute trimmed records, protected refs, and eligible output refs;
- delete eligible assets before persisting trimmed history;
- keep active/retryable records outside the terminal-count cap.

Allowed scope:

- `uxp-job-history-adapter.ts`
- `indexed-db-storage.ts`
- app-local retention helpers
- focused tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- uxp-host-adapters history-page image-resource
pnpm check:policy
```

Stop rule:

Stop if V1 requires new shared APIs to discover or count assets that are not
reachable from task history.

### Slice 3: Generated output oldest-first eviction

Goal:

Bound generated output growth with a high/low watermark policy.

Required behavior:

- govern only provider generated outputs;
- use `highWatermark` / `lowWatermark`;
- evict oldest eligible outputs first;
- never delete protected/shared refs;
- keep terminology accurate: `oldest-first eviction`, not `LRU`.

Allowed scope:

- UXP and Chrome storage adapters
- app-local retention coordinator
- focused tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- chrome-adapter uxp-host-adapters image-resource
pnpm check:policy
```

Stop rule:

Stop if the implementation needs byte-accurate global asset enumeration outside
task-linked ownership.

### Slice 4: Log retention

Goal:

Add bounded UXP log retention that covers both day count and runaway size.

Required behavior:

- keep only newest `N` day folders;
- additionally enforce a simple log size cap (single-day or total-log bound);
- remain fail-open and not break app behavior when cleanup fails.

Allowed scope:

- `uxp-log-sink.ts`
- app-local retention helpers
- focused tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- uxp-diagnostics uxp-host-adapters
pnpm check:policy
```

Stop rule:

Stop if the log-size policy would require unsupported host APIs or invasive
changes to `@imagen-ps/foundation`.

### Slice 5: Sweep orchestration and shell integration

Goal:

Run retention at safe times without polluting the success path.

Required behavior:

- one startup sweep per app shell;
- one coalesced post-success sweep path;
- single-flight execution;
- best-effort logging only on failure.

Allowed scope:

- `create-plugin-host-shell.ts`
- `create-chrome-app-shell.ts`
- app-local retention coordinator
- focused tests or harness helpers

Validation:

```bash
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

Stop rule:

Stop if integration would require UI waits, modal prompts, or changing the
task-success lifecycle semantics.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/app test
```

Focused specs may narrow further once the exact test files are known.

Final:

```bash
pnpm validate
```

Manual-only:

- none required for planning;
- if final implementation touches real UXP host file behavior in a way not
  sufficiently covered by fakes, record separate manual-only evidence

Live-provider:

- not required;
- retention must remain mock-only testable

## Decision Packet triggers

Produce a Decision Packet instead of guessing if any of these occur:

- V1 needs `AssetStore.list()` / `TaskStore` shared-contract expansion.
- Historical orphan assets already exist and must be cleaned even when no
  `TaskRecord` still references them.
- Protecting `currently placing/downloading` assets needs new global UI/runtime
  ownership that is not already present.
- Count-only generated-asset cap is rejected and byte-cap enforcement becomes
  mandatory in the same slice.
- Log size retention cannot be expressed with current UXP file APIs.

Recommended initial Decision Packet shape if blocked:

- `A`: V1 remains task-linked only; no orphan backfill; no shared contract change.
- `B`: add a minimal host-local asset metadata index inside `apps/app` only.
- `C`: expand shared `AssetStore` contract with listing/stat support.

## Completion report

The executing agent must report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory note candidate

Yes: `architecture` or `decision` only if the implemented retention policy,
protected-ref semantics, or shared-boundary decision becomes stable repository
knowledge and is promoted into current authority docs.
