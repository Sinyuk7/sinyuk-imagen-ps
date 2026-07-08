## Why

The current app-surface label rules treat catalog `displayName` as the default visible name across both model-configuration management and model-selection surfaces. That collapses distinct user-configured model instances with the same `baseModelId` into the same visible label, so users cannot reliably distinguish configs such as `nano-banana-fast` and `nano-banana-2-lite` once they leave the configuration editor.

The repo already separates config identity, capability identity, and wire identity at runtime. The UI now needs matching presentation rules so configuration pages stay readable, selection surfaces stay unambiguous, and catalog-only models still fall back to friendly names.

## What Changes

- Separate app-surface label presentation into two explicit modes: configuration-instance presentation and capability-preset presentation.
- Keep the model configuration list centered on the official preset label while surfacing the saved `modelId` and optional API format fact as supporting metadata.
- Change model-selection and active-model surfaces outside the model configuration page to show the user-configured `modelId` as the primary visible label when a saved config is involved.
- Preserve catalog `displayName` as the fallback label for non-user-configured, catalog-only model entries.
- Introduce shared app-surface helpers or viewmodels for model label presentation so settings, selectors, and status surfaces do not drift into page-specific rules again.

## Capabilities

### New Capabilities
- `model-label-presentation`: App-surface rules for presenting user-configured model instances versus catalog-only model capabilities across configuration, settings, and selection surfaces.

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/app/src/shared/ui/model-info.ts`, `apps/app/src/shared/ui/pages/model-configuration-page.tsx`, `apps/app/src/shared/ui/pages/settings-add-page.tsx`, `apps/app/src/shared/ui/pages/settings-detail-page.tsx`, `apps/app/src/shared/ui/pages/settings-page.tsx`, `apps/app/src/shared/ui/pages/main-page.tsx`, related settings-row styles, and any shared selector/viewmodel helpers that consume model labels.
- Affected UX surface: model configuration list, provider add/detail model selectors, settings provider summary rows, main composer selected-model label, and main model selector options.
- Affected tests: model configuration page UI tests, app-shell model selection tests, settings page/detail tests, and any shared helper coverage for label selection/fallback behavior.
- Runtime boundary preserved: provider dispatch, request strategy resolution, `baseModelId`, and `wireModelId` semantics stay unchanged; this change is presentation-only.
