Status: draft
Authority: current user request; root `AGENTS.md` still declares Active Loop: none
Owner: `apps/app` settings surface with a bounded `packages/application` profile-schema change
Created: 2026-07-05

# Prompt Settings

## Context docs

- `AGENTS.md`: current-state, harness-first loop contract; no active loop.
- `docs/agent/LOOP.md`: Loop metadata, scope, validation, and stop rules.
- `docs/TESTING.md`: mock-only development gates; `pnpm --filter @imagen-ps/app test`, `pnpm --filter @imagen-ps/application test`, and final `pnpm validate`.
- `apps/app/AGENTS.md`: i18n boundary, UXP CSS contract, app storage/adapter ownership, Chrome/UXP app commands.
- `docs/ENGINEERING_CONTEXT.md`: module ownership, UXP data-folder persistence, Chrome IndexedDB-style storage, provider profile persistence current state.

Narrow current-state probes:

- `apps/app/src/shared/ports/app-generation-settings.ts` defines the existing app-settings store shape.
- `apps/app/src/shared/ports/app-services.ts` injects app-local stores into UI.
- `apps/app/src/adapters/uxp/uxp-generation-settings-store.ts` and `apps/app/src/adapters/chrome/indexed-db-storage.ts` show storage adapter patterns.
- `apps/app/src/shared/ui/pages/settings-page.tsx`, `global-generation-settings-page.tsx`, `settings-add-page.tsx`, `settings-detail-page.tsx`, and `components/provider-profile-editor.tsx` own current settings UI.
- `packages/application/src/commands/types.ts` and `provider-profiles.ts` own provider profile input/output contracts.

## Goal

Add persisted Prompt Settings configuration and Profile system instructions settings, with localized UXP-safe settings UI and viewmodel tests, while leaving main-page prompt execution and provider request mapping unchanged.

Observable outcome:

- Configuration page title replaces Providers.
- Configuration page has persistent rows for Generation Settings and Prompt Settings, then Provider Profiles below.
- Prompt Settings page reads/writes one app prompt-settings root object, initializes defaults to durable storage once, separates template validity from activation state, and edits prompt optimization plus prompt presets.
- Add/Edit Profile forms expose shared multiline `System instructions` textarea persisted as `ProviderProfile.systemInstruction`.

## Non-goals

- No main-page prompt preset dropdown.
- No main-page Optimize Prompt behavior.
- No provider transport/request mapping for `systemInstruction`.
- No live provider call, Photoshop host smoke, or UDT manual proof.
- No regex preset mode.
- No preset copy action.
- No migration of legacy provider-profile records beyond accepting missing `systemInstruction`.

## Scope

Allowed:

