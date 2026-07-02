# Provider Endpoint Collection And Failover

Status: draft
Authority: current user authorization on 2026-07-02
Owner: cross-boundary slices under `packages/providers`, `packages/application`, and `apps/app`
Created: 2026-07-02

## Context docs

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `packages/providers/AGENTS.md`
- Current authority: `packages/application/AGENTS.md`
- Current authority: `apps/app/AGENTS.md`
- Historical reference: `docs/loops/2026-07-01-global-generation-settings.md`
- External design reference only: CC Switch failover concepts are useful for
  health probing, circuit breaker, queue ordering, and diagnostics, but its
  public failover model is provider-level rather than "multiple equivalent URLs
  inside one provider profile". Do not treat it as a direct data-model
  precedent.

## Goal

Replace single-`baseURL` provider-profile semantics with endpoint-collection
semantics, so one profile can own multiple equivalent relay entrances with:

- manual preferred-endpoint selection;
- automatic endpoint probing and runtime endpoint ranking;
- explicit request-time failover policy;
- in-request cross-endpoint failover for discovery and invoke paths;
- mock-verifiable compatibility for existing single-`baseURL` profiles.

The implementation must preserve current package ownership boundaries and close
with `pnpm validate`.

## Product semantics

- A provider profile may contain multiple request addresses for the same relay
  identity and the same credential scope.
- Endpoints inside one profile are explicitly treated as sharing the same
  idempotency scope. Cross-endpoint replay inside that profile is allowed by
  product policy for this Loop.
- `Auto Select` means the app may probe all enabled endpoints and choose the
  runtime endpoint ordering automatically.
- `Manual Select` means the user chooses the preferred endpoint ordering seed.
- `Fail over when unavailable` is a separate dimension from
  `selectionMode`. Product may still choose a default value, but the data model
  and plan must not hide that dimension inside `selectionMode`.
- Probe / test-address behavior is profile-scoped and should prefer
  non-generation paths. If a provider family cannot support a safe non-paid
  probe, the result must be `unsupported` rather than falsely marking the
  endpoint unreachable.
- Save/test profile status and endpoint-probe status are separate UI surfaces.
- Legacy single-`baseURL` profiles remain readable and editable; they should
  render as a one-endpoint collection.
- Cross-endpoint replay inside one profile is a product policy that provides
  at-least-once execution semantics, not a guarantee of exactly-once execution.

## Non-goals

- No real paid/live provider smoke in default validation.
- No Photoshop / UXP host behavior changes.
- No durable endpoint health history persistence outside the profile config.
- No generic load balancing across heterogeneous relays or providers.
- No `packages/core-engine` ownership changes unless a Decision Packet approves
  them.
- No background worker, cron, or passive health monitor.
- No provider quota/cost routing logic.
- No broad settings IA redesign outside provider settings flows.
- No direct reuse of CC Switch provider-queue schema.

## Scope

Allowed files and areas:

- `packages/providers/src/contract/*`
- `packages/providers/src/providers/*`
- `packages/providers/src/transport/*`
- `packages/providers/tests/*`
- `packages/application/src/commands/*`
- `packages/application/src/runtime.ts`
- `packages/application/src/*.test.ts`
- `apps/app/src/shared/ui/components/*provider*`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- focused app tests under `apps/app/tests` and `apps/app/src/**/*.test.ts*`
- authoritative docs if durable contract rules change

Forbidden files and areas:

- `packages/core-engine/**` without explicit re-scope
- Photoshop host bridge, UXP storage, or app resource lifecycle unrelated to
  provider-profile settings
- live-provider harness creation as part of this Loop
- provider credential storage redesign
- broad navigation or design-system refactors outside provider settings

## Ownership boundary

- `packages/providers` owns:
  - provider config schema and normalization target;
  - endpoint collection runtime contract;
  - a single shared request executor for endpoint ordering, endpoint-local
    retry, total-attempt budgeting, endpoint switching, and attempt
    diagnostics;
  - provider participation in that executor by supplying endpoint-specific URL,
    headers, body, and provider-specific response/error interpretation;
  - endpoint probe result normalization at transport/provider level.
