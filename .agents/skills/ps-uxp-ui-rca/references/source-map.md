# Source Map

Use this file when the RCA needs the fastest lookup path.

## Repo truth

- `apps/app/AGENTS.md`
- `apps/app/public/manifest.json`
- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/primitives/icon-button.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`
- `apps/app/src/shared/ui/components/icons.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`

## Local Adobe docs

- `.local/share/uxp/.../Using with React.md`
- `.local/share/uxp/.../User Interface/*.md`
- `.local/share/uxp/.../Spectrum to SWC Mapping/index.md`
- `.local/share/uxp-photoshop/.../reference-spectrum/swc/index.md`

## Current repo lessons

- `UxpTextArea` is a controlled-by-sync native `<textarea>`: it writes `value`
  via `useEffect` to `.value` and syncs back on `onBlur` / `onKeyDown` /
  `onKeyUp` / `onPaste` / `onCut`; sync bugs (stale value, double emit, paste
  not captured) are the common pitfall
- repo chose native HTML controls over `sp-*` for stable dual-runtime coverage;
  `@swc-uxp-wrappers/*` is no longer a dependency, only
  `@spectrum-web-components/icons-workflow` remains (icons only)
- wrapper coverage is selective; documented widgets are not automatically the
  right repo primitive
- `ComposerSelect` is a fragile custom composite; simplify before deep patching
