# UXP First-Frame Spectrum Geometry

## Current Fact

In the Photoshop UXP host, Spectrum controls can establish the right custom
element definitions and shadow trees but still report collapsed first-frame
geometry.

Confirmed real-host evidence from the Providers header:

- `sp-theme`, `sp-action-button`, and workflow icon elements were already
  defined in the failing frame.
- The relevant elements already had `shadowRoot` during the failing frame.
- At `sync`, `microtask`, and `requestAnimationFrame`, the header
  `sp-action-button` and slotted icon could report `getBoundingClientRect()`
  `0x0`.
- Around `50ms` later, the same nodes could recover to normal geometry
  (`32x32` buttons, `14x14` icons) without any data reload.
- Forcing header action size through CSS and inline `style` did not prevent the
  collapsed first frame.

This points to a Photoshop UXP first-frame layout / upgrade / slot-geometry
instability, not a simple missing-registration or late-CSS issue.

## Why Future Development Needs This

When Chrome is stable but Photoshop UXP shows intermittent wrong icon/button
appearance on entry, changing ordinary page CSS first is likely to waste time.
Future RCA should verify whether the host is collapsing geometry before trying
more style-only fixes or broad component rewrites.

## Re-verify

Build and reload the UXP panel:

```bash
pnpm --filter @imagen-ps/app build:uxp
```

Reload `apps/app/dist/manifest.json` in UXP Developer Tool, reproduce the bad
entry frame in Photoshop, then inspect the current host log:

```bash
LOG_FILE="$HOME/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/27/Developer/com.imagen-ps.panel/PluginData/logs/$(date +%F)/imagen.jsonl"
rg -n 'uxp.ui.settings.providers_header.snapshot' "$LOG_FILE" | tail -n 40
```

If the issue recurs, compare `sync`, `microtask`, `raf`, and `timeout_50ms`
records. A failing frame is characterized by `0x0` geometry before later
recovery even though element definitions and `shadowRoot` are already present.
