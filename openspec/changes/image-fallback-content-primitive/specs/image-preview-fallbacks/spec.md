## ADDED Requirements

### Requirement: Preview fallback content SHALL render inside existing host frames
The system SHALL render preview fallback content inside the existing host frame for each supported image surface. The fallback primitive SHALL NOT create or own a separate card shell, container surface, border, radius, size, overflow, or motion contract.

#### Scenario: Attachment thumbnail keeps its existing host shell
- **WHEN** an attachment thumbnail cannot render its preview image
- **THEN** the system renders fallback content inside the existing `att-thumb` host without replacing that host's size, radius, border, or motion behavior

#### Scenario: Result preview frame keeps its existing host shell
- **WHEN** a result preview frame cannot render its selected image
- **THEN** the system renders fallback content inside the existing preview frame host without introducing a new result-card layout variant

### Requirement: Preview fallback SHALL separate public state from diagnostic reason
The system SHALL model preview fallback with a user-visible state and an optional diagnostic reason. The public state SHALL be limited to `loading`, `empty`, `preview-unavailable`, `file-missing`, and `resource-unresolvable`. Diagnostic reasons MAY include lower-level causes such as decode failure, unsupported format, host unavailability, permission denial, or unknown failure, but those reasons SHALL NOT expand the public state set in Phase A.

#### Scenario: Unsupported preview evidence remains conservative
- **WHEN** the system detects a decode failure or unsupported preview format without a stronger user-facing contract
- **THEN** the public fallback state is `preview-unavailable` and the lower-level cause remains diagnostic-only

#### Scenario: Empty is not used to hide an error
- **WHEN** a preview fails for an image that is expected to exist
- **THEN** the system does not render the public state as `empty`

### Requirement: Preview availability SHALL map missing, unresolvable, loading, and empty states consistently
The system SHALL map preview availability evidence to the shared public fallback states consistently across attachment thumbnails, history thumbnails, and result preview frames.

#### Scenario: Missing asset maps to file-missing
- **WHEN** preview resolution proves that the backing asset is missing
- **THEN** the public fallback state is `file-missing`

#### Scenario: Unresolvable asset maps to resource-unresolvable
- **WHEN** preview resolution proves that the backing asset reference cannot be resolved
- **THEN** the public fallback state is `resource-unresolvable`

#### Scenario: Preview generation in progress maps to loading
- **WHEN** thumbnail generation or preview resolution is still pending
- **THEN** the public fallback state is `loading`

#### Scenario: Intentionally empty slot maps to empty
- **WHEN** a host surface has no image asset by design
- **THEN** the public fallback state is `empty`

### Requirement: Fallback presentation SHALL vary only by supported density
The system SHALL support `thumbnail`, `preview-frame`, and `large-empty` fallback densities. Thumbnail density SHALL remain icon-first and quiet. Preview-frame density MAY include a concise title. Larger empty states MAY include detail text or an action slot only when the host surface explicitly supports them.

#### Scenario: Thumbnail fallback stays compact
- **WHEN** a thumbnail host renders fallback content
- **THEN** the fallback presentation shows a compact icon treatment and does not require detail text

#### Scenario: Preview-frame fallback can show concise copy
- **WHEN** a preview-frame host renders fallback content
- **THEN** the fallback presentation may show a short user-facing message such as preview unavailable, file missing, or cannot read preview

#### Scenario: Media-card shell does not create a new density
- **WHEN** a larger result card contains a failed image frame
- **THEN** the failed image frame still uses the preview-frame fallback behavior instead of a separate media-card density

### Requirement: Fallback visuals SHALL use theme-token-driven, UXP-safe rendering
The system SHALL render fallback visuals with existing theme semantics, muted monochrome styling, and UXP-safe primitives. Fallback visuals SHALL use token-driven colors and simple inline SVG or DOM/CSS patterns rather than hardcoded palette values, browser-default broken-image icons, emoji, or complex SVG effects.

#### Scenario: Multiple failed previews remain visually quiet
- **WHEN** multiple fallback surfaces appear on screen at the same time
- **THEN** the fallback visuals remain low-contrast, theme-consistent, and do not dominate nearby content imagery

#### Scenario: Theme changes preserve fallback legibility
- **WHEN** the app runs under different host themes
- **THEN** fallback icon and text colors inherit theme-token-driven values that preserve legibility without introducing a separate hardcoded color palette

### Requirement: Preview fallback SHALL remain independent from provider-input readiness
The system SHALL determine image fallback content from preview-display availability only. Provider-input derivative readiness, upload-readiness, or generation-time conversion state SHALL NOT by themselves select preview fallback content.

#### Scenario: Provider-input pending does not force preview fallback
- **WHEN** provider-input preparation is still pending but a preview image is already available
- **THEN** the system continues to render the preview image instead of a fallback state

#### Scenario: Preview failure does not imply provider-input failure
- **WHEN** preview display is unavailable but provider-input data remains otherwise usable
- **THEN** the system renders preview fallback content without claiming that provider submission is impossible unless a separate contract proves that limitation
