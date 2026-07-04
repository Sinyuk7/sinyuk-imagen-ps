Status: draft
Authority: current user authorization (2026-07-04)
Owner: `packages/providers` transport layer, with descriptor/catalog touch points
Created: 2026-07-04

# Provider Architecture Audit Remediation

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/AGENTS.md`
- `packages/providers/AGENTS.md`

Historical / input references:

- User-supplied audit report and corrections (three rounds)
- `docs/loops/2026-07-04-openai-compatible-wire-compatibility.md` — completed wire compatibility foundation

Current code references:

- `packages/providers/src/contract/provider.ts` — Provider, ProviderDescriptor, ProviderWireCapability, ImageEditCodec
- `packages/providers/src/contract/capability.ts` — ProviderFamily, ProviderOperation
- `packages/providers/src/contract/config.ts` — ProviderConfig union
- `packages/providers/src/transport/image-endpoint/error-map.ts` — ProviderFailureKind, mapHttpError, mapNetworkError
- `packages/providers/src/transport/image-endpoint/retry.ts` — withRetry, RetryPolicy, RetryOptions
- `packages/providers/src/transport/image-endpoint/paid-retry.ts` — resolvePaidRetryConfig, resolveIdempotencyHeader
- `packages/providers/src/transport/image-endpoint/failover.ts` — executeWithEndpointFailover
- `packages/providers/src/transport/image-endpoint/http.ts` — httpRequest, fetchOnce
- `packages/providers/src/transport/image-endpoint/wire-compatibility.ts` — resolveImageEditCodec, success cache
- `packages/providers/src/transport/image-endpoint/request-shape-classifier.ts` — classifyImageEditRequestShapeRejection
- `packages/providers/src/transport/image-endpoint/build-request.ts` — buildImageEditRequestBody
- `packages/providers/src/providers/image-endpoint/provider.ts` — image-endpoint invoke, codec fallback
- `packages/providers/src/providers/image-endpoint/descriptor.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- `packages/providers/src/providers/gemini-generate-content/descriptor.ts`
- `packages/providers/src/registry/builtins.ts` — registerBuiltins
- `packages/providers/src/bridge/create-dispatch-adapter.ts` — bridge, toJobError
- `packages/application/src/runtime.ts` — createProfileAwareDispatchAdapter
- `packages/providers/tests/` — 17 test files

## Goal

Establish characterization harnesses, freeze recovery contract, fix paid-replay safety, and extract image-endpoint request codec boundary — in three bounded, sequentially-gated loops — without expanding scope to Gemini, prompt-optimize, UI, or a unified codec abstraction.

## Non-goals

- No unified "all codecs own response parser" abstraction.
- No Gemini or prompt-optimize failover or codec refactor.
- No BaseProvider abstract class.
- No generic success cache beyond existing image-edit scope.
- No `apps/app`, `packages/application`, `packages/core-engine` ownership changes.
- No live relay proof, paid provider smoke, or real Photoshop validation.
- No UI wire-dialect override or profile persistence schema changes.
- No change to per-endpoint retry behavior for `429`.

## Governing principles (frozen before any implementation)

### PRINCIPLE 1 — Paid non-idempotent replay safety

```text
429 → same-endpoint bounded retry, governed by paid retry policy alone
      (not by RecoveryDisposition)

415 + classifier confirms alternate codec changes the rejected wire dimension
  → codec fallback allowed

400 / 422 → default no fallback
  → unless provider-specific structured error code proves wire shape rejection

502 / 503 / 504 / timeout / connection_lost / response_lost
  → execution state unknown
  → stop immediately; no automatic replay; no cross-endpoint failover

The only function that decides next action:
decideNextAction(failure, plan, capability, budget) → NextAction

No retry, failover, classifier, or provider may make a second independent recovery decision.
```

### PRINCIPLE 2 — Endpoint failover and codec fallback are mutually exclusive plans

```text
ResolvedAttemptPlan is a flat ordered list of AttemptCandidate:
  { endpointId, codecId, reason }

codec-fallback mode: same endpoint, ordered codecs (one candidate per codec)
endpoint-failover mode: each endpoint gets its own resolved codec (one candidate per endpoint)

Never: every endpoint × every codec.
```

### PRINCIPLE 3 — Characterization before behavior change

