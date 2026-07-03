Status: draft
Authority: current user authorization (2026-07-03)
Owner: `apps/app` settings-form redesign
Created: 2026-07-03

# Settings Form Unification

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`

Current code references:

- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/components/provider-billing-settings.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/styles/native-controls.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- `apps/app/src/shared/ui/styles/composer.ts`
- `apps/app/src/shared/ui/styles/responsive.ts`

Requirement reference from current user turn:

- The current problem is not horizontal layout and not the custom theme by itself.
- The main problem is that settings surfaces are rendered as equal-weight large dark blocks.
- Core configuration, helper copy, refresh actions, and destructive actions currently compete for the same attention.
- Provider settings and global generation settings should share one global design language.
- The plan must not start with risky global primitive rewrites or silently expand into composer redesign.

## Goal

Define and execute a safe settings-only form design system for `apps/app` so provider add/detail and global generation settings present clearer priority, denser desktop-panel rhythm, and safer action hierarchy without changing provider, application, runtime, or composer behavior.

## Non-goals

- No provider contract, billing contract, model-discovery contract, or command-semantics change.
- No composer visual migration in this Loop.
- No full theme replacement and no mandatory Adobe Spectrum component migration.
- No broad navigation redesign outside settings-like surfaces.
- No broad main-page, history, or result-card redesign.
- No new permanent documentation outside the approved high-authority set.
- No live-provider or paid-network validation.
- No Photoshop-host behavior changes.

## Scope

Allowed future implementation scope:

- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/components/text-select*.tsx`
- `apps/app/src/shared/ui/components/icon-select*.tsx`
- `apps/app/src/shared/ui/components/overlay-controls.tsx`
- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/components/provider-billing-settings.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/styles/native-controls.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- `apps/app/src/shared/ui/styles/responsive.ts`
- focused app tests and screenshot harness updates under `apps/app/tests/*`

Forbidden scope:

