# CLI platform paths follow-up

- Context: the foundation logging sprint split CLI config state from CLI logs. `IMAGEN_CONFIG_DIR` now controls profile, secret, job history, and asset state; `IMAGEN_LOG_DIR` controls JSONL logs.
- Current outcome: contract tests inject both env vars for hermetic subprocess runs, and production defaults still keep CLI logs under `~/.imagen-ps/logs`.
- Decision pending: platform defaults should be handled in one dedicated CLI platform paths slice instead of moving only logs.
- Scope for that slice: decide config, data, state, cache, and logs together.
- Platform requirement: include Linux and Windows behavior explicitly, not only current macOS defaults.
- Relevant files: `apps/cli/src/index.ts`, `apps/cli/tests/contract/harness.ts`, `apps/cli/src/adapters/file-log-sink.ts`, `docs/TESTING.md`.
- Validation so far: `pnpm build`, `pnpm test`, `pnpm check:policy`, and `pnpm validate` passed after the split.
