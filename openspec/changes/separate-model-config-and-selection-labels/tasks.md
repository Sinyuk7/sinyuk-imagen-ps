## 1. Shared model presentation helpers

- [x] 1.1 Replace the generic app-surface `displayName-first` model label helpers with explicit configuration-instance and capability-preset presentation helpers or viewmodels in `apps/app/src/shared/ui/model-info.ts` or a nearby shared app-surface module.
- [x] 1.2 Add focused helper-level coverage for saved-config vs catalog-only label resolution, including same-`baseModelId` / different-`modelId` fixtures and catalog-only fallback behavior.

## 2. Model configuration page presentation

- [x] 2.1 Update the model configuration list rows to keep preset `displayName(baseModelId)` as the title while rendering `config.modelId` as primary meta and API format as lower-priority secondary meta.
- [x] 2.2 Adjust model configuration row styles and page tests so narrow layouts preserve `config.modelId` before API-format detail and same-preset configs remain distinguishable in the list.

## 3. Selection and summary surfaces

- [x] 3.1 Update provider add/detail model selectors and any shared selector hooks to render saved user-configured models with `config.modelId` as the primary label while keeping catalog-only entries on friendly `displayName`.
- [x] 3.2 Update settings summary rows, main-page selected-model labels, and main model selector options to use configuration-instance presentation for saved configs and add regression coverage for the `nano-banana-fast` / `nano-banana-2-lite` class of cases.