- `packages/application`
- `packages/core-engine`
- `packages/providers`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/styles/composer.ts`
- Photoshop / UXP host bridge behavior
- theme-source replacement unless a Decision Packet explicitly approves it
- changing shared primitive default styles globally without first proving settings-only isolation

## Ownership boundary

- `apps/app` owns settings-page layout, density, typography hierarchy, button hierarchy, surface depth, destructive-action presentation, and shared UI primitives.
- Shared UI must stay inside the UXP CSS contract already documented in `apps/app/AGENTS.md`.
- Provider, billing, and model-refresh behavior stay on their existing command boundaries.
- This Loop may reorganize how existing settings actions are presented, but not what those actions mean.
- Reusing shared primitives is allowed. Changing shared primitive global defaults is not the default move. Prefer settings-scoped variants or settings-scoped selectors unless Slice 0 proves a global change is safe.

## Baseline

Current repository facts from on-disk UI code:

- `native-controls.ts` sets `ui-textfield` and `ui-btn` to `min-height: 32px`, with shared default styling used outside settings.
- `pages.ts` gives `.section` a uniform `padding: 16px`, `.field` a uniform `margin-bottom: 12px`, and `.section-title` an `11px` semibold treatment.
- `ProviderProfileEditor` renders endpoint rows, endpoint toggles, API key, default model area, and test action inside one visually consistent dark-weight stack.
- `SettingsDetailPage` renders billing as an emphasized tinted card, uses full-width secondary buttons for billing refresh and model refresh, and places delete directly beside save in the sticky footer.
- `ProviderProfileEditor` expresses `Preferred` as a `Checkbox`, but the actual invariant still needs audit: `zero-or-one` vs `exactly-one`.
- `GlobalGenerationSettingsPage` already shares the same control primitives and sticky footer shape, but uses the same broad section weight and large field rhythm.
- `main-page` and `composer.ts` share some control primitives. They are part of the audit surface but not the implementation surface for this Loop.

Baseline validation before implementation claims:

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

If baseline validation fails, report whether the failure is pre-existing before attributing regressions to this Loop.

## Current-state diagnosis

The current settings surfaces over-index on one visual move: large, similarly weighted dark containers.

That creates five structural problems:

1. Core configuration fields, helper copy, diagnostics, refresh actions, and danger actions all read at nearly the same visual weight.
2. Vertical density is too loose for a Photoshop-preferences workflow. One screen shows too little actual configuration.
3. Typography hierarchy is too flat. Section title, subsection title, field label, metadata, and helper text are too close in size, contrast, or emphasis.
4. Action hierarchy is too flat. `Add endpoint`, `Refresh balance`, `Refresh model list`, and `Test connection` all present like large peer buttons.
5. Destructive actions are too close to primary persistence. `Save` and `Delete` currently share one footer row.

This Loop should treat those as structural problems, not as isolated styling tweaks.

## Acceptance contract

This Loop should use measurable targets instead of abstract adjectives.

Settings density target:

- normal field / select trigger height: `34px` to `38px`
- compact action height: `28px` to `32px`
- icon action size: `28px x 28px`
- label to control spacing: `6px`
- control to helper spacing: `4px` to `6px`
- field group spacing: `12px` to `16px`
- section separation: `20px` to `24px`
- endpoint repeated-row target height: approximately `104px` to `124px`

Typography target:

- page title: `18px` to `20px`
- section title: `14px` to `15px`
- row title / field label: `12px` to `13px`
- body / option text: `12px` to `13px`
- helper / metadata text: `11px` to `12px`

Footer / action contract:

- footer height target: `52px` to `60px` when present
- `Save` is the only primary action in the main persistence cluster
- no destructive action in the same action cluster as `Save`
- page bottom must keep enough scroll padding that controls are never obscured

Billing contract:

- available balance is the primary billing information
- used quota / secondary usage is lower-emphasis metadata
- last checked time is metadata
- refresh is a compact action, not a full-width heavy action
- loading / stale / unavailable use compact status expression
- billing account fields must not visually outweigh the balance summary

Secret field contract:

- label
- empty input ready for replacement
- saved-state meta such as `Access token saved`
- helper text such as `Leave blank to keep the saved token`
- do not render saved-secret guidance inside the input as if it were a value

Screenshot acceptance set:

- common panel width
- narrow panel width
- provider add with 1 endpoint
- provider detail with 2 endpoints
- provider detail with 4 endpoints
- billing available
- billing stale or loading
- endpoint validation or probe error

## Design target

### 1. Settings-scoped foundation, not global default rewrites

Implementation should start with settings-scoped variants or settings-scoped selectors such as:

- `SettingsForm`
- `SettingsSection`
- `SettingsField`
- `SettingsRow`
- `SettingsAction`
- `SettingsFooter`
- `SettingsDangerZone`

or equivalent scoped CSS like:

- `.settings-form .ui-btn`
- `.settings-form .ui-textfield`
- `.settings-form .cmp-select`

The guiding rule is:

- reuse primitives;
- do not silently convert primitive global defaults into settings defaults.

### 2. One explicit text hierarchy

Use one hierarchy across provider add/detail and global generation settings:

- page title;
- section title;
- subsection / repeated-row title;
- field label;
- body / option text;
- helper / metadata text.

### 3. One action hierarchy

All settings pages should use the same four action levels:

- primary persist: `Save`
- emphasized secondary: `Test connection`
- compact action: `Add endpoint`, `Refresh balance`, `Refresh model list`, copy actions
- destructive: endpoint removal and provider deletion

### 4. One surface hierarchy

- the page is the primary surface
- most sections are structural groups, not heavy nested cards
- exceptional content such as status summaries, notices, or danger zones may use stronger surface treatment
- repeated rows should rely on spacing, dividers, and metadata more than card stacking

### 5. Destructive-action rule

- provider deletion must be separated from the main save action cluster
- endpoint deletion stays local to the row it affects
- delete-provider UI should use explicit text labeling, not icon-only ambiguity

### 6. Preference-selection rule

Before replacing `Preferred` with radio-like interaction, audit the true invariant:

- if the rule is `exactly one`, use a radio-group contract
- if the rule is `zero or one`, do not replace it with standard radio without an explicit `None / Auto` path or another exclusive-but-clearable control

The Loop must not change preference semantics accidentally.

### 7. Sticky footer is not a fixed requirement

The fixed requirement is:

- `Save` and `Delete` are separated
- the persistence UI does not obscure content
- bottom scroll padding is sufficient

The Loop should not assume every settings page must keep a sticky footer. Slice work may keep, remove, or conditionalize sticky behavior per page if the acceptance contract is met.

## Slice 0: Source audit and usage matrix

Goal:

Audit the real usage and risk surface before any primitive or CSS changes.

Allowed scope:

- read-only analysis across current settings and composer usage
- no source edits

Required outputs:

- real usage matrix for `ui-textfield`, `ui-btn`, checkbox, select, section, and footer patterns
- which styles are settings-only vs shared with composer / main page
- which provider add, provider detail, and global settings DOM structures are actually shared
- all current full-width button call sites and their operation semantics
- theme token to actual text / border / surface usage map for relevant settings controls
- current Chrome vs UXP divergence notes for the touched control families, if already evidenced
- which CSS is removable debt vs necessary UXP workaround
- explicit allow / block matrix for global modification risk, for example:

```text
| Primitive / Class | Provider | Global Settings | Composer | Allow global modification |
|-------------------|---------:|----------------:|---------:|---------------------------|
| .ui-btn           | yes      | yes             | yes      | no; variant or scope only |
| .section          | yes      | yes             | no       | yes, if audit proves safe |
| .ui-checkbox      | yes      | yes             | maybe    | audit first               |
```

Slice 0 audit result:

### Primitive / class usage matrix

| Primitive / Class | Provider Add / Detail | Global Settings | Composer / Main Page | Audit result |
|-------------------|-----------------------|-----------------|----------------------|--------------|
| `.ui-btn` / `Button` | yes | yes | yes (`main-page` retry / action usage) | no global default rewrite; settings variant or scope only |
| `.ui-textfield` / `TextField` | yes | no direct text inputs on current page, but shared primitive remains global | no current composer usage | safe only under settings scope; do not assume global-only reach |
| `.ui-checkbox` / `Checkbox` | yes | no current checkbox on global generation page | no current composer usage found | settings-focused changes possible, but primitive still shared and tested globally |
| `.cmp-select` / `TextSelect` | yes | yes | yes | no global trigger-height or spacing rewrite without settings scoping |
| `.section` | yes | yes | no | allowed candidate for settings/global scoped refinement |
| `.field` | yes | yes | no | allowed candidate for settings/global scoped refinement |
| `.det-footer` | yes | yes | no | allowed candidate for settings/global scoped refinement |
| `.btn-save` | yes | yes | no | settings-only action cluster styling is safe |
| `.btn-del` / `.btn-del-host` | detail only | no | no | safe to redesign within settings detail only |
| `.test-btn.ui-button-block` | yes | detail only | no | local settings action treatment candidate |
| `.field-input-affordance` | yes | yes (path copy rows) | no | safe candidate for settings-scoped refinement |
| `.provider-model-select` | yes | billing mode also reuses same select style | no | provider/settings-only safe with care |
| `.settings-select` | no | yes | no | global settings-specific safe |

### DOM structure audit

- Provider add and provider detail share the same `ProviderProfileEditor` structure for alias, endpoints, API key, default model group, and test action.
- Provider add and provider detail both inject billing through `ProviderBillingSettings`, but detail adds the stronger billing summary card plus refresh action and status text.
- Global generation settings shares `section`, `field`, `TextSelect`, `field-input-affordance`, `det-footer`, and `btn-save`, but does not share provider endpoint rows, test area, or billing DOM.
- Composer shares `Button`, `TextSelect`, overlay trigger machinery, and select menu classes, but not `section`, `field`, `det-footer`, endpoint rows, or billing structure.

### Full-width button audit

Current full-width or block-like settings actions found in code:

- `provider-test-button` in `ProviderProfileEditor`
- `provider-billing-refresh-button` in `SettingsDetailPage`
- `provider-refresh-models-button` in `SettingsDetailPage`
- `provider-save-button` in `SettingsAddPage`
- `provider-save-button` in `SettingsDetailPage`
- `global-settings-save-button` in `GlobalGenerationSettingsPage`

Operation semantics:

- `Save` is primary persistence
- `Test connection` is validation / emphasized secondary
- `Refresh balance` is support / compact action candidate
- `Refresh model list` is support / compact action candidate

Audit conclusion:

- only `Save` deserves full primary emphasis by default
- `Test connection` may stay visually stronger than utility actions, but should not stay in the same heavy style family as `Save`
- `Refresh balance` and `Refresh model list` should move out of the current full-width heavy action pattern

### Preferred invariant audit

Evidence from `normalizeProviderConnectionDraft()` and current tests:

- in `manual` mode, normalization attempts to keep a preferred enabled endpoint
- if the saved preferred endpoint is missing or disabled, normalization picks the first enabled endpoint
- if no enabled endpoint exists, `preferredEndpointId` may be omitted
- UI checkbox handling does not provide a true explicit clear path for preferred selection; unchecking a checked preferred row preserves the existing preferred id
- switching to `auto` removes `preferredEndpointId`; switching back to `manual` restores the current preferred or the first enabled endpoint

Audit conclusion:

- the current invariant is not strict `exactly-one` across all states
- the current state is closer to `zero-or-one when nothing enabled`, otherwise effectively `one preferred enabled endpoint in manual mode`
- replacing the current control with standard radio without a contract decision would be unsafe

### Token to visual-usage audit

Current dark-theme values from generated theme CSS:

- `--app-color-background-base`: `#10131A`
- `--app-color-background-layer-2`: `#1D2027`
- `--app-color-background-elevated`: `#272A31`
- `--app-color-border-default`: `#414754`
- `--app-color-border-strong`: `#8B909F`
- `--app-color-text-secondary`: `#C1C6D6`
- `--app-color-text-muted`: `#8B909F`
- `--app-color-accent-default`: `#ACC7FF`
- `--app-color-negative`: `#FFB4AB`

