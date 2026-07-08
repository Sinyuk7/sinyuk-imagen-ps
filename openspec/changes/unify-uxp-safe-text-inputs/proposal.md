## Why

Shared UI currently treats multi-line and single-line text inputs differently under Photoshop UXP popup overlap. Multi-line fields already use a popup-aware safe seam, but single-line fields still rely on raw native input behavior, which leaves provider settings and future text-entry surfaces exposed to native editor hit-test conflicts. We need one text-input contract now so new UI work does not depend on individual contributors knowing host-specific workaround details.

## What Changes

- Introduce one shared UXP-safe text input seam for both single-line and multi-line text entry.
- Make the public shared text input primitive safe-by-default so callers do not choose between safe and unsafe variants.
- Move raw native text input implementation details behind a private seam that shared UI callsites cannot import directly.
- Extend repo mechanical guardrails to reject new unsafe text-input paths outside the approved seam.
- Add overlap-focused harness coverage for both single-line and multi-line text inputs with anchored popup menus.
- Migrate provider profile add/detail billing and related settings surfaces onto the unified seam.

## Capabilities

### New Capabilities
- `uxp-safe-text-inputs`: Defines a single shared contract for popup-safe text entry, guardrails for allowed usage paths, and regression coverage for UXP overlap behavior.

### Modified Capabilities

None.

## Impact

- Affected code: `apps/app/src/shared/ui/primitives`, `apps/app/src/shared/ui/components`, provider settings pages/components, popup overlap harnesses, and policy checks.
- Affected systems: Photoshop UXP shared UI input behavior, popup-layer overlap handling, repo policy enforcement, and UI regression harnesses.
- Dependencies: existing popup-layer infrastructure and `pnpm check:policy` enforcement paths.
