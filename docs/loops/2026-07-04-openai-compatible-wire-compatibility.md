Status: draft
Authority: current user authorization (2026-07-04)
Owner: `packages/providers` wire-compatibility slices with descriptor touch points
Created: 2026-07-04

# OpenAI-Compatible Wire Compatibility Foundation

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/AGENTS.md`
- `packages/providers/AGENTS.md`
- `packages/application/AGENTS.md`

Historical / design references:

- Current user-supplied analysis document: `OpenAI-Compatible 请求兼容机制 Current-State Audit & Architecture`
- `docs/loops/2026-07-03-main-page-status-readiness.md` for current Loop formatting only, not for provider transport decisions

Current code references:

- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/index.ts`
- `packages/providers/src/providers/image-endpoint/descriptor.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- `packages/providers/src/transport/image-endpoint/build-request.ts`
- `packages/providers/src/transport/image-endpoint/error-map.ts`
- `packages/providers/src/transport/image-endpoint/paid-retry.ts`
- `packages/providers/src/transport/image-endpoint/retry.ts`
- `packages/providers/src/transport/image-endpoint/parse-response.ts`
- `packages/providers/tests/image-endpoint-provider.test.ts`
- `packages/providers/tests/paid-retry.test.ts`
- `packages/providers/tests/retry.test.ts`

## Goal

Establish a provider-owned, mock-testable OpenAI-compatible wire compatibility foundation for `image-endpoint` `image_edit` requests, so the app can adapt to relay wire-dialect differences without relay/domain/model hardcoding, while preserving the current default behavior and keeping automatic fallback strictly bounded and non-multiplicative.

## Non-goals

- No relay-specific hardcoding by provider name, model name, domain, or substring rules.
- No generic HTTP DSL, JSON template system, or declarative transport scripting engine.
- No SSE implementation or response-parser fallback in this Loop.
- No chat-completions request codec expansion beyond optional static declaration of current JSON response behavior.
- No broad cross-endpoint codec learning. First-loop cache is connection/config scoped, not per-endpoint candidate scoped.
- No `apps/app`, `packages/application`, `packages/core-engine`, or host adapter ownership changes unless a narrow descriptor consumer update is proven necessary.
- No provider profile persistence schema changes, manual override UI, or durable compatibility cache.
- No automatic fallback on `500`, `429`, `502`, `503`, `504`, `timeout`, `network_error`, or after any response shape that implies the request may already have been processed.
- No "full failover with codec A, then full failover with codec B" sequence.
- No live relay proof, paid provider smoke, or real Photoshop / UXP validation.
- No claim that one failing relay proves a new global default codec.

## Scope

Allowed implementation scope:

- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/index.ts`
- `packages/providers/src/providers/image-endpoint/descriptor.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- `packages/providers/src/transport/image-endpoint/build-request.ts`
- new focused files under `packages/providers/src/transport/image-endpoint/`
- focused provider tests under `packages/providers/tests/`
- `docs/ENGINEERING_CONTEXT.md` only if implementation produces durable contract knowledge
- `docs/TESTING.md` only if validation guidance materially changes

Forbidden scope:

- `apps/app/**`
- `packages/application/**` except read-only inspection of descriptor consumers
- `packages/core-engine/**`
- provider discovery behavior changes unrelated to wire dialect selection
- endpoint health, failover ordering, idempotency-key derivation, or billing cooldown semantic changes
- broad error taxonomy rewrites unrelated to request-shape fallback gating
- broad docs cleanup or unrelated architecture refactors

## Ownership boundary

- `packages/providers` owns provider transport capability declarations, request builder variants, response codec declarations, compatibility cache, safe fallback gating, and provider transport logs.
- `packages/application` may consume descriptor data only if the new contract becomes observable outside provider internals; it must not own wire dialect resolution or transport retry behavior.
- `packages/core-engine` remains unaware of request codec selection, fallback chains, and relay compatibility semantics.
- `apps/app` remains unaware of wire dialect details and must not branch on transport codec names.

## Baseline

Known current-state facts:

- `image-endpoint` routes `text_to_image` to `/v1/images/generations` and `image_edit` to `/v1/images/edits` inside `packages/providers/src/providers/image-endpoint/provider.ts`.
- `image-endpoint` currently chooses edit request body mode with local `shouldUseMultipartEditBody()` logic and a hardcoded two-state branch: JSON-ref or multipart-inline.
- `buildEditMultipartBody()` currently appends image inputs under hardcoded multipart key `image[]`.
- `parseResponse()` for image endpoints accepts JSON only and expects `data[].url` or `data[].b64_json`.
- `buildEditRequestBody()` already supports inline base64 as `data:` URL JSON references; JSON-ref is not limited to URL / file-id inputs.
- `chat-image` already has a separate request/response path and should not be used as justification to widen the first request-fallback slice.
- `ProviderTransportCapability` currently expresses idempotency and paid retry policy only; there is no wire dialect declaration.
- The provider layer already separates model capability from transport behavior. That boundary should stay intact.
- Paid retry semantics already classify ambiguous failures conservatively and must remain orthogonal to request-dialect fallback.
- `image-endpoint.invoke()` constructs one request body before entering `executeWithEndpointFailover()`. Under the current boundary, one logical invoke cannot learn a different codec per endpoint candidate.
- `415` is not currently mapped to `request_invalid`; changing that mapping will also stop endpoint failover for that class of failure.

Baseline validation before implementation claims:

```bash
pnpm check:policy
pnpm --filter @imagen-ps/providers test -- image-endpoint-provider retry paid-retry
```

If baseline validation fails before implementation:

- report whether the failure is pre-existing or caused by local branch drift;
- do not use a failing baseline to justify widening the Loop scope;
- produce a Decision Packet if the failure blocks transport attribution.

## Target contract

The first Loop does not try to solve every OpenAI-compatible difference. It introduces one stable abstraction boundary: provider-owned image-edit wire dialect selection under `descriptor.transport.wire`.

Required first-loop properties:

- static provider descriptor declaration of supported image-edit codecs and default order;
- runtime strategy resolution with explicit precedence;
- runtime-only success cache;
- connection/config-scoped compatibility fingerprint, not pseudo per-endpoint precision;
- at most one endpoint-local automatic request fallback;
- fallback only for evidenced request-shape rejection on `400`, `415`, or `422`;
- resolved strategy logging;
- no relay/domain/model special cases;
- current default behavior preserved unless a safe, declared fallback is explicitly triggered.

Recommended first-loop contract shape:

```ts
export type ImageEditCodec =
  | 'multipart-bracket'
  | 'multipart-plain'
  | 'json-reference';

export type ProviderResponseCodec = 'json';

export interface ProviderWireCapability {
  readonly supportedEditCodecs?: readonly ImageEditCodec[];
  readonly defaultEditCodecOrder?: readonly ImageEditCodec[];
  readonly responseCodecs?: readonly ProviderResponseCodec[];
}

export interface ProviderTransportCapability {
  readonly idempotency?: 'supported' | 'unsupported';
  readonly retryPolicy?: { readonly maxRetries: number; readonly baseDelayMs: number; readonly factor: number };
  readonly wire?: ProviderWireCapability;
}
```

Rules:

- `multipart-bracket` maps to the current `image[]` field name and stays the conservative default.
- `multipart-plain` maps to repeated `image` multipart fields.
- `json-reference` maps to the existing JSON edit body builder for URL / file-id / data-url style references.
- `multipart-indexed` is not part of the first implementation unless a harness-backed requirement appears during execution together with builder, resolver, tests, and logs.
- `responseCodecs` may declare current JSON-only behavior now so the contract can grow later without reshaping the descriptor again.
- The first execution loop must not infer codec from provider family name, model substring, endpoint domain, or upstream error prose alone.

Runtime strategy precedence:

1. explicit future override hook, if one is ever formally added by a later Loop;
2. runtime success cache for the current compatibility fingerprint;
3. `descriptor.transport.wire.defaultEditCodecOrder`;
4. conservative built-in default that preserves today’s behavior.

Resolver result shape:

```ts
resolveImageEditCodec(context): {
  codec: ImageEditCodec;
  source: 'cache' | 'descriptor-default' | 'legacy-default';
}
```

Compatibility fingerprint:

- Scope: connection/config level. It MUST NOT pretend to be per-endpoint learning while `invoke()` still builds one body before failover.
- Serialization: stable key-sorted serialization, then synchronous digest.
- Header handling: log only normalized header names plus digest; never log raw values.
- Digest algorithm: synchronous repository-local digest is acceptable in the first Loop; prefix the emitted value to identify the algorithm.

Recommended fingerprint shape:

```ts
{
  providerId,
  providerFamily,
  operation,
  targetPath,
  model,
  connection: {
    selectionMode,
    failoverEnabled,
    preferredEndpointId,
    endpoints: [{ id, url, enabled }],
    extraHeaderNames,
    extraHeadersFingerprint,
  },
  requestShape: {
    imageCountMode,
    hasMask,
    imageReferenceKinds,
    maskReferenceKind,
  },
}
```

Where:

- `imageCountMode` is at least `single-image` or `multi-image`;
- `imageReferenceKinds` distinguishes at least `inline-data`, `url`, `fileId`, and `mixed`;
- `extraHeaderNames` are lower-cased and sorted;
- `extraHeadersFingerprint` is derived from canonicalized `key:value` pairs but only the digest is retained.

Success cache rules:

- module-level, process-local, non-persistent;
- success-only, no negative cache;
- fixed TTL plus fixed max entry count;
- hit may refresh `lastUsedAt`; `expiresAt` semantics must be explicit and stable;
- cache write requires all of:
  - HTTP request success;
  - response parse success;
  - normalized result accepted as valid provider output.
- `2xx` alone is insufficient; parse failure or invalid normalized result must not populate the cache.

Recommended cache value:

```ts
{
  codec,
  createdAt,
  lastUsedAt,
  expiresAt,
}
```

Fallback rules:

- Maximum one alternate codec attempt per logical request.
- Only for `image_edit`.
- Automatic fallback is allowed only when:
  - exactly one endpoint is enabled, or `failoverEnabled === false`;
  - the first failure is a request-shape rejection on `400`, `415`, or `422`;
  - the classifier confirms body / multipart / media-type / file-field rejection;
  - no accepted-work signal is present.
- Automatic fallback is forbidden when:
  - more than one endpoint is eligible for failover;
  - the failure is ambiguous;
  - the request has already entered endpoint failover;
  - the retry/failover layer would multiply attempts.
- `415` is a strong compatibility signal and may pass without extra deny-word confirmation, but still requires the no-accepted-work check.
- `400/422` require allowlist evidence and default-deny behavior.
- Every fallback decision must emit a structured warn log with:
  - initial codec;
  - fallback codec;
  - fallback reason;
  - fallback attempt count;
  - whether fallback was disabled because of multiple endpoints.

Request-shape rejection classifier:

- Allowlist-first. If evidence is unclear, fallback is denied.
- Acceptable shape/media terms include:
  - `multipart`
  - `form-data`
  - `content-type`
  - `media type`
  - `unsupported media`
  - `boundary`
  - `image[]`
  - `image field`
  - `file field`
  - `expected file`
  - `expected io.reader`
- Deny on business/input terms such as:
  - `prompt`
  - `model`
  - `size`
  - `quality`
  - `quota`
  - `billing`
  - `auth`
  - `token`
  - `permission`
- Accepted-work signals include evidence such as:
  - `task_id`
  - `generation_id`
  - `job_id`
  - queued / processing / running status
  - non-empty generated data payload
- `request_id` alone is not accepted-work evidence.

## Slices

## Slice 0: Freeze the descriptor and boundary contract

Goal:

- Turn the wire-compatibility foundation into explicit Loop authority before transport refactors start.

Allowed scope:

- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/index.ts`
- descriptor reads under `packages/providers/src/providers/*/descriptor.ts`
- focused tests under `packages/providers/tests/`

Required outputs:

- define the first-loop `ImageEditCodec` set;
- define the first-loop `descriptor.transport.wire` shape and response-codec placeholder shape;
- confirm that `packages/providers` remains the sole owner of strategy resolution and cache;
- confirm that chat-image changes are declaration-only in this Loop;
- confirm that `multipart-indexed` is deferred unless new evidence appears.

Validation:

- quick:
  ```bash
  pnpm check:policy
  ```
- per-slice:
  ```bash
  pnpm --filter @imagen-ps/providers test -- registry-exports
  ```

Stop rule:

- Stop and produce a Decision Packet if the contract cannot be expressed without leaking strategy semantics into `packages/application` or `apps/app`.

## Slice 1: Introduce request-dialect builders and compatibility resolution

Goal:

- Replace the current implicit edit body mode branch with explicit codec-aware builder selection and runtime resolution.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/build-request.ts`
- new focused files under `packages/providers/src/transport/image-endpoint/`
- focused provider tests under `packages/providers/tests/`

