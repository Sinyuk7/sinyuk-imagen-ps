# UXP Boundary Crash Containment

- Date: 2026-06-21
- Scope: `apps/app` Photoshop / UXP boundary.

## Crash Model

Photoshop UXP instability should be debugged as host-boundary pressure, not as
ordinary browser behavior. The high-risk classes observed in this app are:

- Panel lifecycle ownership outside UXP entrypoints. Module-top-level React
  mounting can leave stale roots, host shells, and debug handles behind when
  UXP Developer Tool reloads the same JavaScript context.
- Native form event dependency in page code. CDT-style synthetic `input` /
  `change` dispatch has triggered UXP `dispatchNativeEvent` errors and a later
  Photoshop native crash. App harnesses should not use that path as the
  primary automation loop.
- Host-renderer-heavy CSS. Animations, transitions, transforms, filters, and
  shadows add native drawing churn in a renderer that is not browser-equivalent.
- Unserialized Photoshop IO. `executeAsModal`, `batchPlay`, imaging, and
  temporary-file writeback must be treated as a single-host-operation boundary,
  with queueing and clear timeout errors.

## Fix Pattern

- Install UXP panel ownership through `uxp.entrypoints.setup()` when available.
  Mount React from panel `create` / `show`, clear debug handles on `hide`, and
  dispose React root plus host shell on panel or plugin `destroy`.
- Keep a defensive fallback mount only for non-UXP browser/test harnesses.
- Centralize text, textarea, and checkbox synchronization in a UXP-safe form
  control seam. Page code should use keyboard, blur, click, and clipboard paths
  instead of direct `onChange` / `onInput` wiring.
- Make repo tests use keyboard/click/blur paths. Ban synthetic `input` /
  `change` dispatch in app harnesses.
- Keep panel CSS on static flex/layout primitives. Ban animations,
  transitions, transforms, filters, shadows, grid/gap, and fragile shorthand
  patterns through repo-side CSS compatibility tests.
- Serialize Photoshop modal operations, enable host error stack traces when the
  API is present, wait for the modal slot to become available, and fail with a
  clear error instead of waiting forever.

## Repo-Side Gates

The relevant local gates are:

```sh
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build
pnpm check:policy
git diff --check
```

These reduce known crash classes but still do not prove real Photoshop host IO.
Use a final narrow manual UXP smoke only after repo-side gates pass, and do not
return to broad CDT input/change dispatch automation.
