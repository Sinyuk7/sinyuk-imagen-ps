# Provider Architecture

Authority: current-state provider adapter architecture
Scope: `packages/providers`
Non-goals: UI state, Photoshop/UXP host IO, unified cross-format response parser abstraction
Last verified: 2026-07-04

## Decision Guide

- Add a new `ApiFormat` when the upstream protocol and semantic request/response contract differ at the provider boundary.
- Add an image-edit request codec when one API format needs a new wire dialect for the same canonical `image_edit` intent.
- Add a provider capability flag when the behavior changes recovery, billing, discovery, or catalog ownership without changing the canonical request.

## Recovery Policy

- `RecoveryDisposition` records failure facts only.
- `decideNextAction()` is the only recovery decision point for image-endpoint edit attempt plans.
- `429` stays on the same endpoint and is owned by transport retry policy alone.
- Unknown execution state (`502/503/504`, `timeout`, `network_error`) stops automatic replay for image-endpoint edit execution.
- Endpoint failover plans and codec-fallback plans are mutually exclusive.

## Attempt Plan

- `ResolvedAttemptPlan` is a flat ordered list of `{ endpointId, codecId, reason }`.
- `DispatchBudget` caps same-endpoint retries, codec fallbacks, endpoint failovers, and total dispatches.
- `AttemptLedger` is consumed before every real HTTP dispatch and fails closed when the budget is exhausted.

## Codec Boundary

- Codec owns request body shape, wire signature, reserved provider option paths, and optional codec-local headers.
- Provider owns path selection, HTTP method, auth headers, retry policy, and response parsing.
- `providerOptions` are allowlisted; reserved codec fields and canonical output fields are never overridable.

## Builtin Checklist

1. Add the provider factory and descriptor.
2. Update `builtins` exhaustiveness and public exports.
3. Confirm `ApiFormat` coverage and catalog ownership boundaries.
4. Add request/response/attempt-sequence coverage under `packages/providers/tests/`.
