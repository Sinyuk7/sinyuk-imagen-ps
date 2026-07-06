## ADDED Requirements

### Requirement: First-time settings entry SHALL open onboarding once
The system SHALL open a dedicated onboarding page the first time a user enters the `settings` view while `settingsOnboardingSeenVersion !== 1`. Before navigating to the onboarding page, the system SHALL persist `settingsOnboardingSeenVersion = 1` so the automatic redirect happens only once.

#### Scenario: First settings entry redirects to onboarding
- **WHEN** the user enters the `settings` view and persisted `settingsOnboardingSeenVersion` is missing or not equal to `1`
- **THEN** the system persists `settingsOnboardingSeenVersion = 1`
- **AND** the system opens the onboarding page instead of the normal `Configuration` list page

#### Scenario: Seen users are not redirected again
- **WHEN** the user enters the `settings` view and persisted `settingsOnboardingSeenVersion = 1`
- **THEN** the system opens the normal `Configuration` page
- **AND** the system MUST NOT automatically redirect to onboarding

### Requirement: Onboarding page SHALL remain a minimal read-only page
The onboarding page SHALL present a short read-only setup guide using static semantic `HTML + CSS` content. The page SHALL expose only a `back` button in the header, and activating `back` SHALL return the user to the normal `Configuration` page.

#### Scenario: Onboarding page shows only passive guidance
- **WHEN** the onboarding page is displayed
- **THEN** the page shows static instructional content for first-time setup
- **AND** the page MUST NOT show setup CTA buttons, form fields, or inline editing controls

#### Scenario: Back returns to configuration
- **WHEN** the user activates the onboarding page `back` button
- **THEN** the system opens the normal `Configuration` page

### Requirement: Configuration header SHALL expose onboarding help entry
The `Configuration` page header SHALL replace the existing `refresh` button with a question-mark help button that reopens the onboarding page on demand. The header SHALL preserve the existing `back` button, title, and `add` button.

#### Scenario: Help button reopens onboarding
- **WHEN** the user is on the normal `Configuration` page and activates the question-mark button
- **THEN** the system opens the onboarding page
- **AND** the persisted `settingsOnboardingSeenVersion` value remains unchanged

#### Scenario: Configuration header no longer shows refresh
- **WHEN** the normal `Configuration` page is rendered
- **THEN** the header shows `back`, title, question-mark help, and `add`
- **AND** the header MUST NOT show the previous `refresh` action

### Requirement: Entering settings SHALL reload provider profiles automatically
Each time the application transitions into the normal `settings` view, the system SHALL trigger one provider profile reload automatically so removing the header `refresh` button does not remove the refresh path.

#### Scenario: Transition into settings reloads profiles
- **WHEN** the application transitions from another view into the `settings` view
- **THEN** the system triggers one provider profile reload for that entry

#### Scenario: Onboarding back lands on already reloaded settings
- **WHEN** the user first enters `settings`, is redirected to onboarding, and then presses `back`
- **THEN** the system shows the normal `Configuration` page using the same settings-entry reload cycle
- **AND** the user is not redirected to onboarding again