```text
characterization test: records current real behavior (no production code change)
conformance test: asserts target behavior (after production code changes)

Do not change production code to make characterization tests pass.
Current-vs-target conflicts are recorded as findings, resolved in behavior-change slices.

Inert test seams (onAttempt callbacks, diagnostic collectors) are allowed in Loop A.
```

## Overall architecture: three sequential loops

```text
Loop A — Provider Characterization Harness
  → records current behavior; zero production behavior change
  → gate: all current behaviors locked in tests

Loop B — Paid Replay Safety and Recovery Contract
  → first behavior-change loop
  → gate: no unknown-execution-state request sent more than once

Loop C — Image-Endpoint Codec Boundary
  → refactor image-endpoint request codec + providerOptions ownership + cache
  → gate: codec owns body, parser shared, cache safe
```

---

# Loop A: Provider Characterization Harness

**Goal:** Lock current wire behavior, attempt sequences, error classification into tests. Zero production runtime behavior change. Inert test seams and type-only annotations are allowed.

**Scope:** `packages/providers/tests/` (new test files + test utilities), `packages/providers/src/transport/image-endpoint/` (read-only except inert seams).

**Forbidden:** Any production behavior change. Any conformance assertion that disagrees with current behavior. A5 (registry exhaustiveness) is deferred to Loop C.

**Final gate:**
```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-request-contract.test.ts \
  packages/providers/tests/multipart-wire-capture.test.ts \
  packages/providers/tests/image-endpoint-response-fixture.test.ts \
  packages/providers/tests/attempt-sequence.test.ts
```
(all characterization tests pass; no production behavior changed; findings list produced)

---

## Slice A0: Architecture Decision Records

Goal:

- Write two short ADRs that freeze the governing principles. No code changes.

Allowed scope:

- `docs/adr/provider-attempt-and-replay-safety.md` (new)
- `docs/adr/provider-failure-and-recovery-disposition.md` (new)

Required outputs:

- **ADR 1:** Provider Attempt and Replay Safety
  - PRINCIPLE 1 (replay safety + single decision function)
  - PRINCIPLE 2 (mutually exclusive plans, flat candidate lists)
  - `ResolvedAttemptPlan` as flat candidate sequence:
    ```ts
    interface AttemptCandidate {
      endpointId: string;
      codecId: ImageEditCodecId;
      reason: 'initial' | 'codec-fallback' | 'endpoint-failover';
    }

    type ResolvedAttemptPlan =
      | { mode: 'single-attempt'; candidates: readonly [AttemptCandidate] }
      | { mode: 'codec-fallback'; candidates: readonly AttemptCandidate[] }
      | { mode: 'endpoint-failover'; candidates: readonly AttemptCandidate[] };
    ```
  - Budget:
    ```ts
    interface DispatchBudget {
      maxSameEndpointRetries: number;
      maxCodecFallbacks: number;
      maxEndpointFailovers: number;
      maxTotalDispatches: number;
    }
    ```
    Only one layer owns 429 retry (paid retry policy). `withRetry` and coordinator do not both retry 429.

- **ADR 2:** Provider Failure and Recovery Disposition
  - `RecoveryDisposition` keeps error fact separate from recovery action:
    ```ts
    interface RecoveryDisposition {
      executionState:
        | 'rejected_before_execution'
        | 'possibly_executed'
        | 'confirmed_completed'
        | 'unknown';

      wireRejection?: {
        kind:
          | 'unsupported_request_content'
          | 'unsupported_media_type'
          | 'semantic_invalid'
          | 'unknown';
        implicatedDimension?: 'body_kind' | 'content_type' | 'image_field' | 'image_reference' | 'unknown';
        detail?: string;
      };

      evidence: readonly RecoveryEvidence[];
    }

    interface RecoveryEvidence {
      source:
        | 'http_status'
        | 'response_header'
        | 'structured_error_code'
        | 'transport_signal'
        | 'body_pattern';

      value?: string;
      ruleId?: string;
      confidence: 'high' | 'medium' | 'low';
    }
    ```
  - `automaticReplay` and `codecFallback` are NOT in `RecoveryDisposition`. They are decided by `decideNextAction()` which combines disposition + plan + capability + budget.
  - `mapHttpError` only sets `executionState` and `evidence` from HTTP status:
    - 415 → `executionState: rejected_before_execution`, `wireRejection: { kind: unsupported_request_content, implicatedDimension: unknown }`, evidence from http_status
    - 422 → `executionState: unknown`, `wireRejection: { kind: semantic_invalid }`
    - 400 → `executionState: unknown`
    - 502/503/504 → `executionState: unknown`
    - timeout/network_error → `executionState: unknown`, evidence from transport_signal
    - 429 → `executionState: rejected_before_execution` (rate-limited before processing)
  - 429 is NOT described as "replay allowed" in RecoveryDisposition. Retry is governed by paid retry policy alone.
  - `automaticReplay` and `codecFallback` are NOT fields on RecoveryDisposition. They are decided by `decideNextAction()`.