Relevant contrast spot-checks against current dark surfaces:

- `text-secondary` on `background-layer-2`: about `9.56`
- `text-muted` on `background-layer-2`: about `5.11`
- `text-muted` on `background-base`: about `5.83`
- `negative` on `background-base`: about `10.94`

Audit conclusion:

- the core dark token pairings are not intrinsically low-contrast by default
- the main hierarchy problem is not raw token illegibility alone; it is overuse of the same dark-surface treatment plus too many peer-emphasis blocks
- `negative` is visually strong enough numerically, but current delete placement still creates action-cluster risk

### UXP evidence / limitation audit

- Photoshop UXP target is reachable through `node scripts/uxp-debug/uxp-debug.mjs targets --plugin-id com.imagen-ps.panel`
- current host evidence proves Photoshop `27.7.0` and UXP `9.3.0` are available for later validation
- live page-state DOM probe for the currently visible settings page was not captured during this Slice 0 audit
- existing repository comments and overlay-control implementation confirm real UXP-specific control workarounds already exist, especially for button/icon rendering and textarea stability

Known UXP-specific control constraints already evidenced in source:

- `OverlayControlShell` exists because button-contained SVG can collapse in Photoshop UXP
- `UxpTextArea` remains a custom seam because the current wrapper/runtime combination does not provide a stable textarea contract across Chrome and UXP
- `responsive.ts` already applies settings-page-specific adjustments for compact and short panel modes

