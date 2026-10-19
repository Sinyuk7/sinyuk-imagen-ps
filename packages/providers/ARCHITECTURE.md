# Provider Architecture

Authority: current-state provider adapter architecture
Scope: `packages/providers`
Non-goals: UI state, Photoshop/UXP host IO, unified cross-format response parser abstraction
Last verified: 2026-08-25

## Vertical Slice Ownership

The product-visible builtins are organized by business integration:

```text
src/providers/
  grsai/
  gemini/
  openai/
```

Each slice owns its `config-schema.ts`, `descriptor.ts`, `provider.ts`, and local `transport/`. Model IDs, parameters, input rules, routes, and output mappings live in `packages/providers/catalog/*.json`; descriptors and request builders read that catalog.

Slices may depend on contracts, the provider catalog, and `shared/transport`,
but never on another Provider slice. Registry composition imports only each
slice's `index.ts`. Application imports the package public API; app UI imports
only Application projections.

## Decision Guide

- Add a new `ProviderId` when the upstream protocol and semantic request/response contract differ at the provider boundary.
- Keep an image-edit request codec inside the owning Provider when its upstream wire dialect differs from the canonical `image_edit` intent.
- Add a provider capability flag when the behavior changes recovery, billing, or catalog ownership without changing the canonical request.

## Recovery Policy

- `RecoveryDisposition` records failure facts only.
- `decideNextAction()` is the only recovery decision point for openai edit attempt plans.
- `429` stays on the same endpoint and is owned by transport retry policy alone.
- Unknown execution state (`502/503/504`, `timeout`, `network_error`) stops automatic replay for openai edit execution.
- Endpoint failover plans and codec-fallback plans are mutually exclusive.

## Attempt Plan

- `ResolvedAttemptPlan` is a flat ordered list of `{ endpointId, codecId, reason }`.
- `DispatchBudget` caps same-endpoint retries, codec fallbacks, endpoint failovers, and total dispatches.
- `AttemptLedger` is consumed before every real HTTP dispatch and fails closed when the budget is exhausted.

## Codec Boundary

- Codec owns request body shape, wire signature, reserved provider option paths, and optional codec-local headers.
- Provider owns path selection, HTTP method, auth headers, retry policy, and response parsing.
- `providerOptions` are allowlisted; reserved codec fields and canonical output fields are never overridable.

## Async Execution Boundary

- Provider may declare an async lifecycle with one `submit()` and repeated `poll()` calls over an opaque remote reference.
- `packages/application` owns the process-lifetime async execution manager, `jobId` deduplication, wait budget, timer, and local cancellation. `packages/providers` owns only provider-local submit/poll wire protocol.
- Provider wire status, task ID, endpoint, authentication, raw response, and polling semantics never enter Core Job, Application Task, Profile persistence, or UI state.
- After a pending submission, execution only polls the same remote reference. It never auto-submits a replacement task.
- Providers without an async lifecycle keep the synchronous `invoke()` path. A long pending Promise is not evidence that remote status can be queried.

## Builtin Checklist

1. Add a named Provider vertical slice with its model catalog and Profile template.
2. Keep Provider-specific request builders, parsers, codecs, and polling inside that slice.
3. Extract a shared primitive only after two current Providers consume identical semantics.
4. Update `builtins` exhaustiveness and public exports.
5. Confirm `ProviderId` coverage and catalog ownership boundaries.
6. Declare the canonical Provider's explicit `defaultModelTemplates`; every row
   must exactly resolve its `baseModelId` to an Official Model Preset. Templates
   are setup-only data, never a runtime discovery or synchronization source.
7. Add or extend provider boundary coverage under `packages/providers/tests/`.
   Prefer expanding the owning contract/compat suite or Case Bank instead of
   creating a new narrow test file.
