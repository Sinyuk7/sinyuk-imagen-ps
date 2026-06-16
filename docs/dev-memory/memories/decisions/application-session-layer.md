# application/session layer closure record

- Decision: `@imagen-ps/application` is the shared headless application/session layer.
- Graph: `apps/app` and `apps/cli` consume `@imagen-ps/application`; `packages/application` owns command facade, session controller, request builders, runtime assembly, profile/model coordination, and ports.
- Request mapping: `provider-generate` and `provider-edit` moved to `packages/application/src/requests`.
- Removed: the standalone workflow package no longer exists in the active workspace graph.
- App surface: `apps/app` uses an app-local `useImagenSession` binding; React hooks map `ImagenSessionSnapshot` to UI rounds.
- CLI surface: job commands use a CLI-local `createImagenSession()` binding while preserving stdout/stderr and `--out` contracts.
- Validation: during the loop, `pnpm install`, `pnpm build`, `pnpm test`, app/cli/application/core/providers package-specific tests, and boundary greps passed.
- Boundaries: `packages/application` has no React/UXP/Photoshop/Node `fs/path/os`; app/CLI do not directly import core-engine/providers; active code no longer references the old command package or workflows package.