Validation:

- quick:
  ```bash
  pnpm check:policy
  ```

Stop rule:

- Stop if any principle cannot be reconciled with existing code behavior without a Decision Packet.

---

## Slice A1: Request Characterization (split into two test files)

Goal:

- Record current HTTP request shape. Describe current behavior — do not assert target behavior.

Allowed scope:

- `packages/providers/tests/image-endpoint-request-contract.test.ts` (new)
- `packages/providers/tests/image-endpoint-transport-request.test.ts` (new)

Required outputs:

- **Request codec contract tests** (`image-endpoint-request-contract.test.ts`):
  - per codec: body type (JSON object vs FormData)
  - per codec: field names (`image[]` vs `image`)
  - per codec: canonical field presence (model, prompt, size, etc.)
  - canonical output fields currently written into body — record which fields
  - `providerOptions` passthrough behavior — record current merging
  - This file does NOT assert auth headers, Content-Type final value, or resolved URL

- **Final transport request tests** (`image-endpoint-transport-request.test.ts`):
  - resolved URL (base + path)
  - auth header present, value NOT asserted
  - content-type presence (not exact value)
  - extraHeaders merge behavior
  - body bytes record (for regression comparison)

- If current behavior conflicts with target principles from ADR A0, log as characterization findings — do not fix production code

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-request-contract.test.ts \
  packages/providers/tests/image-endpoint-transport-request.test.ts
```

Report requirement:

- Matched test files: N
- Executed: M / passed: P / failed: F / skipped: S

Stop rule:

- Stop if any actual wire shape contradicts documented expectations in a way that requires a Decision Packet.

---

## Slice A2: Multipart Wire Capture (Node)

Goal:

- Capture real FormData body parts via local HTTP server in Node runtime.

Allowed scope:

- `packages/providers/tests/multipart-wire-capture.test.ts` (new)
- local test server utility under `packages/providers/tests/`

Required outputs:

- Local HTTP server test utility that receives actual POST bodies
- **Normalized part assertions** (not raw byte snapshots):
  - extract boundary from Content-Type header
  - parse body using that boundary
  - for each part: `{ name, filename, mimeType, size, sha256, order }`
  - verify all parts have `Content-Disposition: form-data`
  - verify parts for the same field share the same `name`
- Verify final Content-Type contains boundary and boundary matches body delimiter
- **Explicit disclaimer:** Node FormData only. UXP may differ. Do not claim UXP transport verified.

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/multipart-wire-capture.test.ts
```

Report requirement:

- Matched test files: N / Executed: M / passed: P / failed: F / skipped: S

Stop rule:

- Stop if Node `FormData` is unavailable in test runtime.

---

## Slice A3: Image-Endpoint Response Fixtures

Goal:

- Add desensitized response fixtures for image-endpoint only.

Allowed scope:

- `packages/providers/tests/` (new fixture data + test files)

Required outputs:

- image-endpoint response fixtures:
  - success: `data[].url`
  - success: `data[].b64_json`
  - empty `data` array
  - missing `data` field
  - error envelope `{ error: { message } }`