Required outputs:

- retain the current generation builder unchanged in behavior;
- support `multipart-bracket`, `multipart-plain`, and `json-reference` as explicit edit codecs;
- move codec selection into a dedicated compatibility module instead of inline provider branching;
- add runtime-only success cache keyed by compatibility fingerprint;
- expose a test reset helper for the cache;
- add stable serialization plus synchronous digest helpers for compatibility fingerprints;
- keep builder APIs simple and provider-owned rather than introducing a generic wire DSL.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/providers test -- image-endpoint-provider
  ```

Stop rule:

- Stop and produce a Decision Packet if the resolution logic needs persisted user settings, host storage, or application-owned session state.

## Slice 2: Add `415` taxonomy and request-shape classifier

Goal:

- Map `415` into `request_invalid` and define the allowlist-first request-shape rejection classifier without widening paid retry or endpoint failover semantics.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/error-map.ts`
- focused compatibility helpers under `packages/providers/src/transport/image-endpoint/`
- focused provider tests under `packages/providers/tests/`

Required outputs:

- `415` maps to `request_invalid` while preserving original `statusCode`;
- paid retry behavior remains unchanged;
- endpoint failover behavior matches other `request_invalid` failures;
- classifier distinguishes:
  - strong `415` signal;
  - allowlist-backed `400/422` request-shape rejection;
  - denied prompt/model/size/quota-style request-invalid errors;
