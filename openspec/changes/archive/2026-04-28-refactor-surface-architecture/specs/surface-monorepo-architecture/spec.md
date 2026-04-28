## ADDED Requirements

### Requirement: Surface apps directory structure

The repository SHALL use `apps/*` for executable surface applications and `packages/*` for shared packages.

The Photoshop plugin surface SHALL reside at `apps/app` and keep package name `@imagen-ps/app`.

The CLI surface SHALL reside at `apps/cli` and use package name `@imagen-ps/cli`.

#### Scenario: Workspace discovers apps and packages
- **WHEN** workspace installation or filtering runs from the repository root
- **THEN** `pnpm-workspace.yaml` SHALL include `apps/*`
- **AND** `pnpm-workspace.yaml` SHALL include `packages/*`
- **AND** it SHALL NOT require a top-level `app` workspace entry

#### Scenario: Photoshop app path
- **WHEN** maintainers inspect the Photoshop app source
- **THEN** the app source SHALL be located under `apps/app`
- **AND** its package name SHALL remain `@imagen-ps/app`

#### Scenario: CLI app path
- **WHEN** maintainers inspect the CLI source
- **THEN** the CLI source SHALL be located under `apps/cli`
- **AND** its package name SHALL be `@imagen-ps/cli`

---

### Requirement: Layered dependency direction

Surface apps SHALL depend on shared application packages and MUST NOT depend on each other.

The allowed high-level dependency direction SHALL be:

```text
apps/* -> packages/shared-commands -> packages/core-engine
                                  -> packages/providers
                                  -> packages/workflows
```

`apps/cli` MUST NOT depend on `@imagen-ps/app`.

`@imagen-ps/app` MUST NOT be required to run CLI commands.

#### Scenario: CLI package dependencies
- **WHEN** `apps/cli/package.json` is inspected
- **THEN** it SHALL depend on `@imagen-ps/shared-commands`
- **AND** it SHALL NOT depend on `@imagen-ps/app`

#### Scenario: Photoshop app package dependencies
- **WHEN** `apps/app/package.json` is inspected
- **THEN** it SHALL depend on `@imagen-ps/shared-commands`
- **AND** it MAY depend on React or Photoshop/UXP surface dependencies

#### Scenario: Surface-to-surface dependency is rejected
- **WHEN** source imports in `apps/cli/src/**` are inspected
- **THEN** no import SHALL reference `@imagen-ps/app` or `apps/app`

---

### Requirement: Architecture documentation reflects surface layout

Project architecture documentation SHALL describe `apps/app` and `apps/cli` as surface applications, and `packages/shared-commands` as the shared application layer.

#### Scenario: AGENTS overview updated
- **WHEN** `AGENTS.md` is inspected
- **THEN** it SHALL describe two surface apps: `apps/app` and `apps/cli`
- **AND** it SHALL list `shared-commands`, `core-engine`, `providers`, and `workflows` as shared packages

#### Scenario: Architecture diagram updated
- **WHEN** `ARCHITECTURE.md` is inspected
- **THEN** it SHALL include the dependency direction `surface apps -> shared-commands -> runtime packages`
- **AND** it SHALL NOT describe CLI as depending on Photoshop app

---

### Requirement: Active CLI surface change alignment

The active `cli-surface` change SHALL align with this architecture and MUST NOT specify `CLI -> app -> packages` as the implementation direction.

#### Scenario: CLI surface proposal alignment
- **WHEN** `openspec/changes/cli-surface` artifacts are inspected
- **THEN** they SHALL describe CLI as depending on `@imagen-ps/shared-commands`
- **AND** they SHALL NOT require CLI to import `app/src/shared/commands` or `@imagen-ps/app/shared/commands`
