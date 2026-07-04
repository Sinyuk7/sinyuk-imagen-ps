Status: draft
Authority: current user authorization in this turn
Owner: packages/application + apps/app + packages/providers
Created: 2026-07-04

# Context docs

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/TESTING.md`
- `docs/ENGINEERING_CONTEXT.md`
- `apps/app/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`

# Goal

Separate three currently coupled actions:

1. Endpoint reachability and latency measurement.
2. Model refresh.
3. Profile configuration validation.

This slice implements only the first two separations. It does not introduce a general provider diagnostic framework.

# Product semantics

## Endpoint probe

The endpoint action answers only:

- Did the configured URL return an HTTP response from the current UXP environment?
- How long did the request take?

It does not validate:

- authentication
- model discovery
- model availability
- provider protocol compatibility
- inference capability
- runtime failover eligibility

## Model refresh

Model refresh only invokes the provider's existing model discovery operation for the intended endpoint.

It must not run endpoint latency measurement.

## Profile validation

The existing profile-level "test connection" action is treated as profile configuration validation.

Its full provider-specific behavior is outside this slice and must be designed separately.

# Non-goals

- Do not create `ProviderProbeCapabilities`.
- Do not create staged probe reports for transport/authentication/discovery/inference.
- Do not create `ProfileReadiness`.
- Do not add paid or non-paid inference tests.
- Do not redesign provider invocation or runtime dispatch.
- Do not modify endpoint failover or endpoint selection.
- Do not add support for new provider families.
- Do not change Photoshop/UXP host IO ownership.

# Scope

## Allowed

- existing endpoint measurement command and provider/application implementation
- existing model refresh command usage
- settings add/detail pages
- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- focused provider/application/app tests
- focused UI copy changes for endpoint latency and profile validation naming
- canonical docs if durable behavior knowledge must be written back

## Forbidden

- `packages/core-engine/**`
- generalized provider capability frameworks
- runtime endpoint routing
- live-provider/release tests
- unrelated documentation or UI cleanup

# Ownership boundary

- `packages/application`
  - owns endpoint probe command semantics and model-refresh command orchestration
- `packages/providers`
  - owns model discovery behavior only
- `apps/app`
  - owns button labels, action separation, latency presentation, and save-model UX
- Forbidden boundary crossings
  - no React/UI logic in `packages/application` or `packages/providers`
  - no provider protocol inference in endpoint probe UI
  - no core-engine changes

# Baseline

- Current endpoint button behavior is coupled to provider model discovery.
- Current detail-page refresh path also couples model refresh with endpoint measurement.
- Current profile-level "test connection" wording is misleading because it conflates configuration validation with connectivity.
- Manual-model profiles can be blocked in practice by model-refresh failure patterns that should not block save.
- Baseline validation before edits:
  - inspect current endpoint probe, model refresh, and settings-flow tests
  - run focused current-state tests for touched suites
- If baseline focused tests already fail, stop and report whether the failure blocks attribution.

# Endpoint probe contract

Use a lightweight HTTP `HEAD` request against the normalized configured endpoint base URL from the current UXP/browser runtime.

```ts
type EndpointProbeResult =
  | {
      status: 'reachable';
      latencyMs: number;
      httpStatus: number;
    }
  | {
      status: 'unreachable';
      latencyMs: number;
      error: 'timeout' | 'network-error' | 'aborted';
    };
```

Rules:

- `200`, `301`, `401`, `403`, `404`, `405`, `429`, `500` all count as `reachable`
- only DNS/TLS/network failure, timeout, or cancellation count as `unreachable`
- HTTP status is display-only; it does not decide network reachability
- do not send API key
- do not send provider-specific headers
- do not call `/models`
- do not update model lists
- do not change selected endpoint
- do not trigger failover
- do not infer provider health or profile usability
- UI text should say `latency` / `response time`, not `fastest endpoint`

# Manual-model boundary

This slice establishes only one product rule:

`/models` failure must not block saving a profile that uses manual model input.`

Model refresh failure may show an error, but it must not be treated as endpoint failure and must not block manual-model save.

Whether the manual model can actually invoke remains part of later profile validation design.

# Slices

## Slice 1

- Goal
  - Define and implement the minimal endpoint probe contract as `HEAD baseUrl` reachability + latency only.
- Allowed scope
  - endpoint probe command path in `packages/application`
  - settings add/detail UI wiring
  - related tests
- Validation
  - focused tests proving:
    - `HEAD baseUrl` is used
    - HTTP status still reports `reachable`
    - timeout/network/cancel report `unreachable`
- Stop rule
  - stop if the current app/runtime boundary cannot issue a lightweight request without leaking provider semantics into the command contract

## Slice 2

- Goal
  - Separate model refresh from endpoint probe.
- Allowed scope
  - model refresh command usage
  - provider discovery invocation call sites
  - settings add/detail pages
  - related tests
- Validation
  - focused tests proving:
    - endpoint probe does not call `discoverModels`
    - model refresh does not run endpoint probe
    - endpoint probe does not mutate selected endpoint
    - endpoint probe does not refresh model catalog
- Stop rule
  - stop if the current settings UX depends on hidden coupling that cannot be removed without broader product redesign

## Slice 3

- Goal
  - Preserve manual-model save behavior when model refresh fails.
- Allowed scope
  - settings add/detail save gating
  - related app/application tests
- Validation
  - focused tests proving:
    - manual-model profile can save when refresh fails
    - discovered-model mode still requires valid selected/discovered model behavior
- Stop rule
  - stop if current save gating cannot distinguish manual-model vs discovered-model without unrelated persistence changes

## Slice 4

- Goal
  - Rename/reframe UI copy so endpoint probe, model refresh, and profile validation are visibly different actions.
- Allowed scope
  - settings UI copy
  - related tests
  - canonical docs if naming becomes durable guidance
- Validation
  - app tests or snapshots proving separate actions remain visible and unambiguous
- Stop rule
  - stop if copy changes imply broader localization/product review beyond the bounded slice

# Validation

- Quick
  - `pnpm check:policy`
- Per-slice
  - `pnpm --filter @imagen-ps/application test`
  - `pnpm --filter @imagen-ps/app test`
  - `pnpm --filter @imagen-ps/providers test`
- Final
  - `pnpm validate`
- Manual-only
  - none required for this slice
- Live-provider
  - not required

# Decision Packet triggers

- Endpoint probe cannot be implemented as pure URL reachability without provider-specific exceptions.
- Model refresh and endpoint probe share hidden state that cannot be separated inside allowed scope.
- Manual-model save gating requires unrelated schema or session changes.
- UI naming changes need product decisions outside the current bounded slice.

# Completion report

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

# Memory note candidate

- yes: decision
- Promote only stable action-separation rules into canonical docs after implementation.
