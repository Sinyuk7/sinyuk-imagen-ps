# AGENTS.md

## Hard Rules

- `@imagen-ps/core-engine` stays the job execution kernel.
- No profile/model selection, session snapshot ownership, UI logic, host persistence, file system IO, network IO, or provider raw transport.
- No direct provider implementation imports.
