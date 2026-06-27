# App-local i18n boundary

## Current fact

UI localization is an `apps/app` surface concern. `createPluginHostShell()` reads
UXP `host.uiLocale`, normalizes it to `en` or `zh-CN` via
`apps/app/src/shared/locale.ts`, and passes it to `AppShell`. The typed message
catalog and React provider live in `apps/app/src/shared/ui/i18n/`.

## Why future development needs this

`packages/application`, `packages/core-engine`, and `packages/providers` must
not own UI copy or locale state. (The former `apps/cli` surface was removed;
its old tests are no longer relevant to this boundary.) UI still reaches
application behavior only through `AppServices.commands`; Photoshop/UXP IO stays
under adapters/shells.

## Copy policy

Translate UI actions, status labels, empty states, placeholders, toasts, and
tooltips. Keep provider/profile/model identifiers, `API Key`, `Base URL`, user
prompts, and provider/runtime raw error messages untranslated.

## How to verify

- `pnpm --filter @imagen-ps/app test` covers the locale normalization and i18n wiring.
- `pnpm check:policy` keeps i18n imports inside `apps/app`.
- Real Photoshop menu/panel label switching still requires manual UXP Developer
  Tool + Photoshop smoke evidence.
