# UXP inline SVG icons

## Current fact

Photoshop UXP is not a full browser. Lucide-style, stroke-only inline SVG icons
placed directly inside ordinary HTML `button` controls render at `0x0` in the
real host, so the panel looks icon-less even though the SVGs are in the DOM.

The app uses a UXP-safe icon strategy instead:

- Icon assets live under `apps/app/public/assets/icons/`.
- A single registry in `apps/app/src/shared/ui/components/icons.tsx` exports
  `Icon` and `iconUrl`, mapping names (`history`, `settings`, `send`, `add`,
  `chevron-down`, ...) to fixed file names.
- Prefer packaged raster assets or tested simple filled SVGs. Do not rely on
  `stroke="currentColor"` inline SVG in ordinary UXP HTML buttons unless real
  host evidence proves the exact pattern works.

## Why future development needs this

A new icon added as inline stroke SVG inside a button will silently disappear in
Photoshop. Repo tests can assert the component is mounted but cannot prove real
host rendering.

## How to verify

- `pnpm --filter @imagen-ps/app build` then load `apps/app/dist/manifest.json`
  in UXP Developer Tool.
- Run `apps/app/harness/icon-visual/check-icon-rects.js` in the UXP DevTools
  console and confirm key icons have non-zero rects (see
  `apps/app/harness/icon-visual/README.md`).
