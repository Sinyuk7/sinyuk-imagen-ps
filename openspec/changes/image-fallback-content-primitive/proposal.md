## Why

Image preview fallback behavior is currently fragmented across the app surface. Main result previews, attachment thumbnails, and history thumbnails all use different placeholder patterns, while the underlying preview pipeline often collapses distinct failures into an empty URL. This makes the UI visually inconsistent and makes fallback copy more precise than the available runtime evidence.

The app now needs a single fallback contract that matches current host boundaries, stays compatible with Photoshop UXP rendering limits, and lets future preview diagnostics grow without forcing a new card system or overclaiming failure causes in user-visible copy.

## What Changes

- Introduce a unified image preview fallback capability for thumbnail and preview-frame hosts.
- Define a shared UI-visible fallback state model that separates display state from optional diagnostic reason.
- Standardize fallback rendering across attachment thumbnails, history thumbnails, and result preview frames without introducing a new card layout system.
- Preserve host-owned surface, size, radius, border, overflow, and motion behavior; the new primitive only renders fallback content.
- Upgrade preview mapping so missing, unresolvable, loading, empty, and generic preview-unavailable states can be surfaced consistently while more specific decode or format failures remain internal diagnostics in Phase A.
- Add theme-token-based fallback styling and host-level acceptance coverage for common preview shapes and densities.

## Capabilities

### New Capabilities
- `image-preview-fallbacks`: Unified fallback states, rendering rules, and host integration for image thumbnails and preview frames when previews are loading, empty, missing, unresolvable, or unavailable.

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/app/src/shared/domain/mappers.ts`, `apps/app/src/shared/image/thumbnail-store.ts`, `apps/app/src/shared/image/task-resource-resolver.ts`, `apps/app/src/shared/domain/image-resource.ts`, `apps/app/src/shared/ui/hooks/use-conversation.ts`, `apps/app/src/shared/ui/pages/main-page.tsx`, `apps/app/src/shared/ui/pages/history-page.tsx`, and shared UI styles/tokens.
- Affected UX surface: main result preview frame, composer attachment thumbnails, history task thumbnails, and related localized fallback copy.
- Affected tests: mapper/unit coverage, history/main-page UI coverage, and UXP CSS/layout contract coverage for fallback states.
- External constraints: Photoshop UXP image/SVG limitations and existing repo-owned theme token contracts.
