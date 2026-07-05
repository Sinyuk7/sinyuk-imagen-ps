# Provider Testing

Authority: mock-only provider harness guidance
Scope: `packages/providers`
Non-goals: live provider proof, real Photoshop/UXP host proof
Last verified: 2026-07-04

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
  transport/
    transport.contract.test.ts
  families/
    <family>/
      provider.compat.test.ts
      cases/
        ...
  release/
    provider-smoke.release.test.ts
    release-env.ts
```

Rules:

- New compatibility and historical bug coverage goes into
  `tests/families/*/cases`.
- Do not keep adding one-off files per provider quirk, retry branch, or codec
  edge case.
- Request shape, response parsing, failover, retry, and malformed payload cases
  should grow mainly as parameter rows.
- A new test file is justified only when it protects a different stable
  boundary or a different test level.

## UXP Boundary

- Node multipart capture is not Photoshop/UXP proof.
- Real UXP wire verification requires the dedicated follow-up loop and opt-in `pnpm test:release` workflow plus a host-side probe.
