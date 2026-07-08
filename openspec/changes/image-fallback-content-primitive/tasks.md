## 1. Shared Preview Contract

- [x] 1.1 Add shared preview-fallback types for density, public state, and optional diagnostic reason without reusing provider-input derivative status.
- [x] 1.2 Refactor preview mapping seams (`assetToPreviewUrl`, thumbnail generation, and task resource resolution) so callers can distinguish loading, empty, missing, unresolvable, and generic preview-unavailable outcomes instead of only `url: ''`.
- [x] 1.3 Thread the richer preview-fallback result through conversation attachments, result previews, and history preview state without changing durable task-history contracts.

## 2. Fallback Primitive And Styling

- [x] 2.1 Implement `ImageFallbackContent` as a host-interior primitive that renders icon, title, detail, and optional action slot without owning container layout or surface styling.
- [x] 2.2 Add token-driven fallback styling and a simple UXP-safe inline SVG glyph for `thumbnail`, `preview-frame`, and reserved `large-empty` densities.
- [x] 2.3 Add conservative localized fallback copy for preview-unavailable, file-missing, and resource-unresolvable states while keeping low-level reasons diagnostic-only in Phase A.

## 3. Host Integration

- [x] 3.1 Replace attachment-thumbnail blank placeholders with the shared thumbnail fallback content while preserving existing `att-thumb` shell, motion, and remove affordance.
- [x] 3.2 Replace history thumbnail blank/error mixing with the shared thumbnail fallback content while preserving existing loading behavior and action gating.
- [x] 3.3 Replace result preview placeholder rendering with the shared preview-frame fallback content while preserving existing `img-frame` layout, alpha handling, and media-card shell behavior.

## 4. Verification

- [x] 4.1 Add or update shared tests for preview mapping, including conservative downgrade of decode/unsupported failures to `preview-unavailable`.
- [x] 4.2 Add or update app-surface tests for attachment thumbnails, history thumbnails, and result preview frames across loading, empty, missing, unresolvable, and preview-unavailable states.
- [x] 4.3 Run targeted validation for touched `apps/app` contracts, including fallback CSS/token coverage and existing preview-host layout expectations.
