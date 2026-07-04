# Provider Testing

Authority: mock-only provider harness guidance
Scope: `packages/providers`
Non-goals: live provider proof, real Photoshop/UXP host proof
Last verified: 2026-07-04

## Request Harnesses

- `image-endpoint-request-contract.test.ts` records codec-owned body shape, reserved field handling, and ignored provider option diagnostics.
- `image-endpoint-transport-request.test.ts` records final URL/header/body behavior after provider + transport assembly.
- `multipart-wire-capture.test.ts` captures real Node `FormData` bytes against a local echo server and normalizes part metadata.

## Response Harnesses

- `image-endpoint-response-fixture.test.ts` uses desensitized fixtures for `data[].url`, `data[].b64_json`, empty/missing data, and error envelopes.
- Malformed JSON behavior is characterized at the `httpRequest` layer separately from semantic response parsing.

## Recovery Harnesses

- `attempt-sequence.test.ts` records image-endpoint edit attempt order and recovery suppression.
- `retry*.test.ts` and `paid-retry.test.ts` cover generic transport retry and shared failover executor behavior.
- `request-shape-classifier.test.ts` covers structured codec-fallback eligibility.

## UXP Boundary

- Node multipart capture is not Photoshop/UXP proof.
- Real UXP wire verification requires the dedicated follow-up loop and opt-in `pnpm test:release` workflow plus a host-side probe.