- `packages/application` owns:
  - profile save/load compatibility;
  - resolver normalization from persisted profile config to runtime config;
  - surface-agnostic commands for draft-aware probe/test/save selection;
  - preserving secret boundaries.
- `apps/app` owns:
  - request-address management UI;
  - auto/manual toggle UX;
  - probe/test button wiring and local page state;
  - rendering endpoint rows and preferred markers.
- `packages/core-engine` must not own endpoint selection or transport failover.

## Baseline

Current state:

- Provider runtime contract is single `baseURL: string`:
  `packages/providers/src/contract/config.ts`
- Provider schemas validate one URL:
  `packages/providers/src/providers/*/config-schema.ts`
- Provider invoke/discovery directly compose request URLs from one `baseURL`:
  `packages/providers/src/providers/*/provider.ts`
- Provider settings UI edits one `Base URL` field:
  `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- Save path validates merged config but persists raw shape:
  `packages/application/src/commands/provider-profiles.ts`

Before implementation:

```bash
pnpm check:policy
```

If baseline fails, report whether the failure is pre-existing. Continue only if
the failure is unrelated and does not block attribution.

## Canonical design target

Persisted profile config should move from a single URL field to a connection
collection:

```ts
connection: {
  selectionMode: 'manual' | 'auto',
  failoverEnabled: boolean,
  preferredEndpointId?: string,
  endpoints: readonly {
    id: string,
    url: string,
    enabled: boolean
  }[]
}
```

Compatibility rules:

- Legacy input with only `baseURL` normalizes into
  `connection.endpoints = [{ id, url: baseURL }]`.
- Legacy input also normalizes `enabled: true` and a deterministic legacy
  endpoint id.
- `baseURL` stops being the canonical persisted field once a profile is saved
  through the new path.
- Providers validate and return canonical connection shape.
- Application persists provider-normalized config, not raw user draft shape.
- Canonical output constraints:
  - `normalize(normalize(config)) === normalize(config)`
  - at least one enabled endpoint must exist
  - `manual` mode requires `preferredEndpointId` to exist and refer to an
    enabled endpoint
  - disabled endpoints do not participate in probe, ordering, retry, or
    failover
  - endpoint id is stable across URL edits once created
  - conflicting legacy `baseURL` + new `connection` input must be rejected, not
    guessed
- URL normalization rules must be explicit:
  - trim surrounding whitespace
  - normalize scheme and hostname case
  - define trailing-slash behavior
  - reject fragments
  - define query-string policy
  - reject embedded credentials
  - duplicate detection runs on canonical URL, not raw input string

Resolved runtime config should expose configuration semantics without inventing a
shared mutable "current active endpoint":

```ts
resolvedConnection: {
  selectionMode: 'manual' | 'auto',
  failoverEnabled: boolean,
  preferredEndpointId?: string,
  endpoints: readonly {
    id: string,
    url: string
  }[]
}
```

Per-request execution returns selection/attempt evidence instead:

```ts
{
  selectedEndpointId: string,
  attempts: readonly EndpointAttempt[]
}
```

Runtime-only health state is session scoped and not persisted:

```ts
type EndpointRuntimeHealth = {
  consecutiveFailures: number,
  openUntil?: number,
  lastSuccessAt?: number
}
```

## Executable slices

### Slice 1: Provider config canonicalization

Goal: Introduce provider-owned endpoint-collection config schemas and return
canonical normalized config from `validateConfig()`.

Allowed files:

- `packages/providers/src/contract/config.ts`
- `packages/providers/src/providers/image-endpoint/config-schema.ts`
- `packages/providers/src/providers/chat-image/config-schema.ts`
- `packages/providers/src/providers/prompt-optimize/config-schema.ts`
- provider contract exports and related tests

Forbidden:

- `packages/application/**`
- `apps/app/**`

Implementation target:

- Add provider-owned endpoint collection types shared by supported provider
  families.
- Accept both legacy `baseURL` and new `connection.endpoints` input.
- Normalize to canonical collection output.
- Add `failoverEnabled` as an explicit config field.
- Make `enabled` canonical and required on every endpoint.
- Reject conflicting `baseURL` + `connection` input.
- Decide and document duplicate URL policy on canonicalized URLs. Default
  recommendation: reject duplicates.
- Define URL normalization and endpoint-id stability rules.

First test skeleton:

- `packages/providers/tests/provider-config-endpoints.test.ts`
  - normalizes legacy `baseURL` to one endpoint
  - injects deterministic legacy endpoint id and `enabled: true`
  - accepts multi-endpoint config and preserves order
  - rejects empty endpoint list
  - rejects invalid URL
  - rejects duplicate endpoint ids
  - rejects duplicate canonical URLs if policy forbids them
  - rejects `manual` mode without enabled preferred endpoint
  - preserves provider-specific fields during normalization
  - canonicalization is idempotent
  - covers path-sensitive URLs:
    - `https://api.example.com`
    - `https://api.example.com/`
    - `https://api.example.com/v1`
    - `https://api.example.com/api/coding/paas/v4`
    - `https://api.example.com/anthropic`

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: stop if canonicalization requires app/session state or host storage.

### Slice 2: Application save/load normalization

Goal: Persist canonical provider config and keep existing profile commands
compatible with legacy single-URL profiles.

Allowed files:

- `packages/application/src/commands/types.ts`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/runtime.ts`
- `packages/application/src/runtime.test.ts`
- `packages/application/src/commands/provider-profiles.test.ts`

Forbidden:

- `packages/providers/src/transport/**`
- `apps/app/**`

Implementation target:

- Update save path so `provider.validateConfig()` result becomes persisted
  config, instead of only acting as validation.
- Preserve existing secret handling and alias rules.
- Ensure read paths can resolve old profiles and rewrite them canonically on
  next save.
- Keep application ownership out of provider transport details.

First test skeleton:

- `packages/application/src/commands/provider-profiles.test.ts`
  - save canonicalizes legacy `baseURL`
  - update profile can delete/replace preferred endpoint through collection
  - saving profile preserves models cache while rewriting config shape
- `packages/application/src/runtime.test.ts`
  - resolver returns canonical endpoint collection for legacy stored profile
  - resolver does not invent shared mutable `activeEndpointId`

Validation:

```bash
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if application needs provider transport retry knowledge to
persist config correctly.

### Slice 3: Probe and selection command surface

Goal: Add surface-agnostic commands for endpoint probing and preferred-endpoint
selection.

Allowed files:

- `packages/application/src/commands/index.ts`
- `packages/application/src/commands/types.ts`
- `packages/application/src/commands/provider-profiles.ts`
- new `packages/application/src/commands/profile-endpoints.ts`
- related application tests

Forbidden:

- `apps/app/**`
- `packages/core-engine/**`

Implementation target:

- Add command result types for richer endpoint probe:

```ts
type EndpointProbeResult = {
  endpointId: string
  status: 'healthy' | 'degraded' | 'unsupported' | 'unreachable' | 'incompatible'
  latencyMs?: number
  checkedAt: number
  failureKind?: 'dns' | 'connect' | 'timeout' | 'auth' | 'rate-limit' | 'invalid-response' | 'unsupported-probe'
  httpStatus?: number
  modelCount?: number
  errorMessage?: string
}
```

- Add a draft-aware command to probe endpoints from unsaved form config and
  unsaved credentials without persisting them.
- Probe should prefer safe non-generation paths. Unsupported safe probe returns
  `unsupported`, not `unreachable`.
- Probe must not mutate `profile.models` cache.
- Probe must support cancellation, per-endpoint timeout, and bounded
  concurrency.
- Add deterministic preferred-endpoint selection:
  - manual mode: keep user-selected preferred endpoint
  - auto mode: produce runtime/session suggestion, not persistent profile
    mutation

Runtime/session distinction:

- `preferredEndpointId`: persistent user choice for manual mode
- `suggestedEndpointId`: runtime/session-only result from latest probe
- probe must not implicitly save `preferredEndpointId`

First test skeleton:

- `packages/application/src/commands/profile-endpoints.test.ts`
  - probe accepts unsaved draft config and temporary credential
  - probe returns per-endpoint status with partial failures
  - unsupported safe probe yields `unsupported`
  - auto mode chooses fastest healthy endpoint as runtime suggestion only
  - all-failed probe does not mutate persisted preferred endpoint
  - manual mode ignores probe ranking for persisted preferred endpoint
  - probe does not rewrite models cache

Validation:

```bash
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if probe semantics require persistent health history or
background tasks.

### Slice 4: Provider endpoint-candidate integration

Goal: make provider implementations endpoint-aware without giving them ownership
of endpoint-loop fallback.

Allowed files:

- `packages/providers/src/providers/image-endpoint/provider.ts`
- `packages/providers/src/providers/chat-image/provider.ts`
- `packages/providers/src/providers/prompt-optimize/provider.ts`
- supporting provider-local helpers
- provider tests

Forbidden:

- `apps/app/**`
- `packages/core-engine/**`

Implementation target:

- Introduce provider helpers that can:
  - derive URL from one concrete endpoint candidate
  - build provider-specific headers/body
  - parse provider-specific responses/errors
- Provider code must not own nested endpoint fallback loops.
- Shared failover executor will call provider logic with concrete endpoint
  attempts.
- Keep provider-facing diagnostics structured and secret-safe.

First test skeleton:

- `packages/providers/tests/image-endpoint-provider.test.ts`
  - provider builds correct request for one concrete endpoint candidate
  - path concatenation respects versioned/custom suffix base URLs
- `packages/providers/tests/chat-image-provider.test.ts`
  - same endpoint-candidate request-building assertions for chat family
- `packages/providers/tests/prompt-optimize-provider.test.ts`
  - reserved profile path can use endpoint candidates without special fallback
    ownership

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: stop if provider request-building cannot stay endpoint-local without
reintroducing provider-owned fallback loops.

### Slice 5: Shared transport failover executor

Goal: make one shared executor the only owner of endpoint ordering, endpoint
retry, endpoint switching, circuit breaking, total attempt budget, and attempt
diagnostics.

Allowed files:

- `packages/providers/src/transport/image-endpoint/http.ts`
- `packages/providers/src/transport/image-endpoint/retry.ts`
- `packages/providers/src/transport/image-endpoint/paid-retry.ts`
- new transport helper(s) under `packages/providers/src/transport/image-endpoint/`
- transport tests

Forbidden:

- `apps/app/**`
- `packages/application/**` except minimal type plumbing already approved by
  prior slices

Implementation target:

- Preserve distinction between:
  - failover matrix
  - endpoint-local retry count policy
  - total logical-request attempt budget
  - total logical-request deadline
- Add one shared `executeWithEndpointFailover()`:
  - orders endpoint candidates
  - retries inside one endpoint when policy allows
  - switches to next endpoint when failover-eligible
  - tracks global `maxAttempts` and `deadlineMs`
  - emits attempt diagnostics
  - disables or explicitly budgets any underlying SDK retry
- Add runtime-only circuit breaker / cooldown:
  - session-scoped only
  - no persistence
  - config change clears state
  - cooldown skip before retrying known-bad endpoint
- Use a stable logical request id / idempotency key across all endpoint
  attempts.

Failover matrix target:

- DNS / TCP connect failure before request send: fail over
- connect timeout: fail over
- 408 / 500 / 502 / 503 / 504 / 529: retry or fail over within total budget
- 429: obey `Retry-After` when present; do not assume endpoint switch bypasses
  credential-scoped rate limit
- 401 / 402 / 403: profile-level terminal, do not fail over
- 400 / 413 / 422: request-level terminal, do not fail over
- 404: endpoint invalid for this path, may try next endpoint but do not retry
  current endpoint
- read timeout after full request send: `ambiguous`; default no cross-endpoint
  replay unless explicitly approved by final policy
- once response bytes or first SSE event are received: do not switch endpoint

The final document should state that cross-endpoint replay inside this Loop is
an at-least-once policy, not exactly-once.

First test skeleton:

- `packages/providers/tests/retry-endpoint-failover.test.ts`
  - 429 then success on same endpoint
  - 503 then fallback to next endpoint
  - connect/network error then next endpoint invoke succeeds
  - 401 does not fail over
  - 404 skips retry on current endpoint and may try next endpoint
  - read-timeout after send follows chosen `ambiguous` policy
  - diagnostics include endpoint attempt index/id
  - global `maxAttempts` caps nested retry+failover volume
  - global `deadlineMs` aborts remaining attempts
  - cooldown skips open circuit endpoint on subsequent request
- extend `paid-retry.test.ts`
  - idempotency header remains stable across endpoints inside one logical
    request when policy says replay is allowed
  - no underlying SDK hidden retries exceed total attempt budget

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: produce a Decision Packet if safe cross-endpoint replay requires a
stable engine-owned request id rather than provider/application-owned request
identity.

### Slice 6: Settings UI request-address management

Goal: Replace single `Base URL` editing with request-address management UX that
matches the approved direction.

Allowed files:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- new `apps/app/src/shared/ui/components/*endpoint*`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- focused app tests

Forbidden:

- transport internals
- unrelated page/navigation refactors

Implementation target:

- Introduce endpoint list editor UI:
  - add endpoint row
  - delete endpoint row
  - current preferred marker
  - auto/manual toggle
  - failover toggle
  - probe button
- Legacy profile with one URL renders as one endpoint row.
- Auto-mode probe results remain runtime/session-only suggestions unless the
  product later introduces explicit persistence semantics.
- Save/test profile status remains separate from address-probe status.

First test skeleton:

- `apps/app/tests/provider-settings-endpoints.test.tsx`
  - renders one endpoint from legacy profile
  - add/remove endpoint rows updates save payload
  - auto/manual + failover toggles update config shape
  - probe result marks suggested endpoint without implicit save
  - deleting preferred endpoint follows canonical save rules
  - save error and probe error render in separate notices

Validation:

```bash
pnpm --filter @imagen-ps/app test
```

Optional if interaction complexity grows:

```bash
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Manual-only:

- real UXP smoke with mock provider:
  - create single-endpoint profile
  - add three endpoints
  - delete preferred endpoint
  - switch auto/manual and failover toggle
  - probe with partial success and partial failure
  - save, reopen, and confirm migration/rendering
  - verify narrow and wide panel layouts do not overflow

Stop rule: stop if the flow requires a broader providers-page information
architecture change outside the request-address management scope.

### Slice 7: Final integration and writeback

Goal: integrate all slices, update canonical docs, and close with repo gate.

Allowed files:

- touched files from prior slices
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- package `AGENTS.md` only if boundaries changed materially

Implementation target:

- Update canonical docs for:
  - provider profile endpoint-collection semantics
  - auto/manual selection boundary and failover toggle semantics
  - transport failover validation boundary
- Ensure old single-URL config expectations are removed or clearly marked as
  compatibility-only.

Validation:

```bash
pnpm check:policy
pnpm validate
```

Stop rule: stop if final integration still depends on unapproved live-provider
proof.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
```

Final:

```bash
pnpm validate
```

Manual-only:

- real UXP smoke for the provider-settings flow using mock provider only

Live-provider:

- none in default execution
- any live-provider proof is opt-in and not part of completion criteria

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- cross-endpoint replay needs `packages/core-engine` request identity;
- provider families require incompatible endpoint-collection semantics;
- prompt-optimizer reserved profile needs materially different endpoint policy;
- auto-select requires persistent health history or background monitoring;
- endpoint probe cannot be implemented through mock/fake/contract harnesses;
- one slice would force `packages/application` to own provider transport logic;
- underlying SDK retries cannot be disabled or folded into the shared attempt
  budget.

## Completion report

Report:

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

yes: decision
