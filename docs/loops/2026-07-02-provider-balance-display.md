Status: draft
Authority: current user authorization (2026-07-02)
Owner: cross-boundary slices under `apps/app`, `packages/application`, and `packages/providers`
Created: 2026-07-02

# Provider Billing Display

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`

Current code references:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ports/commands-port.ts`
- `packages/application/src/commands/profile-endpoints.ts`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/types.ts`
- `packages/providers/src/contract/provider.ts`

Requirement reference from current user turn:

- Balance query is not part of the OpenAI-compatible model-call contract.
- Different vendors and relays expose different balance, quota, credits, or usage endpoints.
- Some providers require the same API key as inference, while others require separate management credentials such as access token plus user id.
- Unknown relays need explicit future design work, not path guessing or endpoint scanning in this Loop.

## Goal

Add a bounded provider-billing design that answers the two product questions the main surface actually cares about: how much money is left for the current provider profile, and how much the just-finished remote provider request actually or approximately cost, without treating billing-query failure as provider-call unavailability.

## Non-goals

- No claim that a unified balance protocol exists.
- No fixed repository-wide `GET /balance` contract.
- No automatic path scanning such as `/balance`, `/user/balance`, `/api/user/self`, or vendor-domain guessing.
- No live-provider proof as part of the default Loop.
- No change to generation dispatch, endpoint failover, model discovery, or job lifecycle semantics.
- No balance-driven routing, provider disablement, or retry decisions in this slice.
- No storage of secret-bearing management credentials in logs, docs, test fixtures, or non-secret profile fields.
- No `custom` balance-query mode, extractor DSL, template-substitution HTTP mini-language, JSONPath, or JavaScript evaluator in V1.
- No claim that `New API` and `One API` are one shared adapter or one shared auth contract.
- No hardcoded `quota / 500000 = USD` rule in shared domain, application logic, or UI.
- No main-page UI that exposes raw provider metrics, package composition, or quota internals as the primary contract.
- No claiming that balance delta is exact per-task cost unless the provider gives exact request cost.
- No new permanent documentation outside the approved high-authority set.

## Scope

Allowed future implementation scope:

- `packages/providers/src/contract/*`
- provider implementations and provider tests under `packages/providers/src/providers/*` and `packages/providers/tests/*`
- `packages/application/src/commands/*`
- `packages/application/src/runtime.ts`
- `apps/app/src/shared/ports/*`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/components/*` for focused settings/status UI
- `apps/app/src/shared/ui/hooks/*`
- focused app/application/provider tests
- canonical doc updates only if durable behavior becomes implementation truth

Forbidden scope:

- `packages/core-engine`
- Photoshop / UXP host IO behavior unrelated to secret storage or app settings persistence
- broad settings redesign unrelated to provider billing display
- live provider credentials, raw provider payload logs, or paid smoke calls by default
- treating balance response shape as shared across providers without explicit adapter code

## Ownership boundary

- `packages/providers` owns provider-specific balance query capability, request building, response parsing, semantic normalization, and capability declaration.
- `packages/providers` also owns provider-response task-cost extraction when the upstream response can expose exact request cost.
- `packages/application` owns surface-agnostic commands plus runtime billing state: balance cache, refresh state, coalescing, invalidation, and post-execution refresh scheduling.
- `apps/app` owns main-page billing display, provider-settings billing UI, notices, locale-aware formatting, and command triggering.
- Secret persistence remains on the existing secret-storage boundary. Shared packages must not own host storage.
- `packages/core-engine` remains unchanged because provider billing display is not part of job dispatch.

## Baseline

Current repository facts:

- The app already distinguishes profile connectivity/model discovery status from general settings UI.
- `probeProfileEndpoints` is a safe optional command in `packages/application` that uses an optional provider capability (`discoverModels`) and returns normalized per-endpoint status.
- `settings-detail-page` already has a test/status area and a profile editor flow suitable for another optional provider-side query action.
- `packages/providers` already uses optional provider capabilities rather than forcing every provider to implement every operation.
- Current shared command types contain endpoint probe result shapes, but no balance-domain types yet.
- Current app generation settings are app-global and not appropriate for provider-specific balance credentials or extractor config.
- Current app surface has no repository billing state contract for “current balance” or “last task cost”.
- Current UXP manifest permission is `requiredPermissions.network.domains = "all"` in `apps/app/public/manifest.json`, but balance-query design must still constrain allowed origins and secret flow explicitly instead of relying on that broad current setting.

Baseline validation before implementation claims:

```bash
pnpm check:policy
```

If the baseline fails, report whether the failure is pre-existing before attributing any later regression to this Loop.

## Current-state conclusion

The repository should not model billing as a universal transport feature of every OpenAI-compatible endpoint.

The correct current-state framing is:

- model invocation compatibility and balance query compatibility are separate concerns;
- main-page product value is one primary money-oriented answer, not a generic metric browser;
- provider adapters may parse complex upstream billing data, but they must choose one primary summary for the main surface;
- detailed composition belongs in provider settings, not in the main generation surface;
- missing or failed billing support must not mark the provider profile unusable for generation.

## Recommended design target

### 1. Add a primary-summary-first billing snapshot

Recommended provider-side shape:

```ts
type ProviderBalanceSummary =
  | {
      readonly kind: 'money';
      readonly remaining: string;
      readonly currency: string;
    }
  | {
      readonly kind: 'quota';
      readonly remaining?: string;
      readonly usedPercent?: number;
      readonly unit?: string;
    };

type ProviderBalanceDetail =
  | {
      readonly kind: 'money';
      readonly label: string;
      readonly amount: string;
      readonly currency: string;
    }
  | {
      readonly kind: 'quota';
      readonly label: string;
      readonly value: string;
      readonly unit: string;
      readonly resetAt?: number;
    };

interface ProviderBalanceSnapshot {
  readonly primary: ProviderBalanceSummary;
  readonly details?: readonly ProviderBalanceDetail[];
  readonly sourceCheckedAt?: number;
}
```

Recommended application-side shape:

```ts
interface ProfileBalanceResult {
  readonly providerId: string;
  readonly profileId: string;
  readonly checkedAt: number;
  readonly snapshot: ProviderBalanceSnapshot;
}
```

Rules:

- main page reads one app-formatted value derived from `snapshot.primary`;
- provider adapter may parse multiple upstream values, but it must choose one primary summary;
- `details` are optional and belong to provider detail/settings UI only;
- numeric money or quota values use decimal strings unless a field is explicitly percentage-like;
- provider does not own locale formatting, currency symbols, text prefixes, or UI display style;
- `profileId`, local `checkedAt`, and stale-display logic are not provider-owned fields.

Reason:

- the product only cares about one top-level answer on the main page;
- upstream complexity still exists, but it should stay behind the provider adapter and settings detail UI;
- decimal strings avoid precision drift in money displays;
- it keeps provider/application/app ownership boundaries aligned.

### 2. Split balance query and task-cost extraction into two capabilities

Recommended provider contract direction:

```ts
interface Provider<TConfig, TRequest> {
  // existing methods
  queryBalance?(config: TConfig, input: ProviderBalanceQueryInput): Promise<ProviderBalanceSnapshot>;
  extractTaskCost?(result: ProviderInvokeResult): ExactTaskCost | undefined;
}
```

Recommended task-cost shapes:

```ts
interface ExactTaskCost {
  readonly amount: string;
  readonly currency: string;
  readonly completeness: 'complete' | 'partial';
}

interface BalanceChange {
  readonly amount: string;
  readonly currency: string;
  readonly direction: 'decreased' | 'increased';
}
```

Reason:

- “how much is left” and “how much this task cost” are different questions;
- some providers support balance but not exact task cost;
- some providers may expose exact request cost in the response;
- balance delta is an application-side observation, not provider exact task cost.

### 3. Separate profile connection config from balance-query config

Recommended profile-level design:

```ts
type BalanceQueryConfig =
  | { readonly mode: 'none' }
  | { readonly mode: 'official' }
  | {
      readonly mode: 'new-api';
      readonly userId: string;
      readonly accessTokenSecretRef: string;
    };
```

Rules:

- non-secret shape lives in sanitized profile config;
- secret values such as management token live in secret storage, not plain profile config;
- reuse inference API key only when the provider adapter explicitly supports that path;
- `mode: 'none'` is the default.
- this Loop defines no `custom` mode and no extractor format.
- `mode: 'new-api'` means the `New API` panel family only.
- `userId` must be the provider-required integer user id, not a username-shaped free-form label.

Reason:

- current generation settings are app-global and wrong for per-profile balance config;
- current provider profile editing flow already owns per-profile config and secret edits;
- `New API` balance often needs extra credentials not used by image generation.

### 4. Keep `New API` and `One API` separate

V1 support target:

- `official`
- `new-api`

Out of scope for this Loop:

- `one-api`

Rules:

- do not document `One API` as already supported by the `new-api` mode;
- if a later slice wants panel-family support beyond `New API`, it must add an explicit variant or a separate mode with its own auth and response contract;
- do not share a single adapter name when auth headers or response semantics are not evidenced to be the same.

Reason:

- the two panel families are related but not equivalent;
- collapsing them early would bake undocumented auth assumptions into the contract.

### 5. Keep quota raw unless conversion is explicitly evidenced

Rules:

- raw panel quota values remain raw provider units unless the adapter has reliable conversion evidence;
- do not hardcode `quota / 500000 = USD`;
- do not infer `total = quota + used_quota` as a shared rule outside an adapter that explicitly owns that semantics;
- if conversion evidence is missing, render units such as `quota` or `credits` honestly instead of inventing a currency.

Reason:

- relay-panel quota conversion is deployment-specific;
- shared domain and UI must not turn one panel default into a repository-wide financial rule.

### 6. Use provider presets where evidence exists

Rules:

- known provider presets may bind a billing adapter automatically;
- provider creation should not force every user to manually choose `official | new-api` when the preset already determines the adapter;
- extra billing fields should appear only when the selected adapter actually requires them;
- unknown custom providers may have no billing adapter by default.

Reason:

- this matches the product expectation that common built-in providers “just show balance” when the repo already knows the provider family.

### 7. Define the surface split explicitly

Main page:

- show one primary billing value for the current provider profile;
- do not render raw metrics or billing composition;
- after a remote provider request settles and may have been billed, asynchronously refresh the current profile billing state;
- if exact task cost exists, show it in the success toast;
- if exact task cost does not exist but balance changed, show balance change only as balance change;
- if billing refresh fails, do not emit a second failure toast after a successful generation toast.

Provider settings detail page:

- manual refresh remains available;
- billing adapter/configuration lives here;
- detailed billing composition, last checked time, and stale/error state live here;
- billing failure remains isolated from connectivity health.

Do not place provider billing configuration under global generation settings.

Reason:

- this matches the product boundary: main page is money summary, settings page is billing detail.

### 8. Refresh billing automatically after provider execution settles

Required behavior:

- after remote provider execution settles and may have created a billable event, application invalidates that profile billing cache and schedules an async refresh;
- refresh does not block task completion or task result delivery;
- refresh failure does not alter task status, provider health, model refresh, or endpoint probe state;
- manual refresh remains available;
- repeated task completions for the same profile should coalesce into one refresh window rather than firing one balance request per completion.
- exact task cost for one user task must accumulate every remote provider attempt that can provide exact cost inside that task boundary;
- if only some billable attempts expose exact cost, the result must be marked partial and must not be described as full task cost;
- balance refresh is coalesced per profile after those remote attempts settle, not once per raw HTTP attempt.

Reason:

- provider billing can happen before downstream app-side download/decode/place steps finish;
- “task completed” is not the right proxy for “remote provider may have charged”;
- retries and failover can create more than one billable remote attempt for one user-visible task;
- coalescing preserves the product feel without producing avoidable bursts of billing requests.

### 9. Use runtime-only billing state with explicit invalidation

V1 cache rules:

- store balance cache in app runtime memory only;
- do not persist balance snapshots into profile config, app generation settings, secret storage, or durable history stores;
- cache key is `profileId + balanceConfigFingerprint`;
- when a profile first becomes the active profile and has no runtime balance cache, allow one lazy async refresh through the same coalescing/deduplication path;
- changing provider endpoint, query mode, `userId`, or related secret invalidates the cache immediately;
- failed query does not overwrite last successful snapshot;
- V1 stale behavior is event-driven only: mark stale when the latest refresh fails but last-success data is still shown; do not add time-based auto-stale in this Loop;
- app restart may clear all balance cache with no recovery step;
- current runtime may also keep the last known task cost for the active profile, but it is not durable state.

Recommended application-side state:

```ts
interface ProfileBillingState {
  readonly balance?: ProfileBalanceResult;
  readonly lastExactTaskCost?: ExactTaskCost;
  readonly lastBalanceChange?: BalanceChange;
  readonly refreshState: 'idle' | 'refreshing' | 'error';
}
```

Reason:

- it keeps billing state lightweight and session-scoped;
- it avoids mixing fast-changing money state into long-lived profile persistence;
- it removes ambiguity about failure overwrite, restart behavior, and task-cost lifecycle.

### 10. Constrain origin use and UXP network behavior explicitly

Rules:

- balance adapter URLs must come from provider-owned or profile-owned evidenced origins, not free-form unrelated third-party origins in this Loop;
- current UXP manifest allows `network.domains = "all"`, but implementation must still treat origin choice as a product/security constraint rather than “anything is allowed”;
- management secrets must not be sent to an origin outside the intended provider/panel family;
- if a requested balance mode requires an unsupported or unauthorized origin contract, surface a structured unsupported/misconfigured result instead of disguising it as a generic network failure.

Reason:

- broad current manifest permission is an implementation fact, not a design waiver;
- management tokens should not be silently replayed to arbitrary hosts.

## Rejected designs

### Rejected: universal `/user/balance`

Reject a repository contract that assumes:

```ts
GET {baseUrl}/user/balance
Authorization: Bearer {apiKey}
```

Why:

- this is a convenient template, not a standard;
- it fails for vendors requiring different paths, auth headers, or response shapes;
- it would create false expectations in UI and tests.

### Rejected: infer support by endpoint probing or URL scanning

Why:

- repeated 401/404 requests are noisy and operationally risky;
- response success does not prove semantic meaning;
- some paths require management credentials and cannot be safely guessed.

### Rejected: one generic “balance” label without semantic kind

Why:

- account cash, key quota, plan usage, and total spend are not interchangeable;
- misleading labels are worse than no label.

### Rejected: main page driven by `details[]` or raw metric lists

Why:

- it forces the main surface to understand provider internals the product does not care about;
- it turns a simple money answer into a generic billing dashboard.

### Rejected: V1 custom query system

Why:

- it would turn a bounded display feature into a scripting surface;
- it expands auth, request-shaping, parsing, and safety scope far beyond the approved recommendation.

## Slices

### Slice 1: Primary-summary billing domain and provider capabilities

Goal:

Define the primary-summary billing result plus `queryBalance` / `extractTaskCost` optional provider capabilities without touching dispatch/runtime ownership outside provider/application boundaries.

Allowed scope:

- `packages/providers/src/contract/*`
- `packages/application/src/commands/types.ts`
- focused provider/application tests

Validation:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
```

Stop rule:

Stop and produce a Decision Packet if a provider cannot choose one defensible primary summary for the main surface without inventing semantics.

### Slice 2: Profile-level balance query config and secret boundary

Goal:

Define how a profile stores non-secret balance settings for `none | official | new-api`, and how management credentials stay on the existing secret boundary.

Allowed scope:

- `packages/application/src/commands/*`
- `apps/app` provider settings form and host persistence wiring
- focused tests

Validation:

```bash
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
```

Stop rule:

Stop if the slice requires moving host secret persistence into shared packages or storing management tokens in sanitized profile config.

### Slice 3: Application billing state and refresh flow

Goal:

Add surface-agnostic billing commands/state that resolve a profile, refresh billing, store runtime-only billing state, extract exact task cost when available, and coalesce post-execution balance refreshes.

Allowed scope:

- `packages/application/src/commands/*`
- `apps/app/src/shared/ports/commands-port.ts`
- focused tests

Validation:

```bash
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
```

Stop rule:

Stop if implementation evidence shows post-execution refresh cannot be triggered from application-owned evidence without crossing into unauthorized runtime or engine ownership.

### Slice 4: Main-page, toast, and settings billing UI integration

Goal:

Expose one main-page billing summary, toast-level task cost or balance change messaging, and settings-page billing detail/refresh UX without confusing any of them with connectivity health.

Allowed scope:

- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/components/*`
- `apps/app/src/shared/ui/i18n/*`
- focused app tests and Chrome E2E only if needed

Validation:

```bash
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

Stop rule:

Stop if the UI starts to imply that balance failure means provider generation failure, or if balance delta is being presented as exact cost without provider evidence.

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

Required contract coverage for the future implementation Loop:

- provider without `queryBalance` returns unsupported behavior without changing connectivity health;
- `mode: 'none'` performs no network request;
- built-in preset can bind the correct billing adapter without extra manual selection where evidence exists;
- `new-api` success with raw quota fields parses into a valid primary summary without forced currency conversion;
- missing access token or missing integer `userId` returns misconfigured behavior without sending a request;
- HTTP 200 with provider-declared failure body returns query failure;
- HTTP 401/403 maps to authentication failure;
- invalid JSON or missing required primary-summary fields maps to invalid response;
- detailed billing composition may exist without leaking into main-page rendering;
- query failure preserves last-success runtime cache and shows stale/error display in the right surface;
- balance failure does not alter generation health, model refresh, or endpoint probe state;
- provider exact task cost, when returned across one or more provider attempts, is accumulated for the task when possible;
- partial exact task cost is labeled as partial, not total task cost;
- balance delta, when used, is labeled as balance change rather than exact task cost;
- first activation of a profile without cache can trigger one lazy refresh through the same deduplicated path;
- post-execution billing refresh is triggered asynchronously and coalesced by profile;
- logs, errors, and fixtures must not expose API key, access token, authorization header, or full secret-bearing raw payloads.

Final implementation gate for the future execution Loop:

```bash
pnpm validate
```

Manual-only:

- optional Chrome visual review of the provider settings page
- no Photoshop / UXP host proof required unless the slice changes host persistence UX behavior

Live-provider:

- not part of default validation
- opt-in only if the user explicitly approves paid or credentialed proof

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- a provider returns multiple plausible “primary” values and no evidenced rule selects one for the main surface;
- a vendor-specific path needs credential semantics that do not fit the current profile secret model;
- a requested follow-up wants `One API` support in the same mode as `New API` without separate evidenced auth/response rules;
- a requested UI behavior would couple provider health, model discovery, and balance into one overloaded status signal;
- a follow-up wants balance delta to be labeled as exact task cost without provider evidence;
- retries/failover create multiple provider attempts but the proposed task-cost model cannot express whether cost coverage is complete or partial;
- validation confidence depends on live provider money-state proof that the user did not approve.

## Recommended Decision Packet default

If the team must choose one first implementation strategy, use:

- A. Official-provider adapters only.
- B. Official-provider adapters plus `New API` support.
- C. Official-provider adapters plus `New API` plus `One API` support.

Recommendation:

- Start with B.

Reason:

- A is too narrow for the user requirement and misses the most common relay family.
- C is plausible later, but it adds another panel-family contract before V1 proves the narrower path.
- B captures the main near-term need while keeping `One API` and any custom query system as separate future goals.

## Completion report

Future execution report must include:

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

No.
