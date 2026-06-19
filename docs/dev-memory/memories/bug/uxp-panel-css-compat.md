# UXP Panel CSS Compatibility

- Date: 2026-06-19
- Scope: `apps/app` Photoshop UXP panel styling.

## Symptom

The React shell rendered in Photoshop, but the main `.page` did not fill the
380x640 panel. Runtime inspection through UXP Developer Tool showed:

- `.panel`: 380x640
- `.page`: 355x397
- `.composer`: positioned around y=262 instead of the panel bottom

Photoshop screenshots showed the composer floating above a large empty black
area. Header and textarea controls also kept UXP native chrome even when normal
CSS border/background rules appeared set.

## Cause

The UXP host accepted enough CSS for the app to render, but did not behave like
a full browser for these panel styles:

- `inset: 0` on absolutely/fixed positioned elements did not expand the element
  to the containing box.
- Native form controls kept `appearance: auto` unless reset explicitly.
- A flex composer inner container needed an explicit `width: 100%` to fill its
  parent in the UXP panel.

## Fix Pattern

For active UXP panel CSS:

- Prefer `top: 0; right: 0; bottom: 0; left: 0;` over `inset: 0`.
- Reset `button`, `input`, `textarea`, and `select` with
  `-webkit-appearance: none; appearance: none;`.
- Give important flex panel containers explicit widths when screenshots or
  DevTools runtime rects show shrink-to-content behavior.

## Verification

After the fix, UXP Developer Tool runtime inspection showed:

- `.panel`: 380x640
- `.page`: 380x640
- `.composer`: y=505, 380x135
- `.cmp-inner`: 356px wide
- `.hdr-center` and `.cmp-ta`: `appearance: none`

Repo-side checks:

```sh
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test
```
