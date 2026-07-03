# UXP UI Debugger Memory

Durable notes for confirmed UI/page debugging in the Imagen Photoshop UXP app. Read this file at the start of every `uxp-ui-debugger` run. Append only reusable conclusions after a task.

## Workflow Corrections

- Do not patch source first for UXP UI bugs. Start with `node scripts/uxp-debug/uxp-debug.mjs` against the real Photoshop UXP runtime for DOM probes, ancestor layout data, and runtime style/DOM hypothesis changes whenever the panel is reachable.
- Treat screenshots as the highest-priority visual evidence. DOM rects prove box geometry, but they do not prove glyph alignment, perceived centering, or host-specific rendering correctness.
- For confirmed UI issues, use the loop: `inspect -> ancestors -> descendants/child rects -> runtime style or DOM probe -> screenshot -> source edit -> Watch reload -> inspect/screenshot -> focused tests`.
- Do not conflate real Photoshop UXP smoke with Chrome, jsdom, fake UXP, or package tests. Automated tests can protect contracts; real host screenshots/probes prove Photoshop visual behavior.
- When the user reports that repeated edits are drifting, pause source edits and re-enter probe mode: inspect current DOM, mutate runtime styles, and only then patch code.
- Do not use Computer Use against Photoshop for this skill. It is too unstable for panel interaction proof and can create false confidence. Use `node scripts/uxp-debug/uxp-debug.mjs`, UDT relay data, user screenshots, or explicit user manual feedback instead.
- If a runtime probe cannot reproduce the user's symptom, stop and report the missing proof. Do not keep editing from a partially proven hypothesis.
- If on-disk CSS already contains the expected fix but real UXP `inspect` still shows old computed values, treat the loaded bundle as stale first. Prove the hypothesis with temporary `style` mutations before making another source edit.

## UXP Runtime Facts

- The primary debug target is Photoshop UXP through UDT relay, not Chrome. The default probe surface is `node scripts/uxp-debug/uxp-debug.mjs`; use `--plugin-id com.imagen-ps.panel` when multiple targets exist.
- UDT Watch reload should preserve the debug workflow after one manual Debug. A useful CLI reconnects after reload and continues `inspect`, `ancestors`, `style`, and `reset`.
- Run UXP debug CLI commands serially against the relay; concurrent commands can confuse session/context state.
- In UXP, inline style APIs can report misleading values. Style reset should snapshot and restore original inline `cssText` or equivalent original value/priority data through `window.__UXP_DEBUG_PATCHES__`.
- UXP hit-testing can target a non-button overlay host even when a full-size native button is visually present underneath. For overlay controls, verify the actual event target and bridge host clicks back to the real button path when needed.

## Reusable Probes

- Minimum UI probe: `targets`, `eval 'document.body?.tagName'`, `inspect '<selector>'`, `ancestors '<selector>'`.
- If `targets` suddenly returns empty after a prior successful Debug session, inspect `targets-all` before assuming Photoshop is unreachable. A later plugin `load` / `reload` / `unload` invalidates older `cdtDebugWsUrl` sessions, and the probe should refuse stale targets instead of hanging on them.
- Ancestor output must include tag/id/class, rect, display, position, overflow, width/height, min-width/min-height, flex-direction, flex-grow/flex-shrink/flex-basis, align-items/justify-content, padding, and gap.
- For overlap bugs, inspect child boxes and not only the button/root rect. Hidden native button text, overlay text, icon slots, and arrow slots can occupy different visual layers.
- For temporary CSS hypotheses, use `style`, then verify visually, then `reset <selector> <property>`, `reset <selector>`, or `reset --all` to prove reversible runtime mutation.
- For interaction bugs, install capture-phase event logs for `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`, `focus`, and `select`; inspect target, active element, `defaultPrevented`, and textarea selection before editing source.
- If `inspect` shows old class names (e.g., `.layer-swatch`) after a source edit that introduced new class names (e.g., `.layer-thumb`), the running bundle is stale. Re-run UDT Debug to get a fresh `cdtDebugWsUrl` before treating it as a code defect.

## UI Failure Patterns

- Long text inside native UXP buttons can visually conflict with overlay icons/text if the button's own visible text remains present. If an overlay owns the visible label, the native button should keep interaction/accessibility but not duplicate visible text.
- For icon select triggers, avoid splitting spacing responsibility between the SVG/icon asset and the proxy layout. Let the proxy slots own horizontal spacing; keep the inner icon margin neutral when the overlay rail controls layout.
- Text truncation fixes need both geometry and visual proof: `overflow: hidden`, `text-overflow: ellipsis`, stable child rects, and screenshot confirmation that icon/text/arrow do not overlap.
- User prompt bubbles should not use bare `max-height + overflow:hidden` for previews. Prefer multi-line clamp with visible ellipsis so visual truncation is distinguishable from request/persistence truncation.
- For compact composer pills in UXP, avoid mixing a visible field label with a mono metric value inside a short `inline-flex` row when the host contract forbids baseline alignment. Split the value into structured spans, keep the semantic label in `title` / `aria-label`, and use textual spacing inside the spans so visual tightening does not break copied or announced text.
- For portaled select menus above text inputs, do not use `preventDefault()` on `pointerdown` / `mousedown` unless the real host proves it is required. In UXP this can interfere with native click synthesis and make option clicks unreliable; stop propagation is the safer first contract.
- Shared UXP UI CSS in this repo must avoid `display:grid`, `gap`/`row-gap`/`column-gap`, and adjacent-sibling spacing selectors for layout fixes. Use flex/block layouts plus explicit class-level margins instead; the compatibility tests enforce this because host smoke was unreliable with those patterns.
- Layer lists with potentially hundreds of items must not generate host-derived previews (imaging API calls, object/data URLs) for off-screen rows. Use per-row `IntersectionObserver` lazy loading and always `release()` `RuntimeImageUrl` on unmount or row replacement to avoid OOM and URL leaks.
- When a button is wrapped in an overlay host, `el.click()` on the visible host may not reach the React handler. Dispatch the click on the underlying `<button>` element or rely on the host's capture-phase proxy; verify by checking whether the expected popover/layer list appears in the DOM.

## Validation Gates

- For app UI fixes, a common focused gate is `pnpm --filter @imagen-ps/app build`, relevant `pnpm --filter @imagen-ps/app test -- <files>`, and `pnpm check:policy`.
- For debugger-chain changes, require the stronger reload acceptance: at least three UDT Watch reloads where commands reconnect and continue to inspect/style/reset without manual Debug.
