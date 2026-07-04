# Provider Failure And Recovery Disposition

Status: accepted
Last verified: 2026-07-04
Scope: `packages/providers` image-generation transport

## Goal

Keep observed failure facts separate from recovery action.

## Canonical shapes

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

## Decision boundary

- `RecoveryDisposition` records facts only.
- `automaticReplay` and `codecFallback` are not fields on `RecoveryDisposition`.
- `decideNextAction()` combines disposition + plan + capability + budget to choose recovery.

## HTTP status mapping baseline

- `415` -> `executionState: rejected_before_execution`,
  `wireRejection: { kind: unsupported_request_content, implicatedDimension: unknown }`,
  evidence from `http_status`.
- `422` -> `executionState: unknown`,
  `wireRejection: { kind: semantic_invalid }`,
  evidence from `http_status`.
- `400` -> `executionState: unknown`, evidence from `http_status`.
- `502/503/504` -> `executionState: unknown`, evidence from `http_status`.
- `timeout/network_error` -> `executionState: unknown`, evidence from `transport_signal`.
- `429` -> `executionState: rejected_before_execution`, evidence from `http_status`.

## Constraints

- `429` is never described as "replay allowed" inside `RecoveryDisposition`.
- `mapHttpError()` only reports failure facts; it does not authorize retry, failover, or codec fallback.