- accepted-work signals block fallback even when status is eligible.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/providers test -- error-map retry retry-endpoint-failover
  ```

Stop rule:

- Stop and produce a Decision Packet if the only available compatibility signal is ambiguous `500` behavior or provider-specific prose that cannot be reduced to a safe request-shape rejection rule.

## Slice 3: Add bounded endpoint-local fallback and orthogonal retry proof

Goal:

- Integrate one safe codec fallback path into `image-endpoint` invoke flow without weakening paid retry guarantees.

Allowed scope:

- `packages/providers/src/providers/image-endpoint/provider.ts`
- `packages/providers/src/transport/image-endpoint/error-map.ts`
- focused compatibility helpers under `packages/providers/src/transport/image-endpoint/`
- focused provider tests under `packages/providers/tests/`

Required outputs:

- first attempt uses the resolved codec from Slice 1 precedence;
- a second attempt is allowed only for request-shape rejection on `400`, `415`, or `422`;
- fallback is allowed only when exactly one endpoint is enabled or `failoverEnabled === false`;
- fallback attempt count is separate from `withRetry()` transport retries;
- successful fallback records the winning codec in the runtime cache;
- non-eligible errors propagate without alternate codec replay;
- multi-endpoint situations emit an explicit "fallback disabled" log instead of replaying a different codec after failover;
- warn-level logs surface the resolved codec path and fallback decision.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/providers test -- image-endpoint-provider retry paid-retry retry-endpoint-failover
  ```

