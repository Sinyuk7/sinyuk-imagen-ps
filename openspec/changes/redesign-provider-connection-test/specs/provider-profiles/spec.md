## MODIFIED Requirements

### Requirement: Settings pages SHALL test draft provider connections without persisting secrets
Settings pages SHALL allow users to test draft provider connections before save by submitting the current draft `apiFormat`, non-secret `config`, write-only `secretValues`, and `removedSecretNames` to the command layer without persisting the profile first. The command result SHALL not return secret-bearing config or secret values. Connection testing SHALL be independent from model discovery and SHALL not require generating images.

#### Scenario: Draft connection test succeeds via safe probe
- **WHEN** the user clicks `测试连接` on a draft profile and the provider safe probe completes successfully
- **THEN** the command layer SHALL return a non-secret result with status `verified`
- **THEN** the UI SHALL show a positive connection notice without persisting the profile

#### Scenario: Draft connection test is only partially verified
- **WHEN** the user clicks `测试连接` on a draft profile and the reachable provider surface does not support safe non-generation verification
- **THEN** the command layer SHALL return a non-secret result with status `partial`
- **THEN** the UI SHALL show a non-blocking notice explaining that the service is reachable but could not be fully verified without generation
- **THEN** the profile SHALL remain saveable

#### Scenario: Model discovery is unavailable
- **WHEN** the user tests a draft profile whose provider does not support `discoverModels` or whose discovery request fails
- **THEN** the UI SHALL NOT convert an already returned `verified` or `partial` connection result into a failed connection state
- **THEN** model discovery SHALL remain a separate action and status surface