Audit conclusion:

- any change to button, select trigger, checkbox/radio, focus, footer, or input presentation must preserve existing UXP workarounds
- Slice 1 must validate foundational controls in real UXP, not only Chrome

### Deletion / keep audit

Likely safe settings-only refactor targets:

- `.section`
- `.field`
- `.det-footer`
- `.settings-detail-footer-inner`
- `.test-area`
- `.provider-endpoint-*`
- `.billing-*`
- `.settings-select`
- `.provider-model-select`

Do not treat as deletable or globally mutable without extra proof:

- `.ui-btn`
- `.ui-textfield`
- `.cmp-select`
- overlay button host / overlay classes
- `UxpTextArea`
- compact-square icon button constraints

Validation:

- no code changes
- audit output only

Stop rule:

Stop implementation planning and produce a Decision Packet if the audit cannot isolate a settings-only foundation without high-confidence composer/global primitive regression risk.

## Slice 1: Settings-scoped primitives, variants, and tokens

Goal:

Define a settings-scoped density, text, surface, and action contract in reusable variants and shared CSS without changing primitive global defaults by default.

Allowed scope:

- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/components/text-select*.tsx`
- `apps/app/src/shared/ui/components/icon-select*.tsx`
- `apps/app/src/shared/ui/components/overlay-controls.tsx`
- `apps/app/src/shared/ui/styles/native-controls.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- focused tests for shared controls

