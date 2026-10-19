# AGENTS.md

## Hard Rules

- `@imagen-ps/foundation` is the lowest-level shared package.
- Only host-agnostic, side-effect-free code: pure functions, types, serialization, and contracts.
- No Node `fs/path/os`, no UXP/Photoshop, no React/DOM, no workspace reverse dependencies.
- All public exports MUST have concise Chinese JSDoc.