- `packages/application/src/commands/types.ts`
- `packages/application/src/commands/provider-profiles.ts`
- focused `packages/application/src/**/*.test.ts` for profile contract.
- `apps/app/src/shared/ports/` prompt settings types/store port.
- `apps/app/src/adapters/uxp/` prompt settings JSON store.
- `apps/app/src/adapters/chrome/` prompt settings IndexedDB/memory storage.
- `apps/app/src/composition/chrome/`, `apps/app/src/shells/uxp/`, and app-service wiring.
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/src/shared/ui/hooks/` prompt settings viewmodel hook.
- `apps/app/src/shared/ui/pages/` settings pages/routes for Configuration, Prompt Settings, and preset detail.
- `apps/app/src/shared/ui/components/` only for shared provider profile editor section or existing setting controls.
- `apps/app/src/shared/ui/styles/` only if needed for settings-page classes using existing tokens.
- focused `apps/app/tests/` settings/storage/profile tests.

Forbidden:

- `packages/providers/**`
- `packages/core-engine/**`
- provider dispatch/request builders, except type-only compatibility forced by `ProviderProfile`.
- main-page workflow behavior, composer prompt transformation, or optimize button execution.
- UXP host Photoshop DOM/BatchPlay code.
- durable docs outside this Loop unless completion finds a reusable architecture decision.

## Ownership Boundary

- `packages/application`: owns the `ProviderProfile` / `ProviderProfileInput` top-level optional `systemInstruction` contract and save/list/get behavior. It must not know UI copy, locale, browser storage, UXP, or React.
- `apps/app/src/shared/ports`: owns prompt-settings storage contract and normalization as an app-local surface setting.
- `apps/app/src/adapters/uxp`: owns real UXP JSON persistence under `localFileSystem.getDataFolder()`.
- `apps/app/src/adapters/chrome`: owns real Chrome IndexedDB persistence and memory fallback/harness storage.
- `apps/app/src/shared/ui`: owns Configuration UI, Prompt Settings viewmodel, validation display, and localization.
- Provider layer does not own this slice.

## Baseline

Before implementation, run:

- `pnpm check:policy`
- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`

If either baseline fails before edits:

- Record the failing command and first relevant failure.
- Continue only if failures are clearly unrelated to this slice.
- Stop with Decision Packet if baseline blocks attribution for touched areas.

Current repository status note:

- Existing user changes are present in `apps/app/src/shared/ui/i18n/messages.ts`, `apps/app/src/shared/ui/pages/main-page.tsx`, and app tests. Do not revert them. Re-read touched files before editing and work with user changes.

## Slices

### 1. Profile system instruction contract

Goal:

- Add optional top-level `systemInstruction?: string` to provider profile input/output, saved through existing profile commands.

Product contract:

- Add Profile with an empty value saves no field.
- Edit Profile with a cleared value deletes any saved value.
- All-whitespace strings normalize to no field.
- Non-empty instructions preserve newlines and meaningful leading/trailing spaces; do not trim the whole body before saving.
- Legacy profile records missing the field read normally.

Allowed scope:

- `packages/application/src/commands/types.ts`
- `packages/application/src/commands/provider-profiles.ts`
- focused provider-profile command tests.
- app profile-save call sites only as needed to pass the new optional field through.

Validation:

- `pnpm --filter @imagen-ps/application test`

Acceptance tests:

- Add Profile round-trips `systemInstruction`.
- Edit Profile updates `systemInstruction`.
- Edit Profile clearing the textarea removes `systemInstruction`.
- Legacy records without `systemInstruction` read normally.
- list/get/save preserve `systemInstruction`.
- Updating `systemInstruction` does not alter endpoint config, secret refs, billing config, or cached model fields.

Stop rule:

- Stop if preserving `systemInstruction` requires provider request builders or `packages/providers` changes.

### 2. Prompt settings data contract and real stores

Goal:

- Add a single prompt-settings root-object data source with pure normalization and real UXP/Chrome persistence. Adapters read/write only; they do not own product defaults.

Data contract:

```ts
type PromptSettings = {
  optimization: {
    profileId: string | null;
    template: string;
  };
  presets: {
    selectedId: string | null;
    items: PromptPreset[];
  };
};
```

- Optimization does not have its own entity ID or repository.
- Presets have stable IDs because selection, rename, and delete target IDs.
- Selection is by stable ID, not name.
- Preset names may duplicate; UI must not key selection by name.

Product contract:

- Prompt optimization:
  - profile selection can be `none`.
  - template defaults to a real stored root object value when the whole root record is first created.
  - template validation requires exactly one lowercase `{prompt}`; `{Prompt}` does not count.
- Presets:
  - selected preset defaults to `none`.
  - first-created root record includes one cinematic preset.
  - modes are `prepend`, `append`, and `replace`.
  - replace requires exactly one lowercase `{prompt}`; `{Prompt}` does not count.
  - prepend/append do not validate `{prompt}`.
  - deleting the currently selected preset sets `selectedId` to `null`.
  - deleting an unselected preset does not change `selectedId`.
  - renaming a preset preserves selection because selection is by ID.
  - deleting the selected preset does not auto-select another preset.

Normalization contract:

- Pure normalization repairs structure, missing fields, and dangling preset selection references only.
- Empty preset list is legal and must round-trip.
- `selectedId = null` is legal and must round-trip.
- Invalid templates are preserved exactly because invalid configuration can be saved.
- User-authored template/preset text is not rewritten.
- Do not seed the cinematic preset when `items` is empty; seed only when the whole prompt-settings root record is missing.

Allowed scope:

- `apps/app/src/shared/ports/prompt-settings.ts`
- `apps/app/src/shared/ports/app-services.ts`
- UXP and Chrome storage adapters.
- shell/composition wiring.
- focused store normalization tests.

Acceptance tests:

- Missing root record writes defaults once.
- Second load does not write defaults again.
- User deletes all presets; next load does not re-seed cinematic.
- Missing root record can be detected distinctly from an existing record.
- Empty preset list and `selectedId = null` round-trip.
- Deleting the selected preset clears selection; deleting an unselected preset does not.
- Renaming a preset keeps selection by ID.
- Chrome production IndexedDB failures do not silently fall back to memory.

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- Stop if UXP persistence needs a storage API not already used by existing app adapters, unless verified against repo docs/source.

### 3. Prompt Settings viewmodel and first-load initialization

Goal:

- Add a UI-facing viewmodel/hook or load service that loads profiles and prompt settings, creates durable defaults only when the whole root record is missing, saves user edits, and computes validity/activation state without blocking save.

Initialization contract:

- Load flow: read store -> normalize -> if root record was missing, write default root once.
- React remounts must not duplicate initialization.
- User-deleted empty preset lists must not be re-seeded.
- If the saved optimization profile ID no longer exists after profile list load, reset it to `null` and persist once.

Derived state contract:

- Prompt optimization exposes `templateValid: boolean`.
- Prompt optimization exposes `activationState: 'active' | 'no-profile' | 'invalid-template' | 'missing-profile'`.
- A valid template with profile `none` is valid but inactive, not a template error.
- A missing saved profile is inactive and must be surfaced as `missing-profile` before persistence clears it.
- Presets expose separate selected state, content validity, and effect state.
- Invalid settings remain saveable.

Allowed scope:

- `apps/app/src/shared/ui/hooks/`
- `apps/app/tests/` focused hook/viewmodel tests.
- shared test fakes.

Acceptance tests:

- `{prompt}` appears zero, one, and two times.
- `{Prompt}` is not accepted.
- Profile `none` with a valid template is valid and inactive.
- Missing profile ID becomes `missing-profile`, then persists as `null`.
- Invalid optimization and preset settings can still be saved.
- Preset modes follow `prepend` / `append` / `replace` contracts.
- Current selected preset, preset content validity, and effect state are derived separately.

Validation:

- `pnpm --filter @imagen-ps/app test`

Stop rule:

- Stop if the viewmodel needs to perform prompt transformation used by main-page runtime. This slice only stores and validates settings.

### 4. Configuration and Prompt Settings UI

Goal:

- Update settings navigation and add localized Prompt Settings pages using existing Provider detail design tokens and settings form style.

UI contract:

- Settings home title: `Configuration` / `配置`.
- Persistent rows: Generation Settings and Prompt Settings, then Provider Profiles below.
- Prompt Settings row uses pencil icon.
- Prompt Settings page contains Prompt Optimization and Prompt Presets.
- Prompt Optimization shows profile dropdown with `None` / `无`, template textarea, template validity status, and activation hint.
- Status text must include a reason; do not rely on red/green color alone.
- Valid template with `None` profile shows valid template plus neutral "select a profile to enable" state.
- Prompt Presets uses compact list.
- Clicking row body or pencil icon opens the preset edit page.
- Trash icon deletes.
- Add icon opens a new-preset page.
- Icon operations have tooltip and `aria-label`.
- Preset edit page uses name, mode selection, content textarea, and green/red status for replace mode.
- Save is allowed when status is red; status only determines whether future runtime should activate the setting.
- Deleting the selected preset returns UI selection to `None`.
- Keep row selection and edit navigation as distinct concepts.

Allowed scope:

- `apps/app/src/shared/ui/pages/`
- `apps/app/src/shared/ui/components/`
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/src/shared/ui/styles/` if needed; use existing tokens and UXP CSS contract.
- focused React tests.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy` if CSS/i18n/package boundary files changed.

Acceptance tests:

- Configuration page order is fixed: Generation Settings, Prompt Settings, Provider Profiles.
- Prompt Settings row uses pencil icon.
- Prompt Settings selection and editing are distinct interactions.
- Deleting the selected preset returns UI selection to `None`.
- Invalid status includes text reason, not only color.
- Save remains available when optimization or selected preset is invalid.

Stop rule:

- Stop if UI needs main-page prompt execution, preset application, or provider calls to satisfy visible behavior.

### 5. Shared Profile editor UI

Goal:

- Add shared `System instructions` field to Add Profile and Edit Profile through the common provider profile editor layer.

UI contract:

- Label: `System instructions`.
- Hint: `Optional tone and style instructions for the model`.
- Control: multiline textarea, not a single-line input.
- Chinese localization provided in `apps/app/src/shared/ui/i18n/messages.ts`.
- Field persists as top-level `ProviderProfile.systemInstruction`.

Allowed scope:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- app tests for add/edit profile forms.

Validation:

- `pnpm --filter @imagen-ps/app test`

Acceptance tests:

- Add Profile and Edit Profile both render the shared `System instructions` textarea.
- Saving from Add/Profile Edit passes the same `systemInstruction` field shape to commands.
- Clearing the textarea in Edit removes the saved value.

Stop rule:

- Stop if sending `systemInstruction` through provider execution becomes necessary. This slice only persists the field.

### 6. Final integration and gates

Goal:

- Verify all touched owners together and report remaining runtime boundaries.

Validation:

- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy`
- `pnpm validate`

Stop rule:

- If final `pnpm validate` fails outside touched areas, report the first unrelated failure and focused pass evidence instead of broad refactors.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`

Final:

- `pnpm validate`

Manual-only:

- Optional Photoshop/UXP visual smoke through UDT if the user asks.
- This Loop introduces a new UXP JSON settings file/key and composition wiring, but no new Photoshop host API.
- If no manual smoke is run, completion must say: "No new Photoshop host API was introduced. Real-host persistence was not manually verified in this Loop; implementation follows the existing UXP data-folder adapter pattern."

Live-provider:

- Not applicable. No live provider calls or request mapping are in scope.

## Decision Packet triggers

Produce an A/B/C Decision Packet and stop if:

- Prompt settings persistence cannot be implemented with existing UXP data-folder file APIs or Chrome IndexedDB-style storage.
- `systemInstruction` top-level profile persistence creates a package boundary conflict.
- The UI cannot share the provider add/edit instruction field without duplicating logic or making risky unrelated refactors.
- Prompt-settings initialization cannot distinguish a missing root record from a user-authored empty preset list.
- Dangling profile references cannot be cleared without introducing cross-module profile-delete listeners or provider workflow changes.
- Existing user changes in touched files conflict with the required route or i18n changes.
- Validation requires real Photoshop or live provider evidence to claim behavior.
- Main-page execution or provider request mapping becomes necessary to satisfy acceptance.

## Completion report

Executor must report:

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

Default: `no`.

Candidate `yes: architecture` only if implementation establishes a reusable app-local settings persistence pattern beyond existing generation settings.

Candidate `yes: decision` only if the user confirms `systemInstruction` top-level profile persistence or prompt settings activation semantics should become canonical in `docs/ENGINEERING_CONTEXT.md`.