Explicit constraint:

- do not modify `main-page` or `composer.ts`
- do not change shared primitive default appearance globally unless Slice 0 explicitly proves the change is isolated and safe

Validation:

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test -- native-controls text-select composer-select
```

Manual-only:

Photoshop UXP probe for foundational controls:

- input
- checkbox
- radio or radio-like preferred control
- button
- select
- focus ring

Stop rule:

Stop and produce a Decision Packet if the settings contract requires unsupported UXP CSS features, a theme-source rewrite, or global primitive default changes that Slice 0 did not clear.

## Slice 2: Provider add/detail structural rewrite

Goal:

Apply the settings contract to provider add/detail with endpoint compaction, model-group consolidation, billing restructuring, and save/delete hierarchy cleanup.

Allowed scope:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/components/provider-billing-settings.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- related shared CSS and focused tests

Required outcomes:

- endpoint rows become the tightest repeated operational unit
- billing account fields are visually subordinate to balance
- refresh balance becomes a compact action
- model select, custom-model toggle, and refresh model list form one coherent group
- `Save` and delete-provider no longer share one action cluster
- secret field follows the explicit DOM/state contract
- `Preferred` behavior is updated only after invariant audit

Validation:

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test -- settings-detail settings-add billing
```

Slice 2 execution result:

- `ProviderProfileEditor` now keeps API key saved-state guidance outside the input placeholder and reduces `Test connection` to an emphasized secondary action instead of a full-width peer to `Save`.
- `ProviderBillingSettings` now keeps saved-token state in explicit metadata/helper text, with an empty replacement input instead of placeholder-as-state.
- `SettingsDetailPage` now promotes billing balance summary above billing account fields, converts balance/model refresh to compact inline actions, and moves provider deletion into a separate bottom danger zone.
- `SettingsAddPage` now aligns billing heading/footer structure with the same settings hierarchy and keeps model helper copy out of the previous equal-weight block treatment.

Validation result:

- `pnpm check:policy`: passed
- focused file validation passed:

```bash
pnpm --filter @imagen-ps/app exec vitest run \
  tests/settings-detail-profile-editing.test.tsx \
  tests/settings-detail-billing.test.tsx \
  tests/settings-detail-connectivity.test.tsx \
  tests/settings-detail-model-list.test.tsx \
  tests/settings-detail-optimizer.test.tsx \
  tests/settings-add-page.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/native-controls.test.tsx
```

Known validation blockers outside this Slice:

- `pnpm --filter @imagen-ps/app build` currently fails on pre-existing TypeScript baseline error in `apps/app/src/shared/domain/task-actions.ts:160` (`record` declared but unused)
- broad keyword-based `vitest` invocations can still pull unrelated suites; a current unrelated failure also exists in `tests/main-page-result-rendering.test.tsx`
- real Photoshop UXP visual proof is still pending because the host target became unavailable again during this session

Manual-only:

Photoshop UXP screenshot or equivalent real-host visual proof for provider detail:

- normal width
- narrow width
- scroll middle
- scroll bottom
- focus state
- checkbox / radio state
- select open state
- sticky or non-sticky footer state, whichever the slice chooses

Stop rule:

Stop if the rewrite needs provider/application schema changes, if the preferred-endpoint invariant is ambiguous, or if destructive-action behavior needs product confirmation beyond visual treatment.

## Slice 3: Global generation settings harmonization

Goal:

Apply the same settings-form contract to global generation settings without broad navigation changes.

Allowed scope:

- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- related shared CSS and focused tests

Required outcomes:

- shared density and heading hierarchy match provider settings
- storage path copy affordances are compact and secondary
- footer treatment meets the acceptance contract without assuming stickiness

Validation:

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test -- global-generation
```

Slice 3 execution result:

- `GlobalGenerationSettingsPage` now uses the same settings hierarchy as provider settings: section heading first, short intro/helper second, controls third.
- storage paths now read as secondary operational metadata instead of peer-weight primary form cards.
- raw path/error text blocks were replaced with the shared inline `StatusNotice` treatment for settings-state consistency.
- save footer remains primary-only and aligned with the same settings footer contract.

Validation result:

- `pnpm check:policy`: passed
- focused file validation passed:

```bash
pnpm --filter @imagen-ps/app exec vitest run \
  tests/global-generation-settings-page.test.tsx \
  tests/settings-add-page.test.tsx \
  tests/native-controls.test.tsx
