## ADDED Requirements

### Requirement: Binary asset payloads use shared portable types
The system SHALL represent binary asset data as `ArrayBuffer` or `Uint8Array` at shared package boundaries.

#### Scenario: Host reads an image asset
- **WHEN** a host adapter reads source image data from its native environment
- **THEN** the adapter converts that data into `ArrayBuffer` or `Uint8Array` before passing it to shared runtime code

### Requirement: Asset IO is mediated through adapter interfaces
The system SHALL read and write assets through an `AssetIOAdapter` interface that exposes `read` and `write` operations over host-defined references and targets.

#### Scenario: Workflow needs output persistence
- **WHEN** a workflow step must persist generated binary output
- **THEN** it calls the configured asset adapter rather than directly using host filesystem APIs

### Requirement: Shared runtime avoids direct host filesystem dependencies
The engine and workflow runtime SHALL NOT directly depend on browser `File`, browser `Blob`, Node.js `fs`, or Photoshop document APIs in shared code paths.

#### Scenario: Shared code is executed in UXP
- **WHEN** the shared runtime is loaded in a UXP plugin environment
- **THEN** no missing Node.js or DOM-only filesystem dependency blocks execution

### Requirement: Hosts define reference formats at adapter boundaries
Each host integration SHALL own the format of `AssetRef` and `AssetTarget` values needed by its adapter implementation.

#### Scenario: Web and UXP use different storage handles
- **WHEN** Web and Photoshop integrations persist or reload assets
- **THEN** each host uses its own adapter reference format without changing the shared binary contract
