---
name: provider-contract-reviewer
description: Review or plan repository provider contract changes. Use for provider config schemas, canonical image requests, model discovery, transport request builders, response parsers, provider descriptors, mock/live smoke boundaries, or provider normalization behavior.
---

# Provider Contract Reviewer

Keep provider semantics inside `packages/providers` and the application request
mapping inside `packages/application`.

## Required Context

Read:

- `packages/providers/AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- relevant provider contract files under `packages/providers/src/contract`
- relevant implementation and tests under `packages/providers`

Read `docs/openapi/*` only when endpoint field mapping matters. Treat those docs
as endpoint reference, not as product roadmap.
Classify each doc per `docs/agent/LOOP.md` Document Authority before reading;
do not treat completed Loops as active plans.

## Review Procedure

1. Identify the contract surface:
   - descriptor;
   - config schema;
   - canonical request;
   - transport request builder;
   - response parser;
   - model discovery;
   - diagnostics / errors.
2. Check ownership:
   - provider adapters do not own app/session state;
   - provider adapters do not own host IO;
   - provider adapters do not own CLI flags or local paths.
3. Prefer mock/fetch tests for default validation.
4. Keep live provider smoke opt-in and config-driven through
   `apps/cli/tests/smoke/e2e.config.json`.
5. If request mapping changes, include `packages/application` request tests in
   the Loop validation plan.

## Validation

Use as appropriate:

```sh
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm check:policy
pnpm validate
```

Live provider smoke is manual / opt-in only:

```sh
pnpm build
IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test
```

## Stop Conditions

Stop and produce a Decision Packet using `docs/loops/_decision-packet.md` when:

- behavior can only be proven by paid/live APIs without approval;
- provider logic needs UI state, CLI flags, local paths, or UXP storage;
- endpoint behavior is guessed rather than evidenced by docs, tests, or live
  smoke output.
