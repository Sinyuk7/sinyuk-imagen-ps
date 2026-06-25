# UXP panel CSS compatibility

## Current fact

The Photoshop UXP host accepts enough CSS to render the panel but does not
behave like a full browser for several layout primitives. Active `apps/app`
panel styles must avoid:

- `gap`, `row-gap`, `column-gap`
- `display: grid` and `place-items` / React `placeItems`
- `inset: 0` on absolutely/fixed positioned elements — use
  `top: 0; right: 0; bottom: 0; left: 0;`
- adjacent sibling spacing selectors such as `> * + *`
- `font` shorthand and `margin` shorthand — use longhand properties
- native form control chrome — reset `button`, `input`, `textarea`, `select`
  with `-webkit-appearance: none; appearance: none;`
- important flex panel containers need explicit `width: 100%` when screenshots
  or DevTools runtime rects show shrink-to-content behavior

## Why future development needs this

CSS that is valid in a browser can render broken or collapsed in the UXP host.
Chrome runs the same shared UI as a real browser, so these constructs may appear
to work in Chrome smoke while failing in Photoshop.

## How to verify

- `pnpm --filter @imagen-ps/app test` runs `tests/uxp-css-compat.test.ts`, which
  scans shared panel CSS and React inline styles for the forbidden constructs.
- Real Photoshop host measurement (UXP Developer Tool CDT against `plugin:/`) is
  still required before claiming visual behavior in UXP.
