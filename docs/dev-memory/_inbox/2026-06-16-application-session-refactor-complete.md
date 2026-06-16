# application session refactor complete

- Decision: `@imagen-ps/application` is now the shared headless application/session layer.
- Graph: `apps/app` and `apps/cli` consume `@imagen-ps/application`; `packages/application` owns command facade, session controller, request builders, runtime assembly, profile/model coordination, and ports.
- Request mapping: `provider-generate` and `provider-edit` moved to `packages/application/src/requests`.
- Removed: the standalone workflow package no longer exists in the active workspace graph.
- App surface: `apps/app` uses an app-local `useImagenSession` binding; React hooks map `ImagenSessionSnapshot` to UI rounds.
- CLI surface: job commands use a CLI-local `createImagenSession()` binding while preserving stdout/stderr and `--out` contracts.
- Validation: `pnpm install`, `pnpm build`, `pnpm test`, package-specific app/cli/application/core/providers tests, and boundary greps passed during the loop.
- Boundaries: no React/UXP/Photoshop/Node fs/path/os in `packages/application`; no app/CLI direct imports of core-engine/providers; no active references to the old command package or workflows package.