```

Known validation blockers still unchanged:

- real Photoshop UXP visual proof is still pending because host target availability regressed during this session

Post-Slice 3 note:

- a follow-up review caught one Slice 3 copy bug: the storage helper had briefly reused `pathInfoUnavailable`, which incorrectly suggested failure even when paths were available
- fixed by introducing dedicated `storageGroupHint` copy in `apps/app/src/shared/ui/i18n/messages.ts`
- consolidated settings-focused validation still passes after that fix:

```bash
pnpm --filter @imagen-ps/app exec vitest run \
  tests/settings-detail-profile-editing.test.tsx \
  tests/settings-detail-billing.test.tsx \
  tests/settings-detail-connectivity.test.tsx \
  tests/settings-detail-model-list.test.tsx \
  tests/settings-detail-optimizer.test.tsx \
  tests/settings-add-page.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/native-controls.test.tsx
```

Final app-baseline verification update:

- `pnpm --filter @imagen-ps/app build`: passed
- targeted regression suites that had failed earlier in-session now pass:

```bash
pnpm --filter @imagen-ps/app exec vitest run tests/bundle/uxp-dist-bundle.test.ts
pnpm --filter @imagen-ps/app exec vitest run tests/main-page-result-rendering.test.tsx
```

- consolidated settings + baseline regression check now passes:

```bash
pnpm --filter @imagen-ps/app exec vitest run \
  tests/settings-detail-profile-editing.test.tsx \
  tests/settings-detail-billing.test.tsx \
  tests/settings-detail-connectivity.test.tsx \
  tests/settings-detail-model-list.test.tsx \
  tests/settings-detail-optimizer.test.tsx \
  tests/settings-add-page.test.tsx \
  tests/global-generation-settings-page.test.tsx \
  tests/native-controls.test.tsx \
  tests/bundle/uxp-dist-bundle.test.ts \
  tests/main-page-result-rendering.test.tsx
```

Current remaining blocker:

- real Photoshop UXP visual proof is still unavailable because `node scripts/uxp-debug/uxp-debug.mjs targets --plugin-id com.imagen-ps.panel` returns `[]`

Manual-only:

- Chrome screenshot acceptance for the page
- Photoshop UXP verification is still required at final validation, but this slice may use Chrome as the primary iterative harness if it does not introduce new CSS capability risk

Stop rule:

Stop if the page starts to require a broader providers/settings navigation redesign rather than form-language unification.

## Validation

Quick:

```bash
pnpm --filter @imagen-ps/app build
```

Per-slice:

- focused `@imagen-ps/app` test runs for touched controls/pages
- screenshot harness review for provider add/detail/global settings states
- Slice 1 foundational UXP probe
- Slice 2 full provider-detail UXP visual proof

Final:

```bash
pnpm --filter @imagen-ps/app test
pnpm check:policy
```

Manual-only final acceptance:

Photoshop UXP must include:

- normal width
- narrow width
- scroll middle
- scroll bottom
- focus state
- checkbox / radio state
- select open state
- sticky or non-sticky footer state

Chrome screenshot harness may cover regression, but it does not replace final UXP visual acceptance.

Live-provider:

- none by default

## Follow-up loop, not this loop

After provider settings and global settings stabilize, open a separate small Loop for:

- composer control visual alignment

Composer is an audit dependency here, not an implementation target here.

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- the audit cannot isolate settings-specific styling safely
- the desired compactness conflicts with the documented UXP CSS contract
- current semantic tokens cannot express the needed hierarchy without a broader theme-source change
- the preferred-endpoint invariant is unclear between `zero-or-one` and `exactly-one`
- provider-level deletion needs product confirmation on confirmation-dialog behavior, not just placement
- a requested visual change depends on package-boundary changes outside `apps/app`

## Completion report

After executing a slice, report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory note candidate

Yes: `workflow`, if the settings-scoped contract becomes stable enough to document as an `apps/app` UI rule after implementation.
