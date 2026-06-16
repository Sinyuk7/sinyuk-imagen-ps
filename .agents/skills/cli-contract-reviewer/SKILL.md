---
name: cli-contract-reviewer
description: Review or plan repository CLI contract changes. Use for CLI parser, stdout/stderr, profile commands, job commands, task-first commands, config/log path behavior, subprocess contract tests, or --out artifact behavior.
---

# CLI Contract Reviewer

Keep `@imagen-ps/cli` as the Node CLI surface over shared application/session
commands.

## Required Context

Read:

- `apps/cli/AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- relevant files under `apps/cli/src`
- relevant tests under `apps/cli/tests/contract`

Read historical Loop records only if the active requirement needs them.
Classify each doc per `docs/agent/LOOP.md` Document Authority before reading;
do not treat completed Loops as active plans.

## Review Procedure

1. Identify the user-visible CLI contract:
   - parser command / flags;
   - success stdout JSON;
   - failure stderr JSON;
   - config and log env vars;
   - `--out` artifact layout and sidecar fields.
2. Confirm the CLI remains a surface:
   - no React / DOM / Photoshop / UXP imports;
   - no direct provider transport ownership;
   - no direct `@imagen-ps/core-engine` or `@imagen-ps/providers` imports
     unless the active Loop explicitly authorizes cross-boundary changes.
3. Map the change to contract tests before implementation.
4. Check hermetic subprocess behavior:
   - `IMAGEN_CONFIG_DIR` for profile, secret, job history, asset state;
   - `IMAGEN_LOG_DIR` for JSONL logs.
5. Keep docs, parser behavior, and tests in the same slice when user-visible
   behavior changes.

## Validation

Use as appropriate:

```sh
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm check:policy
pnpm validate
```

Filtered CLI tests require fresh `apps/cli/dist/index.js`; build first when in
doubt.

## Stop Conditions

Stop and produce a Decision Packet using `docs/loops/_decision-packet.md` when
the CLI change needs:

- Photoshop / UXP / React behavior;
- provider raw transport semantics;
- shared application/core contract changes not authorized by the Loop;
- live provider proof as the only validation path.
