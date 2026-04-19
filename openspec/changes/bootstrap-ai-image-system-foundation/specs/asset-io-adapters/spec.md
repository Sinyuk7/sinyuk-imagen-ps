## ADDED Requirements

### Requirement: Binary asset payloads use shared portable types
The system SHALL represent binary asset data as `ArrayBuffer` or `Uint8Array` at shared package boundaries. Base64 MAY be used inside a host adapter as a compatibility transport, but SHALL NOT become the shared runtime asset contract.

#### Scenario: Host reads an image asset
- **WHEN** a host adapter reads source image data from its native environment
- **THEN** the adapter converts that data into `ArrayBuffer` or `Uint8Array` before passing it to shared runtime code

### Requirement: Asset IO is mediated through adapter interfaces
The system SHALL read and write assets through an `AssetIOAdapter` interface that exposes `read` and `write` operations over host-defined references and targets.

#### Scenario: Workflow needs output persistence
- **WHEN** a workflow step must persist generated binary output
- **THEN** it calls the configured asset adapter rather than directly using host filesystem APIs

### Requirement: Adapter results use shared asset descriptors and host-owned references
Adapter `read` and `write` operations SHALL exchange a shared `AssetDescriptor` envelope with host-owned reference or target data plus standardized metadata including `mimeType`, `byteLength`, and optional `width`, `height`, and `thumbnailRef`. Shared runtime code SHALL treat host references as opaque unless the host explicitly declares them serializable.

#### Scenario: Web and UXP return different storage handles
- **WHEN** Web and Photoshop integrations persist or reload assets
- **THEN** each adapter returns its own opaque host reference format inside the shared `AssetDescriptor`
- **THEN** shared runtime code relies only on the standardized descriptor metadata and declared adapter operations

### Requirement: Shared runtime avoids direct host filesystem dependencies
The engine and workflow runtime SHALL NOT directly depend on browser `File`, browser `Blob`, Node.js `fs`, or Photoshop document APIs in shared code paths.

#### Scenario: Shared code is executed in UXP
- **WHEN** the shared runtime is loaded in a UXP plugin environment
- **THEN** no missing Node.js or DOM-only filesystem dependency blocks execution

### Requirement: Adapters enforce memory-safe boundaries for large payloads
The `AssetIOAdapter` SHALL implement chunked processing or safe-yield conversion behavior when moving payloads that exceed standard host memory thresholds, including UXP string-allocation limits.

#### Scenario: UXP host processes a high-resolution image
- **WHEN** the integration needs to encode a 50MB or larger `ArrayBuffer` into Base64 for provider compatibility
- **THEN** the adapter uses chunked conversion or safe-yield concatenation rather than a single contiguous string allocation
- **THEN** the shared runtime still receives or returns portable binary types instead of a Base64 contract

### Requirement: Adapter failures are explicit and structured
Adapter read or write failures SHALL surface as structured `asset_io_error` or `host_capability_error` results. V1 SHALL NOT require streaming semantics at the shared runtime boundary.

#### Scenario: Host cannot persist an output asset
- **WHEN** an adapter write operation fails because of permission, storage, or host capability limits
- **THEN** the adapter returns or throws a structured failure with machine-readable category and message
- **THEN** the calling workflow or host can distinguish asset persistence failure from provider execution failure
