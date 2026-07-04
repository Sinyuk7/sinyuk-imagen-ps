# Production Release Runbook

This document is the single authoritative runbook for building, verifying, packaging,
and releasing the Photoshop UXP plugin as a production artifact. It is part of the
permanent high-authority documentation set.

## Artifact Contract

The production artifact is a clean-built staging directory at
`apps/app/release/uxp-production/`. It is produced from a raw Vite production build at
`apps/app/release/.uxp-production-raw/` by copying only allowlisted files into the final
staging directory.

### Allowlist

```
manifest.json
index.html
BUILD_INFO.json
ARTIFACT_MANIFEST.json
LICENSE.txt
THIRD_PARTY_NOTICES.txt
assets/**
```

The staging directory is produced by **atomic promotion**: the build writes to a
temporary directory, runs the verifier, generates `ARTIFACT_MANIFEST.json`, and only
on full verification success atomically renames it to the final staging path. A failed
verification deletes the temp directory and leaves the previous staging untouched —
the stable staging directory is never in a half-built state.

`ARTIFACT_MANIFEST.json` records every staged file's relative path, size, and SHA-256
(excluding itself). `ccx:post` uses it to prove a packaged `.ccx` matches the staging
byte-for-byte.

### Forbidden in staging (denylist scanner is secondary to the allowlist)

- `.map` files, inline `sourceMappingURL`, `sourcesContent`
- `.ts` / `.tsx` source files
- `.env*` files
- test files, fixtures, coverage, `src/`, `tests/`, `docs/`, `scripts/`, `node_modules/`
- absolute local paths (`/Users/`, `/home/`, Windows drive paths)
- high-confidence secret patterns (private keys, bearer tokens, `sk-`/`pk-` API keys)
- React development build markers, Vite HMR runtime
- `.gitkeep` and other placeholder files (pruned automatically)

### Source map policy

Production builds set `sourcemap: false` in `vite.uxp.production.config.ts`. The
verifier additionally scans every emitted JS/CSS/HTML file for `sourceMappingURL`,
inline source map data URIs, and `sourcesContent`. Development builds keep
`sourcemap: true` for debuggability; production and development configs are separate.

### Environment variable policy

Only `__IMAGEN_PS_DEV__` (a boolean dev flag) is defined into the client bundle via
`vite.base.config.ts`. No variable whose name contains `SECRET`, `TOKEN`, or
`PRIVATE_KEY` is ever injected into the client. Variables named `PUBLIC_*` are not
injected by default; each must be explicitly reviewed before addition. All values
that reach the UXP client are treated as user-readable. Runtime provider credentials
are resolved at execution time via `SecretStorageAdapter`, never baked into the bundle.

**Build-env allowlist enforcement** (`apps/app/scripts/lib/build-env-allowlist.mjs`):
the verifier scans every emitted JS/CSS/HTML file for `process.env`, `import.meta.env`,
`JSON.stringify(process.env)`, and any `VITE_*` token not in `ALLOWED_VITE_VARS`
(currently empty). `auditViteEnvConfig` additionally rejects `envPrefix: ''` and any
`define` key not in `ALLOWED_CLIENT_DEFINES`. The secret pattern scanner is a second
line of defense; the allowlist is the first.

### Legal notice policy

- Every emitted JS/CSS file carries the formal copyright banner:
  ```
  /*!
   * Imagen PS
   * Copyright (c) 2026 Sinyuk. All rights reserved.
   * See LICENSE.txt and THIRD_PARTY_NOTICES.txt.
   */
  ```
- The main entry bundle additionally carries exactly one AI agent attribution notice
  (`@ai-notice`). It is a static comment and a courtesy, not a security boundary or a
  prompt-injection attempt.
- `LICENSE.txt` is copied from the repository root `LICENSE` (MPL-2.0).
- `THIRD_PARTY_NOTICES.txt` is generated from the **actual Rollup bundle module graph**
  (`bundled-packages.json`, written by `bundledPackagesPlugin` from `chunk.modules`),
  not from `package.json` declarations. This captures transitive dependencies that
  reached the bundle and excludes direct dependencies that were never imported. Same
  package at two versions is distinguished. Packages whose license cannot be resolved
  automatically (from their `LICENSE` file or `package.json` `license` field, including
  pnpm `.pnpm/<name>@<version>/` transitive paths) are marked `UNKNOWN` and **hard-fail
  the release gate** unless acknowledged in `apps/app/scripts/lib/license-overrides.json`.

### Version and build metadata

The single source of truth for the plugin version is `apps/app/public/manifest.json`
`version`. `BUILD_INFO.json` is generated at build time from the manifest version plus
git state (short commit SHA, dirty flag) and contains `name`, `version`, `buildId`
(`<version>+<short-commit>`), `commit`, `channel`, optional `dirty`, and optional
`builtAt` (only when `SOURCE_DATE_EPOCH` is injected). It never contains developer
absolute paths, usernames, hostnames, or Git remote credentials. Git operations run
only at build time, never at runtime.

## Commands

### Development build

```bash
pnpm --filter @imagen-ps/app build:uxp
```

Writes `apps/app/dist/` for UXP Developer Tool loading. Keeps sourcemaps for
debugging.

### Production build

```bash
pnpm --filter @imagen-ps/app build:production
```

