# App-local i18n boundary

- Context: `apps/app` supports Photoshop internal display as `Imagen` while the external product/repo naming may remain `Imagen PS`.
- Decision: UXP/React localization is owned by `apps/app` as a surface concern. `createPluginHostShell()` reads UXP `host.uiLocale`, normalizes it to `en` or `zh-CN`, and passes it to `AppShell`.
- Implementation: `apps/app/src/ui/i18n/` contains the typed message catalog and React provider. `apps/app/src/shared/locale.ts` contains locale normalization shared by host shell and tests.
- Boundary: application/session, core-engine, providers, and CLI do not own UI copy or locale state. UI still calls application behavior only through `AppServices.commands`; Photoshop/UXP IO stays under `src/host/` or injected adapters.
- Copy policy: translate UI actions, status labels, empty states, placeholders, toasts, and tooltips. Keep provider/profile/model identifiers, `API Key`, `Base URL`, user prompts, and provider/runtime raw error messages unchanged.
- Validation: `pnpm validate` covers app build, app tests, and policy checks. Real Photoshop menu/panel label switching still requires UXP Developer Tool + Photoshop manual smoke evidence.