- HTTP malformed JSON / decode failure (in `httpRequest` layer)
- `parseResponse` invalid input: non-object, missing data, missing url+b64_json
- Chat-image / Gemini / prompt-optimize fixtures: NOT in this loop

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-response-fixture.test.ts
```

Report requirement:

- Matched test files: N / Executed: M / passed: P / failed: F / skipped: S

Stop rule:

- Stop if any fixture cannot be constructed without real API keys or live provider traffic.

---

## Slice A4: Current Attempt-Sequence Characterization

Goal:

- Record actual current attempt sequences. Describe current behavior — including unsafe failover that will be changed in Loop B.

Allowed scope:

- `packages/providers/tests/attempt-sequence.test.ts` (new)
- Inert test seam: `onAttempt` callback or existing logger/diagnostic collector in `failover.ts` or `provider.ts` (behavior-preserving instrumentation only)
- `packages/providers/src/providers/image-endpoint/provider.ts` (read-only, except inert seam)
- `packages/providers/src/transport/image-endpoint/failover.ts` (read-only, except inert seam)

Required outputs:

- Fake executor that records each attempt as:
  - `endpointId`, `codecId`, `attemptIndex`
  - `reason` (initial | retry | codec-fallback | endpoint-failover)
  - `failureClassification` (kind + statusCode)
  - `nextDecision` (stop | retry-same | codec-fallback | failover-next)
- **Current behavior** assertions:
  - single endpoint + codec fallback: first codec rejected, second succeeds
  - multi endpoint + failover: codec fallback guard fires
  - 429: retry on same endpoint (bounded)
  - 502/503/504 + paid + no idempotency: current behavior MAY try next endpoint — record accurately
  - timeout: stop (current)
  - network_error + paid + no idempotency: current behavior MAY try next endpoint — record accurately
  - network_error + paid + idempotency: tries next endpoint
- Characterization findings list: where current behavior conflicts with ADR A0 principles (for Loop B to fix)

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/attempt-sequence.test.ts
```

Report requirement:

- Matched test files: N / Executed: M / passed: P / failed: F / skipped: S
- List of characterization findings

Stop rule:

- Stop if current behavior cannot be observed without modifying production code beyond inert test seams.

---

# Loop B: Paid Replay Safety and Recovery Contract

**Prerequisite:** Loop A final gate pass.

**Goal:** Add RecoveryDisposition, introduce AttemptPlan/Coordinator, stop unsafe paid failover, refactor wire rejection classifier.

**Scope:** `packages/providers/src/transport/image-endpoint/error-map.ts`, `retry.ts`, `paid-retry.ts`, `failover.ts`, `http.ts`, `request-shape-classifier.ts`, `packages/providers/src/providers/image-endpoint/provider.ts`.

**Forbidden:** Any change to chat-image, gemini, or prompt-optimize. Any change to per-endpoint 429 retry policy.

**Final gate:**
```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/error-map.test.ts \
  packages/providers/tests/failover.test.ts \
  packages/providers/tests/paid-retry.test.ts \
  packages/providers/tests/retry.test.ts \
  packages/providers/tests/attempt-sequence.test.ts \
  packages/providers/tests/image-endpoint-provider.test.ts \
  packages/providers/tests/request-shape-classifier.test.ts
```

---

## Slice B1: RecoveryDisposition in mapHttpError

Goal:

- Add `recovery?: RecoveryDisposition` to `ProviderInvokeError`. Populate from `mapHttpError`. No behavior change yet.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/error-map.ts`

Required outputs:

- `RecoveryDisposition` and `RecoveryEvidence` types (exact shape from ADR A0)
- `mapHttpError` populates `recovery`:
  - 415 → `executionState: rejected_before_execution`, `wireRejection: { kind: unsupported_request_content, implicatedDimension: unknown }`, evidence: `[{ source: http_status, value: "415", confidence: high }]`
  - 422 → `executionState: unknown`, `wireRejection: { kind: semantic_invalid }`, evidence: `[{ source: http_status, value: "422", confidence: medium }]`
  - 400 → `executionState: unknown`, evidence: `[{ source: http_status, value: "400", confidence: low }]`
  - 502/503/504 → `executionState: unknown`, evidence: `[{ source: http_status, value: "5xx", confidence: high }]`
  - timeout → `executionState: unknown`, evidence: `[{ source: transport_signal, confidence: high }]`
  - network_error → `executionState: unknown`, evidence: `[{ source: transport_signal, confidence: high }]`
  - 429 → `executionState: rejected_before_execution`, evidence: `[{ source: http_status, value: "429", confidence: high }]`
  - Does NOT set `codecFallback` or `automaticReplay` — those are decided by `decideNextAction`
- Existing `kind` values unchanged
- Existing retry/failover tests must still pass

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/error-map.test.ts \
  packages/providers/tests/request-shape-classifier.test.ts
```

Stop rule:

- Stop if adding `recovery` changes any existing retry or failover test assertion.

---

## Slice B2: ResolvedAttemptPlan and AttemptCoordinator

Goal:

