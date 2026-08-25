# Provider Testing

Authority: mock-only provider harness guidance
Scope: `packages/providers`
Non-goals: live provider proof, real Photoshop/UXP host proof
Last verified: 2026-08-25

## Permanent Test Shape

`packages/providers` is one of the few allowed growth areas, but growth must
stay inside family-local case directories rather than file-count sprawl.

Keep permanent suites organized by stable boundary:

- provider contract
- transport contract
- provider registry / descriptor contract
- compatibility and historical edge cases
- release live-provider smoke

Preferred shape:

```txt
tests/
  contract/
    provider.contract.test.ts
  providers/
    grsai/
    gemini/
    openai-images/
  registry/
  shared/
  release/
    release-env.ts
```

Rules:

- Provider descriptor/registry coverage proves canonical `ApiFormat` routing,
  complete default templates, and rejection of invalid or conflicting templates.

- Provider-specific request, parse, async lifecycle, and capability cases stay
  under the matching `tests/providers/*` owner. Registry composition belongs in
  `tests/registry`; genuinely shared primitive coverage belongs in `tests/shared`.
- Do not keep adding one-off files per provider quirk, retry branch, or codec
  edge case.
- Request shape, response parsing, failover, retry, and malformed payload cases
  should grow mainly as parameter rows.
- A new test file is justified only when it protects a different stable
  boundary or a different test level.

## Async Execution

- Keep provider async lifecycle tests protocol-local: submission shape, polling response parsing, and service status mapping.
- Keep manager tests in `packages/application` with fake lifecycle and fake clock/sleeper. Cover submit-once, same-`jobId` deduplication, budget, abort, cleanup, and no replacement submission.
- No async test may depend on live Provider timing, remote task IDs, or UXP/Chrome timer behavior.

## UXP Boundary

- Node multipart capture is not Photoshop/UXP proof.
- Real UXP wire verification requires the dedicated follow-up loop and opt-in `pnpm test:release` workflow plus a host-side probe.
