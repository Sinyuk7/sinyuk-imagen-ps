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
   - provider adapters do not own UI state, local paths, or host storage.
3. Prefer mock/fetch tests for default validation.
4. Keep live provider smoke opt-in and config-driven if a smoke harness exists.
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

Live provider smoke is manual / opt-in only. `apps/cli` is an empty placeholder
(no source, only build artifacts); there is no wired CLI smoke harness — add
one as a separate Loop slice if needed.

## Stop Conditions

Stop and produce a Decision Packet (A/B/C choice with evidence and recommendation) when:

- behavior can only be proven by paid/live APIs without approval;
- provider logic needs UI state, local paths, or UXP storage;
- endpoint behavior is guessed rather than evidenced by docs, tests, or live
  smoke output.