- Replace nested failover+codec loops with `ResolvedAttemptPlan` executed by a coordinator.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/failover.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`

Required outputs:

- `resolveAttemptPlan(args): ResolvedAttemptPlan`:
  - `failoverEnabled && endpoints.length > 1` → each endpoint gets its own resolved codec (from descriptor or cache) → `endpoint-failover` plan
  - otherwise → `codec-fallback` plan (one endpoint, ordered codecs)
  - no recovery strategy → `single-attempt`
- `executeAttemptPlan(plan, context): Promise<Result>`:
  - iterates candidates sequentially
  - on each failure, calls `decideNextAction()` (Slice B3)
  - records attempt metadata
  - stops on success or `NextAction.type === "stop"`
- Provider invoke delegates to `resolveAttemptPlan` + `executeAttemptPlan`
- `executeWithEndpointFailover` still exists for non-image-edit and model discovery

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/attempt-sequence.test.ts \
  packages/providers/tests/image-endpoint-provider.test.ts
```

Stop rule:

- Stop if the plan cannot express current behavior without regression.

---

## Slice B3: decideNextAction — Single Recovery Decision Function

Goal:

- Implement the single function that decides next action. No retry, failover, classifier, or provider may make independent recovery decisions.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/failover.ts` (new function)
- `packages/providers/src/transport/image-endpoint/retry.ts` (read-only: retry policy consults decideNextAction)
- `packages/providers/src/transport/image-endpoint/paid-retry.ts` (read-only)

Required outputs:

- `decideNextAction(input): NextAction`:
  ```ts
  interface DecideInput {
    failure: ProviderInvokeError;
    plan: ResolvedAttemptPlan;
    planIndex: number;
    capability: {
      idempotencySupported: boolean;
      idempotencyScope?: 'same-endpoint' | 'shared-domain' | 'unknown';
    };
    budget: DispatchBudget;
    retryPolicy: RetryPolicy;
  }

  type NextAction =
    | { type: 'stop'; reason: string }
    | { type: 'retry-same-endpoint'; delayMs?: number }
    | { type: 'try-next-codec' }
    | { type: 'try-next-endpoint' };
  ```
- Decision rules (in order):
  1. budget exhausted → `stop` (budget_exhausted)
  2. `recovery.executionState === 'unknown'` → `stop` (unknown_execution_state)
  3. `recovery.wireRejection` present + classifier confirms alternate codec changes the rejected dimension + plan has more codecs → `try-next-codec`
  4. 429 + plan has retry budget remaining → `retry-same-endpoint`
  5. plan has more endpoints + idempotency scope covers next endpoint → `try-next-endpoint`
  6. otherwise → `stop`
- `transport_signal` evidence ONLY upgrades `executionState` from `unknown` to `rejected_before_execution` (if signal proves request not processed). It does NOT authorize codec fallback.
- `body_pattern` evidence alone (generic prose, no ruleId) does NOT authorize codec fallback. Only: HTTP 415 + dimension change, structured error code, or fixture-backed exact rule.
- 429 retry is governed by paid retry policy. `decideNextAction` delegates delay calculation to policy, not making its own retry loop.

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/failover.test.ts \
  packages/providers/tests/retry.test.ts
```

Stop rule:

- Stop if any existing test relies on a recovery path that cannot be expressed through `decideNextAction`.

---

## Slice B4: DispatchBudget and AttemptLedger

Goal:

