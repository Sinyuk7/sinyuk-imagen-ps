# shared-commands-layer Specification

## Purpose
TBD - created by archiving change refactor-surface-architecture. Update Purpose after archive.
## Requirements
### Requirement: Shared commands package

The repository SHALL provide a package at `packages/shared-commands` with package name `@imagen-ps/shared-commands`.

This package SHALL own the public command facade, command result types, runtime assembly access, and config adapter injection used by all surface apps.

#### Scenario: Shared commands package exists
- **WHEN** workspace packages are inspected
- **THEN** `packages/shared-commands/package.json` SHALL exist
- **AND** its package name SHALL be `@imagen-ps/shared-commands`

#### Scenario: Commands are exported from shared package
- **WHEN** a surface app imports command APIs
- **THEN** it SHALL be able to import them from `@imagen-ps/shared-commands`
- **AND** it MAY import command-specific APIs from `@imagen-ps/shared-commands/commands` if that subpath is exported

---

### Requirement: Host-agnostic command layer

`@imagen-ps/shared-commands` SHALL be host-agnostic and MUST NOT depend on Photoshop, UXP, React, DOM, or surface application modules.

`@imagen-ps/shared-commands` SHOULD NOT depend on Node-only file system modules such as `fs`, `path`, or `os`; Node-specific persistence SHALL be implemented in `apps/cli` and injected through adapters.

#### Scenario: No Photoshop or UXP dependency
- **WHEN** source imports in `packages/shared-commands/src/**` are inspected
- **THEN** no import SHALL reference `photoshop`, `uxp`, `@adobe/*`, or `apps/app`

#### Scenario: No UI dependency
- **WHEN** source imports in `packages/shared-commands/src/**` are inspected
- **THEN** no import SHALL reference `react`, `react-dom`, DOM-specific modules, or app UI modules

#### Scenario: No CLI file-system dependency
- **WHEN** source imports in `packages/shared-commands/src/**` are inspected
- **THEN** no production import SHALL reference Node-only `fs`, `path`, or `os`
- **AND** CLI-specific storage SHALL remain under `apps/cli`

---

### Requirement: Runtime assembly ownership

`@imagen-ps/shared-commands` SHALL own the runtime singleton assembly currently provided by app-local shared runtime code.

The runtime assembly SHALL initialize `core-engine` runtime with builtin workflows and provider adapters without requiring any surface app dependency.

#### Scenario: Runtime initialized through shared commands
- **WHEN** a command such as `submitJob` or `listProviders` is called from any surface
- **THEN** runtime initialization SHALL occur inside `@imagen-ps/shared-commands`
- **AND** the calling surface SHALL NOT need to import runtime factories directly

#### Scenario: Surface does not import runtime internals
- **WHEN** source imports in `apps/app/src/**` and `apps/cli/src/**` are inspected
- **THEN** they SHALL NOT import `createRuntime` from `@imagen-ps/core-engine`
- **AND** they SHALL NOT import `builtinWorkflows` from `@imagen-ps/workflows` for command execution

---

### Requirement: Config adapter injection in shared commands

`@imagen-ps/shared-commands` SHALL expose config adapter injection so surfaces can provide host-specific persistence.

The shared package SHALL provide a default in-memory adapter for tests and no-adapter startup.

#### Scenario: CLI injects file adapter
- **WHEN** CLI starts before executing a command
- **THEN** it SHALL create its file-system config adapter in `apps/cli`
- **AND** it SHALL inject that adapter through `setConfigAdapter` from `@imagen-ps/shared-commands`

#### Scenario: Photoshop app injects UXP adapter
- **WHEN** Photoshop app provides persistent config storage
- **THEN** it SHALL create the UXP-specific adapter in `apps/app`
- **AND** it SHALL inject that adapter through `setConfigAdapter` from `@imagen-ps/shared-commands`

#### Scenario: Default adapter remains available
- **WHEN** no surface adapter has been injected
- **THEN** shared commands SHALL use an in-memory config adapter

---

### Requirement: Public command contract preservation

Migrating commands from app-local code to `@imagen-ps/shared-commands` SHALL preserve the public behavior of existing command APIs.

#### Scenario: Existing command signatures preserved
- **WHEN** command APIs are imported from `@imagen-ps/shared-commands`
- **THEN** `submitJob`, `getJob`, `subscribeJobEvents`, `listProviders`, `describeProvider`, `getProviderConfig`, `saveProviderConfig`, and `retryJob` SHALL preserve their existing public signatures

#### Scenario: CommandResult preserved
- **WHEN** command result types are imported from `@imagen-ps/shared-commands`
- **THEN** `CommandResult<T>` SHALL remain `{ ok: true, value: T } | { ok: false, error: JobError }`

