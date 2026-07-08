## Context

`UxpTextArea` already participates in popup overlap handling through `popup-layer` registration and native editor suspension, while the shared single-line `TextField` remains a thin wrapper around raw native `<input>`. This split means provider profile add/detail pages can mix popup-safe multi-line fields with popup-unsafe single-line fields inside the same panel. The repo already blocks direct raw `<input>` and `<textarea>` usage outside the shared control seam, so the remaining gap is inside the seam itself: the public single-line primitive is not yet safe-by-default.

This is a cross-cutting shared UI contract change. It affects provider settings, popup overlap behavior, harness coverage, and mechanical policy enforcement. The design must make safe behavior the default path so future contributors do not need host-specific UXP knowledge to avoid regressions.

## Goals / Non-Goals

**Goals:**
- Unify single-line and multi-line text input behavior under one popup-aware shared seam.
- Keep the public shared text input API simple so callers naturally get safe behavior.
- Hide raw native text input implementation details behind a private seam.
- Add mechanical safeguards that catch future bypasses during CI.
- Prove the contract with overlap-focused harness coverage for both input shapes.

**Non-Goals:**
- Rebuild checkbox, radio, button, or select primitives.
- Replace the existing popup-layer architecture.
- Introduce a generic form framework or new external dependency.
- Redesign provider settings layout or billing product behavior beyond text input safety.

## Decisions

### 1. Keep one public `TextField`, but make it safe-by-default

The public single-line primitive will remain `TextField` so existing callsites and future contributors do not choose between safe and unsafe variants. Internally, it will move from a raw `<input>` wrapper to a popup-aware text-input seam parallel to `UxpTextArea`.

Alternative considered:
- Expose a second `UxpSafeTextField` component and migrate callsites gradually.
- Rejected because it leaves a permanent footgun: callers must know which text primitive is safe.

### 2. Move raw native single-line editor behavior behind a private seam

The raw native `<input>` implementation should live in an internal-only module owned by the text-input seam. Shared UI callsites must not import it directly. This mirrors the current intent around `UxpTextArea`: host-specific editor quirks belong inside the seam, not in pages or feature components.

Alternative considered:
- Leave raw `<input>` inside `native-controls.tsx` and bolt popup handling around selected callsites.
- Rejected because it keeps the unsafe path too visible and duplicates host logic across features.

### 3. Reuse popup-layer overlap detection for both input shapes

Single-line and multi-line text editors should both register native editor elements with `popup-layer`, and rely on overlap-driven suspension when occluding popups appear. Callsite-specific booleans like `modelMenuOpen` can remain as explicit overrides where needed, but overlap detection becomes the baseline contract.

Alternative considered:
- Suspend native editors only from known menu-open state at each callsite.
- Rejected because new popup combinations would keep leaking through and every caller would need host knowledge.

### 4. Strengthen mechanical guardrails at the seam boundary

The repo already forbids direct raw input/textarea usage outside the shared control seam. This change extends the boundary so only the approved text-input seam may own raw native text editors. Policy should also catch future imports from any internal unsafe module once the seam is split.

Alternative considered:
- Rely on AGENTS/docs guidance plus review discipline.
- Rejected because this rule is objective and the repo already prefers `check:policy` for checkable contracts.

### 5. Expand overlap harness coverage before tightening policy fully

The existing popup overlap harness only demonstrates multi-line suspension. The change should add single-line overlap cases and use them as regression proof before and after migrating real callsites. This keeps the contract observable and reduces the chance of a policy-only refactor that still breaks host behavior.

Alternative considered:
- Tighten policy first and trust unit tests.
- Rejected because the risky part here is host overlap behavior, which needs an explicit visual/behavioral harness.

## Risks / Trade-offs

- [Single-line input behavior diverges from browser expectations] → Keep the public API narrow, preserve current `onValue` semantics, and verify existing callsites with targeted tests/harness runs.
- [Private seam split increases file indirection] → Accept small structural cost in exchange for a safer default and clearer ownership boundary.
- [Policy rules become too coarse and block legitimate internal code] → Use an explicit allowlist for the approved seam file(s) instead of broad regex exceptions.
- [Popup-layer overlap logic misses edge cases for nested overlays] → Reuse current overlap registration model and add single-line harness cases that exercise real anchored popups.
- [Migration stalls with mixed old/new paths] → Sequence work so the safe seam lands first, then migrate high-risk settings surfaces, then tighten guardrails.

## Migration Plan

1. Introduce the unified text-input seam and keep the public `TextField` export stable.
2. Migrate provider settings and other shared UI text-entry callsites that currently rely on the old single-line primitive behavior.
3. Expand popup overlap harness coverage to include single-line text input plus anchored popup overlap.
4. Tighten policy to allow raw native text editors only inside the approved seam.
5. Run targeted shared UI tests/harness checks, then use repo-wide validation as wrap-up.

Rollback is code-level only: revert the seam migration and policy tightening together so public imports do not point at a partially enforced contract.

## Open Questions

- Whether the unified seam should keep living in `native-controls.tsx` or move to a dedicated text-controls module while preserving the public import surface.
- Whether any existing non-settings single-line input surfaces need explicit migration sequencing beyond provider settings before policy tightening.
