# AGENTS.md

## Hard Rules

- `@imagen-ps/app` is the UXP/React surface only.
- No direct imports of `@imagen-ps/core-engine` or `@imagen-ps/providers`.
- Photoshop/UXP IO stays under `src/host/` or injected adapters.
- Do not change UI design or host bridge behavior outside the active loop slice.