Stop rule:

- Stop and produce a Decision Packet if safe fallback would require "full failover with codec A, then full failover with codec B" to be effective.

## Slice 4: Make descriptor behavior explicit without expanding runtime scope

Goal:

- Declare current wire expectations explicitly on descriptors so later response-codec work can extend the same mechanism without another descriptor redesign.

Allowed scope:

- `packages/providers/src/providers/image-endpoint/descriptor.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- focused descriptor tests under `packages/providers/tests/`

Required outputs:

- `image-endpoint` descriptor explicitly declares first-loop supported codecs and default order under `transport.wire`;
- `chat-image` descriptor may explicitly declare `responseCodecs: ['json']` only;
- no new chat-image request fallback, parser fallback, or SSE handling is introduced.

Validation:

- per-slice:
  ```bash
  pnpm --filter @imagen-ps/providers test -- registry-exports chat-image-provider image-endpoint-provider
  ```

Stop rule:

- Stop and produce a Decision Packet if explicit descriptor declarations break existing descriptor consumers outside `packages/providers`.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test -- registry-exports
pnpm --filter @imagen-ps/providers test -- image-endpoint-provider
pnpm --filter @imagen-ps/providers test -- retry
pnpm --filter @imagen-ps/providers test -- paid-retry
```

Final:

```bash
pnpm validate
```

Manual-only:

- None required for this Loop.

Live-provider:

- Not part of this Loop. Real relay validation may be proposed only after the mock harness proves the transport contract and only with explicit user approval.

## Required test additions

- `packages/providers/tests/image-endpoint-provider.test.ts`
  - codec-specific multipart field assertions for `image[]` vs `image`
  - JSON-reference builder coverage
  - provider invoke path: first codec rejected with eligible request-shape error, second codec succeeds, exactly two calls
  - provider invoke path: `500` does not trigger alternate codec fallback
  - provider invoke path: multi-endpoint config disables codec fallback and logs that decision
- new focused compatibility tests under `packages/providers/tests/`
  - precedence: cache > descriptor default > built-in default
  - fingerprint granularity, TTL, max-entry eviction, and reset behavior
  - request-shape classifier accepts only safe request-shape failures
  - `415` passes without deny-word dependence, but still fails on accepted-work evidence
  - `400/422` deny model/size/prompt/quota-style request-invalid errors
- `packages/providers/tests/retry.test.ts`
  - codec-fallback errors do not become paid-retry eligible by accident
  - `415` / request-shape rejection remain non-retryable in paid mode
- `packages/providers/tests/paid-retry.test.ts`
  - alternate codec attempt does not reuse or inflate transport retry counters
  - idempotency behavior remains unchanged inside one logical request
- `packages/providers/tests/error-map.test.ts`
  - `415` maps to `request_invalid` with original `statusCode`
- `packages/providers/tests/retry-endpoint-failover.test.ts`
  - `415` does not fail over to the next endpoint

## Decision Packet triggers

- More than one incompatible interpretation of “OpenAI-compatible” is needed for the same first-loop request path.
- A targeted relay requires `multipart-indexed`, parser fallback, or SSE before the first bounded request-dialect loop is complete.
- Safe fallback cannot be determined from structured status/error evidence and would require ambiguous `500`-based replay.
- Safe fallback would require crossing the current failover boundary and multiplying paid attempts across endpoints and codecs.
- Descriptor changes require `packages/application` or `apps/app` to understand codec names.
- Runtime cache semantics require persistence, user override, or cross-session behavior before the in-memory version is proven.
- A new codec would require provider-family-specific or domain-specific branching instead of descriptor-driven declaration.

## Completion report

After executing a slice, report:

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

`yes: architecture` only if implementation lands a stable descriptor + compatibility-resolution contract that is expected to stay as the provider transport foundation.

Otherwise:

- `no` for one-off relay evidence, temporary fallback heuristics, or incomplete design experiments.