- Add `DispatchBudget` with per-dimension caps. `AttemptLedger` is the safety net, consumed by every real HTTP dispatch.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/http.ts`
- `packages/providers/src/transport/image-endpoint/failover.ts`

Required outputs:

- `DispatchBudget`:
  ```ts
  interface DispatchBudget {
    readonly maxSameEndpointRetries: number;
    readonly maxCodecFallbacks: number;
    readonly maxEndpointFailovers: number;
    readonly maxTotalDispatches: number;
  }
  ```
- `AttemptLedger`:
  ```ts
  interface AttemptLedger {
    consume(kind: 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover'): void;
    readonly exhausted: boolean;
    readonly totalUsed: number;
  }
  ```
- Budget derived from plan:
  - `single-attempt`: maxSameEndpointRetries = retryPolicy.maxRetries, maxTotalDispatches = 1 + maxRetries
  - `codec-fallback`: maxCodecFallbacks = codecs.length - 1, maxTotalDispatches = codecs.length + maxRetries
  - `endpoint-failover`: maxEndpointFailovers = endpoints.length - 1, maxTotalDispatches = endpoints.length + maxRetries
- Every `fetchOnce` call consumes ledger before HTTP dispatch; throws if exhausted
- `withRetry` also consumes from same ledger for each retry attempt
- Transport retry (429) still has `maxSameEndpointRetries` sub-budget
- Ledger NOT consumed by: model discovery, balance query, test connection
- Only `withRetry` owns 429 retry. `decideNextAction` for 429 returns `retry-same-endpoint` which delegates to `withRetry`.

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/failover.test.ts \
  packages/providers/tests/image-endpoint-provider.test.ts
```

Stop rule:

- Stop if ledger semantics conflict with `withRetry` internal counting.

---

## Slice B5: Stop Unsafe Paid Failover

Goal:

- Apply `decideNextAction` and stop automatic cross-endpoint failover when execution state is unknown. First slice that changes production behavior.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/failover.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`

Required outputs:

- `executeAttemptPlan` uses `decideNextAction` as the sole decision function:
  - `stop` → throw or return with partial result
  - `retry-same-endpoint` → retry with delay (delegated to retry policy)
  - `try-next-codec` → build request with next codec, dispatch
  - `try-next-endpoint` → switch endpoint, dispatch
- Endpoint cooldown: still record failures that cause stop
- Log warn-level when failover/fallback suppressed
- 429 behavior unchanged (delegated to retry policy)
- Update characterization tests from Loop A to reflect new safe behavior

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/failover.test.ts \
  packages/providers/tests/paid-retry.test.ts \
  packages/providers/tests/retry.test.ts \
  packages/providers/tests/attempt-sequence.test.ts
```

Report requirement:

- Matched test files: N / Executed: M / passed: P / failed: F / skipped: S

Stop rule:

- Stop and produce a Decision Packet if this breaks an intentional product requirement.

---

## Slice B6: Structured Wire Rejection Classifier

Goal:

- Refactor classifier to use structured evidence from `RecoveryDisposition`. Generic prose never authorizes fallback alone.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/request-shape-classifier.ts`

Required outputs:

- Codec declares `RequestWireSignature`:
  ```ts
  interface RequestWireSignature {
    bodyKind: 'multipart' | 'json';
    contentTypeKind: 'multipart/form-data' | 'application/json';
    imageFieldMode?: 'image' | 'image[]';
    imageReferenceMode?: 'binary' | 'reference';
  }
  ```
- Classifier uses `recovery.wireRejection` + codec `RequestWireSignature`:
  1. 415 + alternate codec's signature changes the `implicatedDimension` → eligible
  2. `evidence.source: structured_error_code` + known code → eligible if code indicates wire shape
  3. `evidence.source: body_pattern` + `ruleId` referencing fixture-backed exact rule → eligible
  4. `evidence.source: transport_signal` proving request not processed → ONLY upgrades executionState to `rejected_before_execution`, NEVER authorizes codec fallback
  5. Generic prose (`body_pattern` without `ruleId`) → NOT eligible. Used only for deny fallback, diagnostic enrichment, or confidence downgrade.
- Deny terms and accepted-work signals remain as conservative safety net
- Output `ImageEditRequestShapeRejection` shape preserved for existing consumers

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/request-shape-classifier.test.ts
```

Stop rule:

- Stop and produce Decision Packet if the only available compatibility signal for a known gateway is generic prose without structured error code.

---

# Loop C: Image-Endpoint Codec Boundary

**Prerequisite:** Loop B final gate pass.

**Goal:** Extract image-edit request codecs, enforce providerOptions ownership, fix cache, add exhaustiveness, create docs.

**Scope:** `packages/providers/src/transport/image-endpoint/build-request.ts`, new codec files, `wire-compatibility.ts`, `packages/providers/src/providers/image-endpoint/provider.ts`, `packages/providers/src/registry/builtins.ts`, `packages/providers/src/index.ts`, `packages/providers/ARCHITECTURE.md` (new), `packages/providers/TESTING.md` (new).

**Forbidden:** Any change to chat-image, gemini, or prompt-optimize. Any change to response parser. UXP-specific production code.

**Final gate:**
```bash
pnpm validate
```

---

## Slice C1: Request Codec Extraction

Goal:

- Extract image-edit request codecs. Codec owns body + headers. Provider/operation owns path, method, parser, auth.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/build-request.ts`
- new files: `packages/providers/src/transport/image-endpoint/codec-multipart-bracket.ts`, `codec-multipart-plain.ts`, `codec-json-reference.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`

Required outputs:

- `ImageEditRequestCodec` interface:
  ```ts
  interface ImageEditRequestCodecContext {
    readonly model: string;
    readonly providerOptions?: Readonly<Record<string, unknown>>;
  }

  interface ImageEditRequestCodec {
    readonly id: ImageEditCodecId;
    readonly wireSignature: RequestWireSignature;
    readonly reservedProviderOptionPaths: readonly string[];

    buildBody(request: CanonicalImageJobRequest, context: ImageEditRequestCodecContext): ProviderHttpBody;
    buildHeaders?(context: ImageEditRequestCodecContext): Readonly<Record<string, string>>;
    classifyRejection?(failure: ProviderInvokeError): WireRejectionEvidence | null;
  }

  type ProviderHttpBody = Record<string, unknown> | FormData | Uint8Array | string;
  ```
- Codec does NOT own: path (`/v1/images/edits`), HTTP method (`POST`), auth headers, response parser, retry policy
- Provider invoke owns path + method + auth + parser
- Three codec implementations: `multipartBracketCodec`, `multipartPlainCodec`, `jsonReferenceCodec`
- `resolveImageEditCodec` returns a codec instance, not a string

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-provider.test.ts \
  packages/providers/tests/image-endpoint-request-contract.test.ts
```

Stop rule:

- Stop if extracting codecs changes any existing wire behavior.

---

## Slice C2: ProviderOptions Ownership

Goal:

- Enforce codec-owned providerOptions reservation. Canonical fields write last; unknown keys produce diagnostics, not silent passthrough.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/build-request.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`

Required outputs:

- Each codec declares `reservedProviderOptionPaths`
- Canonical output fields (`size`, `quality`, `output_format`, etc.) are written AFTER providerOptions merge — they always win
- Codec-owned reserved fields (`image[]`, `image`, multipart field names) are NEVER overridable by providerOptions
- Unknown providerOptions keys produce non-blocking diagnostics (ignored/rejected)
- No unbounded `deepMerge` — only known fields are merged
- Build-time diagnostics are collected and attached to `BuiltHttpRequest` or `ProviderInvokeResult`

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-provider.test.ts \
  packages/providers/tests/image-endpoint-request-contract.test.ts
```

Stop rule:

- Stop if providerOptions enforcement changes behavior that Loop A characterization recorded as intentional.

---

## Slice C3: Conditional Cache Eviction

Goal:

- Compare-and-delete: only evict cached codec if current value still matches the failed codec.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/wire-compatibility.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`

Required outputs:

- `evictIfMatches(cacheKey: string, failedCodecId: ImageEditCodecId): void`
  - Reads current cache value for `cacheKey`
  - Only deletes if `current.codec === failedCodecId`
- Provider invoke: when cached codec gets high-confidence wire rejection:
  1. `evictIfMatches(cacheKey, failedCodecId)`
  2. Then try alternate codec
  3. If alternate succeeds, remember new codec
- Only evict when `resolutionSource === 'cache'`. Default codec rejection is not cache invalidation.
- No tombstone, no `invalidatedAt`
- `resetImageEditCompatibilityCacheForTesting` clears all entries
- No change to TTL or max entries

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-wire-compatibility.test.ts
```

Stop rule:

- Stop if concurrent invoke patterns (async within single event loop) are common enough that compare-and-delete is insufficient. Review with team.

---

## Slice C4: Registry and Type Exhaustiveness

Goal:

- Add compile-time exhaustiveness for builtin Provider IDs. Separate: builtin registry ≠ ProviderFamily union ≠ catalog Provider ID.

Allowed scope:

- `packages/providers/src/registry/builtins.ts`
- `packages/providers/src/index.ts`
- `packages/providers/tests/registry-exports.test.ts`

Required outputs:

- Typed builtins map:
  ```ts
  type BuiltinProviderId = 'image-endpoint' | 'chat-image' | 'gemini-generate-content' | 'prompt-optimize';

  const builtins = {
    'image-endpoint': createImageEndpointProvider,
    'chat-image': createChatImageProvider,
    'gemini-generate-content': createGeminiGenerateContentProvider,
    'prompt-optimize': createPromptOptimizeProvider,
  } satisfies Record<BuiltinProviderId, () => Provider>;
  ```
- Exhaustiveness tests (three independent checks):
  1. Every `BuiltinProviderId` → factory in builtins map → public export
  2. Every `ProviderFamily` → at least one `ProviderDescriptor.id`
  3. Image catalog provider IDs (separate): only providers declaring catalog capability
- Do NOT require `prompt-optimize` or `mock` in catalog exhaustiveness

Test command:

```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/registry-exports.test.ts
```

Stop rule:

- Stop if TS version lacks `satisfies` or needed type features.

---

## Slice C5: Provider Architecture and Testing Documentation

Goal:

- Create minimal, authoritative provider documentation. Root doc reduces to links.

Allowed scope:

- `packages/providers/ARCHITECTURE.md` (new)
- `packages/providers/TESTING.md` (new)
- `docs/ENGINEERING_CONTEXT.md` (reduce lines 119-148)
- `scripts/policy/docs.mjs` (amend if needed)

Required outputs:

- `packages/providers/ARCHITECTURE.md`:
  - Provider family / codec / capability decision guide
  - Retry / fallback / failover safety policy
  - `RecoveryDisposition` + `decideNextAction` contract
  - `AttemptPlan` + `DispatchBudget` + `AttemptLedger`
  - Add-builtin-provider checklist
  - Authority, scope, non-goals, last verified date

- `packages/providers/TESTING.md`:
  - Request contract characterization
  - Multipart wire capture
  - Attempt sequence harness
  - Response fixture conventions
  - UXP probe conditions (explicitly: Node != UXP)
  - Authority, scope, non-goals, last verified date

- `docs/ENGINEERING_CONTEXT.md`: trim lines 119-148 to summary + links

Validation:

```bash
pnpm check:policy
```

Stop rule:

- Stop if `pnpm check:policy` rejects new doc files.

---

## Slice C6: UXP FormData Probe Handoff

Goal:

- Write a follow-up Loop document, not a dead placeholder test file. No production code change.

Allowed scope:

- `docs/loops/YYYY-MM-DD-uxp-formdata-wire-probe.md` (new)

Required outputs:

- Loop document with:
  - Goal: verify UXP FormData serialization via local echo server
  - Required: real Photoshop + UXP Developer Tool
  - Opt-in via `pnpm test:release` + dedicated env variable
  - Assertions: Content-Type with boundary, part name/filename/MIME, body bytes
  - Documented known difference: Node vs UXP boundary generation, filename inference
- Deferred until Loop C complete; not part of this remediation
- No `describe.skip` placeholder file created

Validation:

```bash
pnpm check:policy
```

Stop rule:

- None. Documentation-only slice.

---

## Validation Summary

### Quick
```bash
pnpm check:policy
```

### Loop A final gate
```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/image-endpoint-request-contract.test.ts \
  packages/providers/tests/image-endpoint-transport-request.test.ts \
  packages/providers/tests/multipart-wire-capture.test.ts \
  packages/providers/tests/image-endpoint-response-fixture.test.ts \
  packages/providers/tests/attempt-sequence.test.ts
```

### Loop B final gate
```bash
pnpm --filter @imagen-ps/providers test -- \
  packages/providers/tests/error-map.test.ts \
  packages/providers/tests/failover.test.ts \
  packages/providers/tests/paid-retry.test.ts \
  packages/providers/tests/retry.test.ts \
  packages/providers/tests/attempt-sequence.test.ts \
  packages/providers/tests/image-endpoint-provider.test.ts \
  packages/providers/tests/request-shape-classifier.test.ts
```

### Loop C final gate
```bash
pnpm validate
```

### Manual-only
- None required.

### Live-provider
- Not part of this remediation. Separate opt-in release probes may be proposed after Loop C completes.

---

## Decision Packet triggers

- Any ADR principle cannot be reconciled with existing code.
- Characterization reveals current behavior that contradicts documented expectations irreconcilably.
- `RecoveryDisposition` changes existing retry/failover test assertions.
- Paid-replay safety change breaks intentional product requirement.
- Only compatibility signal for a known gateway is generic prose.
- Concurrent invoke patterns make compare-and-delete cache insufficient.
- `pnpm check:policy` rejects new doc files.

---

## Completion report

After executing a slice, report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence (matched files / executed / passed / failed / skipped):
- Boundary evidence:
- Characterization findings (Loop A only):
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

---

## Memory note candidate

`yes: architecture` for ADRs (A0) and canonical docs (C5).

`yes: decision` for `decideNextAction` contract (B3) and replay safety policy (B5).

`no` for harness slices (A1-A4), codec extraction (C1-C2), cache fix (C3), exhaustiveness (C4), UXP handoff (C6).
