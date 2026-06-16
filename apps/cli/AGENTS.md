# AGENTS.md

## Hard Rules

- `@imagen-ps/cli` is the Node CLI surface only.
- Preserve parser, stdout/stderr, and `--out` artifact contracts unless a loop slice explicitly allows changes.
- No Photoshop, UXP, UI, or runtime-internal imports.