Cleans old staging, runs the Vite production bundle (sourcemap off, esbuild minify,
CSS minify, banner injection), stages allowlisted files to
`apps/app/release/uxp-production/`, writes `LICENSE.txt`, generates
`THIRD_PARTY_NOTICES.txt`, writes `BUILD_INFO.json`, and runs the artifact verifier.
Exits non-zero on any failure.

### Artifact verification (standalone)

```bash
pnpm --filter @imagen-ps/app verify:production
```

Re-runs the verifier against the existing staging directory without rebuilding.

### Release gate

```bash
pnpm release:verify
```

Runs `pnpm validate` (build + mock-only tests + policy), then the production build
(with atomic promotion), then artifact verification, then license-generation
verification, then build-metadata and version-consistency verification, and prints a
package readiness report. **Default rejects a dirty git working tree** — a release
artifact must correspond to a reproducible commit. Use `--allow-dirty` for local
rehearsal only; it prints `NON-RELEASABLE` and must not be used for an actual release.
Any unresolved third-party license hard-fails. Pass a `.ccx` path as an extra argument
to additionally verify its filename version matches the manifest version. Production
build does not depend on a running dev server. Release tests (`pnpm test:release`)
are not part of this gate; they remain a separate opt-in live-interface level.

### Tests

```bash
pnpm --filter @imagen-ps/app test
```

Includes build-metadata, legal-banner, artifact-verifier, and production-build
integration tests. All are mock-only and reproducible.

## Packaging (.ccx)

Adobe `.ccx` packaging is a manual boundary performed with UXP Developer Tool (UDT).
The repo does not fabricate a ZIP and call it a `.ccx`.

### Pre-package

```bash
pnpm --filter @imagen-ps/app ccx:pre
```

Verifies the staging directory is present and passes the artifact verifier, then
prints the directory UDT should load.

### UDT manual steps

1. Open UXP Developer Tool.
2. Click `Add Plugin` and select the manifest at
   `apps/app/release/uxp-production/manifest.json` (UDT loads the staging directory as
   the plugin root).
3. Use `Package` (not `Load` for testing — `Package` produces the `.ccx`).
4. UDT prompts for an output path. Use the naming rule:
   `imagen-ps-<version>.ccx` (e.g. `imagen-ps-0.1.0.ccx`).

### Post-package inspection

```bash
pnpm --filter @imagen-ps/app ccx:post <path/to/imagen-ps-<version>.ccx>
```

Full positive-path verification: lists internal entries, checks required files exist
and no `.map`/`.ts`/`.env` inside, extracts the archive to a temp directory, locates
the manifest root, runs the **full artifact verifier** on the extracted content,
compares every file's SHA-256 against the staging `ARTIFACT_MANIFEST.json`, and only
on full success writes the `.sha256` sidecar. On any failure it prints a short hash
to the log and writes **no sidecar** — an unvalidated artifact never gets a `.sha256`
file that could be mistaken for release validation.

The repo-owner positive path was proven by zipping the staging directory into a
`.ccx`-shaped archive and running `ccx:post` (extract + verifier + manifest compare
all passed, sidecar written). A real UDT-produced `.ccx` still requires UDT, but the
pipeline is ready for it.

### Smoke checklist

```bash
pnpm --filter @imagen-ps/app ccx:checklist
```

Prints the packaged-build Photoshop smoke checklist. This is MANUAL evidence; do not
claim it passed without executing each step in real Photoshop 26.1+ / UXP 8.1.0+.

## Install Verification

- Install the `.ccx` via UDT or double-click.
- Confirm Photoshop loads the plugin panel named `Imagen`.
- To confirm the loaded build is the packaged build (not the dev directory), check
  `BUILD_INFO.json` `channel` is `production` and `buildId` matches the staging
  metadata. Production logs should not contain React dev-build markers or HMR noise.

## Troubleshooting

- **Build fails**: run `pnpm --filter @imagen-ps/app build:production` directly to see
  the full log. The most common cause is a stale theme; `theme:generate` runs first.
- **Verifier fails on `sourceMappingURL`**: ensure no plugin re-enables sourcemaps;
  production config is `vite.uxp.production.config.ts` with `sourcemap: false`.
- **Verifier fails on `allowlist violation`**: a new file type is being emitted into
  the raw build. Either stop emitting it or extend `STAGING_ALLOWLIST` in
  `apps/app/scripts/lib/verify-artifact.mjs` with justification.
- **Banner missing**: the `legalBannerPlugin` runs in `generateBundle`; the UXP
  bootstrap logger is handled by `bootstrapBannerPlugin` in `writeBundle`. Both must
  be present in the production config plugin list.
- **Third-party notice generation fails or marks UNKNOWN**: the package has no
  `LICENSE` file and no `license` field in its `package.json`. Add the license text
  to the package or resolve manually in the generated file before distribution.
- **UDT packaging fails**: UDT requires Photoshop 26.1+ and UXP 8.1.0+. Confirm the
  manifest `host.minVersion` and `manifestVersion: 5` are intact.
- **Packaged build behaves differently from dev build**: confirm UDT loaded
  `release/uxp-production/manifest.json` and not the dev `dist/`. Check `BUILD_INFO.json`
  is present in the packaged plugin (it only exists in production staging).
