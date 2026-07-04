# Provider Attempt And Replay Safety

Status: accepted
Last verified: 2026-07-04
Scope: `packages/providers` image-generation transport

## Goal

Freeze the paid replay safety contract and the image-endpoint attempt-plan shape before behavior changes.

## Principles

### Principle 1: paid non-idempotent replay safety

```text
429 -> same-endpoint bounded retry, governed by paid retry policy alone
      (not by RecoveryDisposition)

415 + classifier confirms alternate codec changes the rejected wire dimension
  -> codec fallback allowed

400 / 422 -> default no fallback
  -> unless provider-specific structured error code proves wire shape rejection

502 / 503 / 504 / timeout / connection_lost / response_lost
  -> execution state unknown
  -> stop immediately; no automatic replay; no cross-endpoint failover

The only function that decides next action:
decideNextAction(failure, plan, capability, budget) -> NextAction

No retry, failover, classifier, or provider may make a second independent recovery decision.
```

### Principle 2: endpoint failover and codec fallback are mutually exclusive plans

```text
ResolvedAttemptPlan is a flat ordered list of AttemptCandidate:
  { endpointId, codecId, reason }

codec-fallback mode: same endpoint, ordered codecs (one candidate per codec)
endpoint-failover mode: each endpoint gets its own resolved codec (one candidate per endpoint)

Never: every endpoint x every codec.
```

## Canonical shapes

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

```ts
interface DispatchBudget {
  maxSameEndpointRetries: number;
  maxCodecFallbacks: number;
  maxEndpointFailovers: number;
  maxTotalDispatches: number;
}
```

## Constraints

- Only one layer owns `429` retry: paid retry policy.
- `withRetry` and the higher-level coordinator must not both retry `429`.
- This ADR does not introduce a unified provider-wide codec abstraction.
