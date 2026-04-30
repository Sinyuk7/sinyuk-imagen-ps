## MODIFIED Requirements

### Requirement: Asset model supports image resources
The system SHALL provide an `Asset` type that represents a host-agnostic resource. `Asset` SHALL support three mutually non-exclusive reference channels: `url` (externally hosted), `data` (inline binary/base64), and `fileId` (opaque identifier referencing an upstream file storage, e.g. OpenAI File API). All three channels SHALL remain serializable strings or `Uint8Array` (for `data`), and MUST NOT reference DOM, UXP, Photoshop, or filesystem-specific types.

The `fileId` channel SHALL be treated as an opaque string identifier from the `core-engine` perspective; upload semantics, lifetime, and storage location of the referenced file are the responsibility of provider-layer transport, not of `core-engine`.

#### Scenario: Asset has a type and data
- **WHEN** an asset is defined
- **THEN** it SHALL have a `type` field (e.g., `'image'`)
- **AND** it SHALL have a data field that can hold a URL string or binary data placeholder
- **AND** it SHALL NOT reference DOM, UXP, or Photoshop-specific types

#### Scenario: Asset may reference an upstream file by opaque id
- **WHEN** an asset is constructed with `fileId: 'file-abc123'`
- **THEN** `Asset.fileId` MUST be a string at the `core-engine` boundary
- **AND** `core-engine` MUST NOT interpret, validate, or dereference the identifier
- **AND** the asset MAY simultaneously omit `url` and `data`
