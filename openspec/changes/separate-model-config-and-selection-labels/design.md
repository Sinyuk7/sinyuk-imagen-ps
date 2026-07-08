## Context

The repo already models three distinct identities for image models at runtime: saved config identity (`modelId`), capability identity (`baseModelId` / catalog preset), and wire identity (`wireModelId`). The current app surface does not preserve that separation when rendering labels. Shared helpers in `apps/app/src/shared/ui/model-info.ts` default to catalog `displayName`, and several pages reuse those helpers for configuration management, profile selection, settings summaries, and the main composer selector.

That reuse is acceptable for catalog-only entries but breaks down for user-configured model instances. Multiple saved configs can legitimately share one `baseModelId` while differing in `modelId` and `wireModelId`. When those entries all render with the same preset `displayName`, users cannot tell which config they are selecting outside the model configuration editor.

The change is cross-cutting within `apps/app` because the same label rule is used by the model configuration list, provider add/detail selectors, settings summaries, and main-page model controls. The runtime/application/provider layers already have the data needed for correct presentation, so the design should stay inside the app surface and avoid new persistence or dispatch contracts.

## Goals / Non-Goals

**Goals:**
- Preserve a clear distinction between configuration-instance identity and capability-preset identity in app-surface labels.
- Keep the model configuration list anchored on preset-friendly naming while exposing the saved config identity needed to distinguish entries that share a preset.
- Make model selection surfaces outside the model configuration page use `config.modelId` as the primary visible label for saved configs.
- Preserve friendly `displayName` fallback for catalog-only entries that do not come from a saved user config.
- Centralize label/viewmodel logic so future model-label changes are mode-specific rather than page-specific.

**Non-Goals:**
- No changes to `UserModelConfig`, provider profile persistence, request strategy resolution, or provider dispatch.
- No new alias/display-name field for user-defined model configs in this slice.
- No redesign of the model configuration editor fields or save semantics.
- No changes to catalog rule matching, `baseModelId`, or `wireModelId` meaning.

## Decisions

### Decision: Split app-surface model presentation into explicit modes
The app surface will stop using one generic “visible label” rule for every page. Instead it will introduce mode-specific presentation helpers or viewmodels:

- **Capability-preset presentation** for catalog-oriented management surfaces
- **Configuration-instance presentation** for user selection surfaces

This is preferable to extending the existing `displayName-first` helper because the ambiguity is semantic, not just fallback ordering. A single helper with more branches would keep mixing two different user intents and make later fixes fragile.

Alternative considered:
- **Keep one helper and add more fallback conditions**: rejected because it would still hide the distinction between saved config identity and preset identity, and page authors would keep picking the wrong helper by accident.

### Decision: Keep the model configuration list title on preset `displayName`
The model configuration page remains a preset-oriented management surface. Each row title will continue to show the official `displayName(baseModelId)` when available. The row meta will surface `config.modelId` first and append the API-format fact only as a lower-priority secondary detail.

This preserves the page’s current visual hierarchy while fixing the inability to distinguish multiple saved configs that share one preset.

Alternative considered:
- **Switch model configuration rows to `config.modelId` title**: rejected because it makes the configuration list lose preset readability and degrades scannability for users who rely on friendly model-family names when managing exposure rules.

### Decision: Use `config.modelId` as the primary label on selection surfaces
Every user-facing selection surface outside the model configuration page will treat saved configs as configuration instances. For those entries, the primary visible label becomes `config.modelId`. Catalog-only entries keep using the existing preset-friendly `displayName` fallback.

This aligns the UI with the runtime identity actually stored in provider profiles and generation preferences. Users choose configs by `modelId`; they should see that same identity in selectors and active-state labels.

Alternative considered:
- **Use `wireModelId` as the selection label**: rejected because `wireModelId` is a routing fact, not the stable saved identity. It can change while `modelId` stays constant, and the runtime already keys profile selection and preference storage by `modelId`.

### Decision: Keep the change app-surface-only
The application layer already exposes `modelId`, `displayName`, `wireModelId`, and `configSource`. No runtime or schema changes are necessary for this slice. The design will rely on shared app-surface presentation helpers and row-meta composition rather than modifying provider/application contracts.

Alternative considered:
- **Move presentation shaping into `packages/application`**: rejected because the label rules are UX-specific and differ by surface. The repo boundary already declares UI localization and UI-state presentation as `apps/app` concerns.

### Decision: Make meta collapse preserve `modelId` before API-format detail
The model configuration row meta will be composed so `modelId` is the primary retained segment under truncation pressure. The API-format label is informative but secondary and may collapse away first on narrow panels.

Alternative considered:
- **Always show both meta segments in full**: rejected because the panel width is constrained and would either wrap unpredictably or harm title breathing room.

## Risks / Trade-offs

- **[Risk] Remaining ambiguity for users who create opaque `modelId` values** → Mitigation: preserve preset `displayName` on configuration rows and keep preset facts available in row meta or detail views.
- **[Risk] Inconsistent adoption if a page keeps using the legacy helper** → Mitigation: introduce mode-specific presentation helpers/viewmodels and migrate all known selection/configuration surfaces in one slice.
- **[Risk] Tests encode old `displayName-first` assumptions** → Mitigation: update focused UI tests around model configuration rows, provider selectors, settings summaries, and main-page selected-model labels with same-base/different-model fixtures.
- **[Risk] Compact panels truncate more aggressively than expected** → Mitigation: keep the two-line row shell, make meta single-line, and prioritize `modelId` retention over API-format detail.

## Migration Plan

This is a repo-local app-surface change with no data migration. Existing saved configs, provider profiles, and generation preferences remain valid because their stored identities do not change.

Implementation rollout:
1. Add shared app-surface presentation helpers/viewmodels for configuration-instance vs capability-preset labels.
2. Migrate the model configuration list to preset-title plus `modelId`-first meta.
3. Migrate provider add/detail selectors, settings summaries, and main-page model labels to configuration-instance presentation.
4. Update focused UI tests for same-base/different-model cases and catalog-only fallback cases.

Rollback is low-risk: revert the app-surface helper and page-level rendering changes. No persisted data or runtime contracts need cleanup.

## Open Questions

- None for this slice. The user confirmed that catalog-only, non-user-configured models should continue to show `displayName`.
