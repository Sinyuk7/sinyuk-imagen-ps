# Source Map

Use this file when the RCA needs the fastest lookup path.

## Repo truth

- `apps/app/AGENTS.md`
- `apps/app/public/manifest.json`
- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/src/shared/ui/primitives/spectrum-controls.tsx`
- `apps/app/src/shared/ui/components/icons.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`

## Local Adobe docs

- `.local/share/uxp/.../Using with React.md`
- `.local/share/uxp/.../User Interface/*.md`
- `.local/share/uxp/.../Spectrum to SWC Mapping/index.md`
- `.local/share/uxp-photoshop/.../reference-spectrum/swc/index.md`

## Current repo lessons

- `sp-button` / `sp-action-button` icons must use `slot="icon"`
- do not add generic icon spacing inside button icon slots
- wrapper coverage is selective; documented widgets are not automatically the
  right repo primitive
- `ComposerSelect` is a fragile custom composite; simplify before deep patching
