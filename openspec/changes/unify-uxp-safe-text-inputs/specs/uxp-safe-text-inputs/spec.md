## ADDED Requirements

### Requirement: Shared text inputs SHALL use one popup-safe seam
The shared UI system SHALL provide a single approved seam for both single-line and multi-line text entry in Photoshop UXP surfaces. Public shared text input primitives MUST route through this seam so popup overlap handling and native editor synchronization do not depend on feature-level knowledge.

#### Scenario: Single-line shared input uses popup-safe handling
- **WHEN** a shared UI surface renders a public single-line text input
- **THEN** the input SHALL use the approved popup-safe text input seam rather than a feature-owned raw native editor path

#### Scenario: Multi-line shared input uses the same seam family
- **WHEN** a shared UI surface renders a public multi-line text input
- **THEN** the input SHALL use the approved popup-safe text input seam family with the same popup overlap contract

### Requirement: Overlapping popups SHALL suspend native text editor hit-testing
When an anchored popup overlaps a shared text input's native editor region, the system SHALL suspend the occluded native editor so the popup remains interactive and hit-testing does not leak through to the underlying editor. Once the occluding popup is removed, normal text entry behavior MUST resume.

#### Scenario: Popup overlaps single-line text input
- **WHEN** an anchored popup overlaps a shared single-line text input inside the panel
- **THEN** the underlying native editor SHALL be suspended until the overlap ends

#### Scenario: Popup overlaps multi-line text input
- **WHEN** an anchored popup overlaps a shared multi-line text input inside the panel
- **THEN** the underlying native editor SHALL be suspended until the overlap ends

#### Scenario: Text input resumes after popup closes
- **WHEN** the occluding popup is dismissed or no longer overlaps the text input
- **THEN** the shared text input SHALL resume normal visibility and editing behavior

### Requirement: Unsafe text input paths SHALL be mechanically rejected
The repository SHALL mechanically reject shared UI changes that introduce raw native text editor paths outside the approved text-input seam, so future contributors cannot bypass the popup-safe contract by accident.

#### Scenario: Shared UI source bypasses the seam
- **WHEN** a shared UI source file introduces a raw native text editor or imports an internal unsafe text-input implementation outside the approved seam
- **THEN** the repo policy gate SHALL fail and identify the approved shared seam as the required replacement

### Requirement: Popup overlap behavior SHALL have regression coverage for both input shapes
The repository SHALL keep regression coverage that demonstrates popup overlap handling for both single-line and multi-line shared text inputs, so host-specific UXP overlap regressions are detected before release.

#### Scenario: Harness proves single-line overlap suspension
- **WHEN** the popup overlap harness opens an anchored popup over a shared single-line text input
- **THEN** the harness SHALL expose that the single-line native editor is suspended while overlapped

#### Scenario: Harness proves multi-line overlap suspension
- **WHEN** the popup overlap harness opens an anchored popup over a shared multi-line text input
- **THEN** the harness SHALL expose that the multi-line native editor is suspended while overlapped
