# Workflows Documentation Baseline

## ADDED Requirements

### Requirement: Workflows module SHALL expose a local authoritative documentation baseline
`packages/workflows` MUST provide a local documentation set that lets agents determine module scope, responsibilities, and current constraints without relying on archive-only references.

#### Scenario: Agent resolves module scope from local docs
- **WHEN** an agent inspects `packages/workflows`
- **THEN** it MUST be able to identify the module entry point, current stage spec, status ledger, and module constraints from local files
- **AND** it MUST NOT need `/.archive/modules/workflows/PRD.md` to determine current authority

### Requirement: Workflows documentation SHALL keep archive content out of the current authority path
The current authoritative documentation path for `packages/workflows` MUST be the local module docs, while archive references MAY remain available only as background context.

#### Scenario: Archive reference stays non-authoritative
- **WHEN** a consumer reads the workflows module documentation
- **THEN** the current authoritative path MUST point to local `README.md`, `PRD.md`, `SPEC.md`, `STATUS.md`, and `AGENTS.md`
- **AND** any archive document MUST be treated as tentative background reference only
