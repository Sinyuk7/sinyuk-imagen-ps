# Sinyuk Imagen PS

Photoshop image-generation plugin monorepo with one shipped product runtime and
shared application/domain packages. Photoshop UXP is the only delivery runtime.
The Chrome build is a repo-side fast functional harness for shared,
host-neutral behavior; it is not a second shipped product surface.

## License

This repository is licensed under `MPL-2.0`. See `LICENSE`.

Commercial users should contact the maintainer before production or large-scale use to confirm copyright, distribution, and any separate commercial licensing needs.

External contributors should sign the Contributor License Agreement in `CLA.md` before non-trivial contributions are accepted. Until CLA Assistant is installed for this repository, non-member pull requests should be reviewed against the CLA manually by maintainers and may still use `cla:exempt` for truly exempt changes. This keeps future license changes or additional commercial licensing paths legally operable after the contributor base grows.

TODO: install and configure CLA Assistant for this repository so external contributor assent is collected automatically from pull requests instead of manual maintainer review.

## Repository Structure

```
apps/
  app/         - Photoshop UXP product surface and Chrome functional harness
packages/
  application/ - headless application/session layer
  core-engine/ - job execution kernel
  providers/   - provider adapter layer
  foundation/  - host-neutral shared utilities
```

## Start Here

- Repository operating rules: `AGENTS.md` (`CLAUDE.md` and `GEMINI.md` are
  symlink aliases)
- Architecture, durable contracts, host constraints, and open questions:
  `docs/ENGINEERING_CONTEXT.md`
- Testing strategy, harness levels, commands, and acceptance gates:
  `docs/TESTING.md`
- Production artifact and release runbook: `docs/RELEASE.md`
- Permanent documentation allowlist: `scripts/policy/docs.mjs`
- Repository skills: `.agents/skills/`
- Module-specific rules: the nearest module `AGENTS.md`

## Quick Start

The repository declares `packageManager: "pnpm@9.15.4"`. Use the repo-local
mise toolchain:

```bash
mise install
pnpm bootstrap
```

See `docs/TESTING.md` for all test commands, evidence levels, and gate rules.

## Documentation Rules

- Keep the root README as an index and scope summary.
- Keep testing authority in `docs/TESTING.md`.
- Keep durable architecture context in `docs/ENGINEERING_CONTEXT.md`.
- Keep `AGENTS.md` focused on executable operating rules.
