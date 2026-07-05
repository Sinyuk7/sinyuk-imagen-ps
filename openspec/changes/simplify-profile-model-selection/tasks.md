## 1. Profile model selection simplification

- [x] 1.1 Remove discovery-driven model UI branches and secondary model sections from `SettingsAddPage` and `SettingsDetailPage`.
- [x] 1.2 Rename the primary model field semantics and UI copy from `Default model` to the current selected model for the profile.
- [x] 1.3 Change profile model option sourcing so both add/detail pages use only compatible saved `UserModelConfig` entries.
- [x] 1.4 Add empty-state `StatusNotice` and direct create-model-config actions for profiles with no selectable models.

## 2. Profile-to-config creation flow

- [x] 2.1 Extend profile-originated navigation seed data so `ModelConfigurationPage` can distinguish add/detail/standalone entry.
- [x] 2.2 Prefill `ModelConfigurationPage` from source profile context when opened from a profile page.
- [x] 2.3 After saving a profile-originated model config, navigate back to the source profile page and refresh model selector options.

## 3. Legacy discovery path deactivation

- [x] 3.1 Remove `discoverModels` / `refreshDraftProfileModels` / `refreshProfileModels` from settings/profile UI primary flows while leaving lower layers intact.
- [x] 3.2 Mark remaining discovery-related application/provider surfaces as deprecated or internal-only in local code comments and documentation where appropriate.

## 4. Verification

- [x] 4.1 Add or update app tests for add-page empty state, detail-page empty state, and profile model selector sourcing.
- [x] 4.2 Add or update app tests for profile-originated model-config creation, save, return navigation, and selector refresh.
- [x] 4.3 Re-run affected settings/model-configuration test suites and confirm no remaining UI references to removed discovery concepts.
