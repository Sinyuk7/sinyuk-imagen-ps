# Icon Visual Harness

Manual host visual harness for verifying that UXP panel icons render with
non-zero rects inside real Photoshop.

This harness is intentionally **not** part of the default `pnpm test` suite
because it requires a real Photoshop host and the UXP Developer Tool.

## When to run

- After replacing the `Icon` component or changing icon asset paths.
- After updating `apps/app/public/assets/icons/` files.
- Before declaring a UI change safe for real Photoshop.

## Prerequisites

1. Photoshop is running.
2. The UXP Developer Tool is installed and connected to Photoshop.
3. `@imagen-ps/app` has been built (`pnpm --filter @imagen-ps/app build`).
4. The plugin is loaded/reloaded in UXP Developer Tool from `apps/app/dist`.

## Steps

1. **Build**

   ```bash
   pnpm --filter @imagen-ps/app build
   ```

2. **Reload in UXP Developer Tool**

   Reload `com.imagen-ps.panel` from `apps/app/dist`.

3. **Open UXP DevTools**

   In UXP Developer Tool, open the plugin's DevTools console.

4. **Run the rect check**

   Paste the contents of `check-icon-rects.js` into the DevTools console and
   press Enter.

   The script queries expected icon selectors and reports any icon with a
   `0x0` bounding rect. A passing run prints all icon labels with non-zero
   dimensions.

5. **Visual screenshot check**

   - Capture a screenshot of the Photoshop panel.
   - Confirm the following icons are visible:
     - Header: history, settings
     - Composer: add attachment, model chevron, send
     - Provider card actions: place-PS, regenerate, copy
   - If any icon is missing or shows as a blank/empty box, file a bug under
     `docs/dev-memory/memories/bug/`.

## Expected selectors

The rect check script looks for icons by their surrounding host elements
(buttons, chips, actions) rather than requiring test IDs on every image.
This keeps the JSX clean while still giving host-visible evidence.

## Updating the harness

When new icon names or pages are added:

- Add the new icon name to `apps/app/src/ui/components/icons.tsx`.
- Add a representative selector to `check-icon-rects.js`.
- Update this README's screenshot checklist.
