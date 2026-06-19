# UXP Inline SVG Icons

- Date: 2026-06-19
- Scope: `apps/app` Photoshop UXP panel UI.

## Symptom

The app page looked like it had no icons in Photoshop, even though the React
code used the shared `SI` component in page buttons.

Runtime inspection through UXP Developer Tool showed the icons were present in
the DOM:

- `svgCount`: 5
- `pathCount`: 9
- Most SVGs inside ordinary HTML `button` controls had a
  `getBoundingClientRect()` of 0x0.
- One SVG outside those button paths had a visible 9x9 rect.

Changing SVG stroke color at runtime did not make the button icons visible.

## Cause

This is a real Photoshop / UXP host visual compatibility issue, not a missing
React render. Photoshop UXP is not a full browser, and ordinary browser SVG
assumptions do not always hold in the native host UI mapping. Lucide-style,
stroke-only inline SVG icons directly inside ordinary HTML buttons are not a
safe default for this panel.

Adobe's UXP docs also state that UXP supports only a subset of browser HTML/CSS
behavior and that SVG rendering can be incomplete or unexpected.

## Fix Direction

Use a dedicated UXP-safe icon strategy:

- Centralize replaceable icon assets under an explicit app asset directory.
  Implemented at `apps/app/public/assets/icons/`.
- Maintain a single icon registry in code: `apps/app/src/ui/components/icons.tsx`
  exports `Icon` and `iconUrl`, mapping names like `history`, `settings`,
  `send`, `add`, `chevron-down` to fixed file names.
- Prefer packaged raster assets or tested simple filled SVG assets for custom
  icons. The first version uses PNG placeholders that can be replaced later
  without touching JSX.
- Do not rely on `stroke="currentColor"` inline SVG in ordinary UXP HTML
  buttons unless real host evidence proves the exact pattern works.
- Consider Spectrum UXP controls/icons where they match the required UI, but
  verify them in real Photoshop because UXP widgets and web components have
  their own host-specific behavior.

## Harness Need

Add a small manual host visual harness for app icons:

1. Build `@imagen-ps/app`.
2. Reload the plugin through UXP Developer Tool.
3. In UXP DevTools, assert key icon elements have non-zero rects using
   `apps/app/harness/icon-visual/check-icon-rects.js`.
4. Capture a Photoshop screenshot showing visible header, composer, and action
   icons.

Repo-side tests can check that icon components are mounted, but they do not
prove real Photoshop icon rendering.
