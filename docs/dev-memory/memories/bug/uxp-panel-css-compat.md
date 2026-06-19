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

## 2026-06-19 Spacing Compatibility Follow-up

Photoshop screenshots showed horizontal and vertical controls packed together
across Main and Settings surfaces. The clearest examples were provider rows,
status chips, the model picker chip, and composer controls.

Current source inspection showed these areas relied heavily on CSS `gap` and a
few browser-only layout conveniences such as `display: grid` plus `placeItems`.
Adobe's UXP CSS reference documents `display: flex` / `inline-flex`, margin,
and padding, but not grid display or gap properties. The practical rule for this
panel is therefore:

- Do not use `gap`, `row-gap`, or `column-gap` in active `apps/app/src/ui`
  panel styles.
- Do not use CSS grid or `place-items` / React `placeItems` for the UXP panel.
- Do not use `font` shorthand in UXP panel controls; set longhand font
  properties.
- Use explicit class margins for component spacing, for example a child class
  with `margin-left: 8px` or `margin-right: 8px`.

Harness added:

```sh
pnpm --filter @imagen-ps/app test
```

The app test suite now includes `tests/uxp-css-compat.test.ts`, which scans
`apps/app/src/ui/panel-css.ts` and React inline styles under `apps/app/src/ui`
for these risky constructs. This is repo-side proof that the source avoids the
known-unsupported layout primitives; real Photoshop host measurement is still
required before claiming visual behavior in UXP.

## 2026-06-19 Adjacent Sibling Selector Follow-up

After the first spacing fix, UXP Developer Tool could inspect the real
Photoshop plugin target at `plugin:/`. DOM measurement showed `.panel` and
`.page` were both `380x640`, but several spacing rules still did not apply:

- `.cmp-bar > * + * { margin-left: 6px; }` did not create spacing between
  `.tt-wrap` and `.cmp-chip`; both touched at x=67.
- `* { margin: 0; }` did not clear UXP default margins on controls; `.cmp-add`,
  `.cmp-send`, and `.cmp-ta` still had a computed `marginTop` / `marginLeft` of
  `6px`.

Updated rule:

- Do not use adjacent sibling selectors such as `> * + *` for active UXP panel
  spacing.
- Give interactive controls and repeated child classes explicit margin longhand
  resets or specific side margins on the class itself.
- Keep the UXP compatibility harness responsible for forbidding both browser
  layout primitives (`gap`, grid, `place-items`, `font` shorthand) and sibling
  selector spacing.

## 2026-06-19 Real Host Spacing Verification

After the longhand-margin rewrite and rebuilt `apps/app/dist`, UXP Developer
Tools loaded the plugin into Photoshop `27.7.0` / UXP `9.3.0`. Runtime
inspection used the CDT websocket against `plugin:/` and measured computed
styles in the real host, not a browser harness.

Global stylesheet scan in the loaded panel showed no active occurrences of:

- `gap`, `row-gap`, or `column-gap`
- `display: grid`
- `place-items`
- adjacent sibling spacing selectors such as `> * + *`
- `font` shorthand
- `margin` shorthand

Main page measured:

- `.panel`: `380x640`
- `.page`: `380x640`
- `.hdr-btn`: `32x32`, all margins `0px`, `appearance: none`
- `.hdr-center`: x=52, width=276, `margin-left/right: 8px`
- `.composer`: y=521, width=380, `margin-top: 12px`
- `.cmp-ta`: x=25, width=330, `margin-bottom: 8px`,
  other margins `0px`, `appearance: none`
- `.cmp-add`: `30x30`, `margin-right: 6px`, other margins `0px`,
  `appearance: none`
- `.cmp-chip`: x=61, `margin-right: 6px`
- `.cmp-send`: `36x36`, all margins `0px`, `appearance: none`

Providers page measured:

- `.page`: `380x640`
- `.hdr-title`: x=52, width=244, `margin-left/right: 8px`
- `.hdr-btn`: `32x32`, all margins `0px`, `appearance: none`
- `.sec-lbl`: padding `12px 16px 8px 16px`
- `.prov-row`: width=380, padding-left/right `16px`
- `.prov-ico`: `36x36`, `margin-right: 12px`
- `.prov-family` and `.badge`: `margin-left: 6px`

History page measured:

- `.page`: `380x640`
- `.hdr-title`: x=52, width=276, `margin-left/right: 8px`
- `.filter-bar`: y=48, width=380, padding `8px 12px`
- `.fchip`: margins `0px 8px 0px 0px`, `appearance: none`
- `.task-row`: width=364, padding `11px 16px`
- `.task-thumb`: `44x44`, `margin-right: 12px`
- `.task-meta`: `margin-top: 3px`
- `.status-inline`: `margin-top: 1px`

This verifies that the Photoshop UXP host now applies the explicit spacing
rules on Main, Providers, and History surfaces.
