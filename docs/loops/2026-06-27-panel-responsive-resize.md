# Loop: Photoshop UXP Panel Responsive Resize

## Status

Status: active
Authority: current user authorization
Owner: `apps/app`
Created: `2026-06-27`
Superseded by: `No follow-up` when completed
Context docs:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `docs/agent/LOOP.md`
- `docs/dev-memory/memories/bug/uxp-panel-css-compat.md`
- `docs/dev-memory/memories/workflow/uxp-photoshop-smoke-checklist.md`
- `apps/app/tests/chrome-e2e/README.md`

## Goal

Make the shared `@imagen-ps/app` panel reliably support user-resizable Chrome and
Photoshop UXP panel containers by removing the internal fixed `380x640` box,
establishing fill-root layout and single-scroll ownership per page, and proving
the resulting behavior with representative Chrome multi-size harness coverage
plus manual Photoshop UXP docked/floating/drag-resize evidence.

## Non-goals

- No provider, application, core-engine, foundation, or CLI contract work.
- No desktop-style two-column or sidebar redesign for wide panels.
- No new component library or broad UI rewrite.
- No fallback design for Photoshop before `26.1`.
- No assumption that all responsive behavior must use `ResizeObserver`.
- No assumption that `compact` or `short` states must exist.
- No claim that Chrome browser evidence proves real Photoshop host behavior.
- No speculative overlay system rewrite before current absolute-positioned
  surfaces are measured under real constraints.

## Scope

Allowed:

- `apps/app/public/manifest.json`
- `apps/app/src/shared/ui/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/src/shells/uxp/**`
- `apps/app/src/index.tsx`
- `apps/app/tests/**`
- `apps/app/vite.chrome.config.ts`
- `apps/app/vite.uxp.config.ts`
- `apps/app/package.json`
- `README.md`
- `docs/TESTING.md`
- focused responsive/compatibility notes under `docs/dev-memory/_inbox/` only
  if manual UXP evidence is produced and needs staging before promotion

Forbidden:

- `packages/application/**`
- `packages/core-engine/**`
- `packages/providers/**`
- `packages/foundation/**`
- `apps/cli/**`
- Photoshop host bridge semantics unrelated to panel resize/layout
- live-provider behavior changes
- broad design cleanup outside responsive resize acceptance

Ownership boundary:

- CLI: no changes
- Provider: no changes
- Application: no changes
- Core: no changes
- UXP: allowed only inside `apps/app` shell/layout/harness/manifest/test/docs
  boundary

## Baseline

Quick:

- Inspect current manifest and panel CSS before edits.
- Confirm current fixed panel box comes from shared CSS, not only Manifest.
- Confirm current Chrome E2E harness is single viewport only.
- Confirm current repo has no `ResizeObserver` in shared UI.

Known failing baseline:

- Current Manifest still declares `host.minVersion: 25.0.0`.
- Current shared panel CSS hard-codes `.panel { width:380px; height:640px; }`.
- Current root layout centers a fixed panel instead of filling the host
  container.
- Current Chrome E2E coverage does not validate multi-size behavior.

Decision if baseline fails:

- Stop and report unless the failure is already documented and clearly
  unrelated to this slice.

## Execution note

This Loop is intended for one implementation round. Internal slices define
order and stop rules, but completion requires all approved slices, all required
automated validation, Chrome responsive regression, and manual Photoshop UXP
evidence in the same round.

## Slices

### Slice 1: Compatibility contract and fill-root shell

Goal:

- Update the host compatibility contract to Photoshop `26.1`.
- Remove the shared internal fixed `380x640` panel box.
- Establish a root fill-container shell contract for both Chrome and UXP.

Allowed:

- `apps/app/public/manifest.json`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/panel-css.ts`
- `apps/app/src/shells/chrome/**`
- `apps/app/src/shells/uxp/**`
- `apps/app/src/index.tsx`
- `apps/app/tests/**`
- `README.md`

Forbidden:

- Page-specific redesign before the shell contract is corrected
- Any cross-package changes
- Any `ResizeObserver` work in this slice

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`

Stop:

- Stop if root fill behavior requires unauthorized ownership changes outside
  `apps/app`.
- Stop if Manifest `26.1` update conflicts with documented release or packaging
  flow not covered by allowed files.

Report evidence:

- Exact shell CSS before/after contract
- Exact Manifest compatibility change
- Proof that both Chrome and UXP roots still mount the shared `AppShell`
- Proof that no fixed internal `380x640` contract remains

### Slice 2: Single-scroll layout contract and natural responsive shrink

Goal:

- Repair page layout so responsive behavior first comes from normal document
  flow, flex shrink, overflow ownership, `min-width:0`, `min-height:0`,
  ellipsis, and content width limits.
- Enforce exactly one primary vertical scroll container per page.

Allowed:

- `apps/app/src/shared/ui/panel-css.ts`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/**`
- `apps/app/src/shared/ui/components/**`
- `apps/app/tests/**`

Forbidden:

- Introducing width/height mode state before CSS-first behavior is measured
- Adding page-specific observer logic
- Broad visual redesign unrelated to resize support

Validation:

- `pnpm --filter @imagen-ps/app test`
- focused DOM/layout assertions under `apps/app/tests/**`

Stop:

- Stop if any page requires an additional primary scroll container to remain
  usable.
- Stop if the layout fix depends on switching to unsupported UXP CSS primitives
  such as grid or gap.

Report evidence:

- Root/Page/Header/Content/Conversation/Composer scroll ownership after change
- Exact places where `min-width:0`, `min-height:0`, overflow, and truncation
  were required
- Remaining responsive failures, if any, after CSS-first repair

### Slice 3: Chrome responsive harness pass 1

Goal:

- Expand Chrome harness coverage from single `390x720` to a small
  representative responsive matrix.
- Measure what still fails after Slice 2, instead of guessing.

Allowed:

- `apps/app/tests/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/vite.chrome.config.ts`
- `docs/TESTING.md`

Forbidden:

- UXP behavior claims based only on Chrome
- E2E combinatorial explosion
- Adding `ResizeObserver` in this slice

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep responsive`

Stop:

- Stop if the harness cannot express representative size/content cases without
  becoming unmaintainable.
- Stop if unresolved failures cannot be attributed to layout versus harness
  assumptions.

Report evidence:

- Exact viewport matrix
- Exact DOM assertions added
- Exact remaining failures after CSS-first layout repair
- Whether any remaining failures truly require semantic size state

### Slice 4: Conditional Root ResizeObserver only for residual structural cases

Goal:

- Add a single `ResizeObserver` on Panel Root only if Slice 3 proves residual
  cases that CSS alone cannot solve.
- Keep a single authoritative size classification source.

Allowed:

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/panel-css.ts`
- `apps/app/src/shared/ui/**`
- `apps/app/tests/**`

Forbidden:

- Multiple observers
- Component-local observers for Composer, Dropdown, Toast, or menus
- Default debounce or `requestAnimationFrame`
- Dual state sources where CSS and React classify size independently
- Introducing `compact` or `short` modes without measured need

Validation:

- `pnpm --filter @imagen-ps/app test`
- targeted hook/integration tests proving cleanup and state dedupe
- rerun responsive Chrome subset from Slice 3

Stop:

- Stop if the residual issue can still be solved by CSS-only contract changes.
- Stop if proposed mode thresholds do not have concrete component coexistence
  measurements.
- Stop if the solution would require more than one authoritative size source.

Report evidence:

- Residual problems unsolved by CSS-first slices
- Why each problem cannot be solved by normal flow/flex/overflow alone
- Exact Root attachment point
- Exact authoritative size-source contract
- Proof that UI updates fire only on semantic change, not every pixel, if
  semantic states are introduced

### Slice 5: Overlay, long-content, image, and Composer bounds

Goal:

- Make overlays and bounded content remain operable at supported panel sizes.
- Keep current overlay direction if container clamping is enough; switch only
  if evidence shows current approach is not salvageable.

Allowed:

- `apps/app/src/shared/ui/panel-css.ts`
- `apps/app/src/shared/ui/pages/**`
- `apps/app/src/shared/ui/components/**`
- `apps/app/tests/**`

Forbidden:

- Replacing all overlay behavior preemptively
- New global overlay architecture without measured failure
- Wide-screen multi-column redesign

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep responsive`

Stop:

- Stop if current overlay approach still fails under container clamping and a
  replacement would materially change shared UI architecture beyond this loop.
- Stop if Photoshop UXP-only behavior is needed to choose between incompatible
  overlay strategies.

Report evidence:

- Which existing overlays were preserved
- Which overlays required clamping or anchor changes
- Whether any low-frequency action needed overflow menu or secondary access
  pattern
- Exact Composer growth cap and internal scroll behavior

### Slice 6: Final Chrome regression, UXP manual proof, manifest sizing finalization, docs

Goal:

- Finalize representative Chrome responsive proof.
- Perform real Photoshop UXP docked/floating/continuous-drag validation.
- Set final Manifest sizing values from validated behavior rather than guesses.
- Update compatibility and testing docs.

Allowed:

- `apps/app/public/manifest.json`
- `apps/app/tests/**`
- `README.md`
- `docs/TESTING.md`
- manual evidence note under `docs/dev-memory/_inbox/` if needed

Forbidden:

- Shipping guessed `minimumSize`
- Claiming Chrome proof is sufficient for UXP
- Leaving UXP manual acceptance for later

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep responsive`
- `pnpm check:policy`
- manual Photoshop/UXP smoke per Appendix D

Stop:

- Stop if real Photoshop UXP behavior contradicts the Chrome-proven contract in
  a way that needs a broader runtime fork.
- Stop if final `minimumSize` cannot be justified by actual validated minimum
  usable dimensions.

Report evidence:

- Final Chrome responsive report
- Final Photoshop version and runtime details used for manual proof
- Final Manifest `minimumSize`, `preferredDockedSize`, `preferredFloatingSize`,
  and `maximumSize` rationale
- Final compatibility statement updates

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep responsive`

Final:

- `pnpm validate`

Manual-only:

- Build plugin bundle
- Load `apps/app/dist/manifest.json` in UXP Developer Tool
- Validate docked panel, floating panel, and continuous drag resize against
  Appendix D matrix

Live-provider:

- none

## Decision Packet Triggers

- Requirement has multiple incompatible interpretations.
- A slice needs unauthorized package ownership changes.
- Manifest sizing cannot be finalized from validated minimum usable dimensions.
- A claimed `ResizeObserver` use case is not evidenced by post-layout-fix
  harness results.
- Overlay behavior in real Photoshop UXP requires a runtime-specific
  architecture fork.
- Baseline failure blocks attribution.

## Completion Report

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Record if:

- The turn produced a durable project fact in one of these categories:
  `architecture`, `decision`, `workflow`, `bug`, `manual-host-result`.

Do not record:

- Raw logs, build output, secrets, local user habits, routine passing tests,
  or speculative plans.

---

## Appendix A: Layout Contract SPEC

### A1. Root and shell contract

- `html`, `body`, `#root`, and the shared panel root must form a fill-container
  chain.
- No internal fixed `width:380px` or `height:640px` contract remains in shared
  CSS.
- The panel may use `width:100%`, `height:100%`, flex column layout, and
  bounded padding/radii.
- `sp-theme` remains a token carrier, not a measured layout box.
- The shell must work the same way in Chrome and UXP shared UI code.

### A2. Page contract

- Every route page is a column layout with stable responsibilities.
- Root and page wrappers must not become primary vertical scrollers.
- Each page has exactly one primary vertical scroll owner.

### A3. Main page contract

- Header owns navigation and top summary only.
- Conversation owns the primary vertical scroll.
- Composer stays in the bottom region and does not become a second primary page
  scroll.
- Composer may grow for attachments and multiline input, but must have an
  explicit upper bound.
- When Composer reaches that bound, its textarea or internal content scrolls
  locally.
- Height pressure must compress Conversation first, not hide critical actions.
- User reviewing older messages must not be forced back to bottom.
- No page-level horizontal scroll is allowed.
- Long prompt text, images, and message cards must not break container width.

### A4. History page contract

- Header fixed by responsibility, not by eternal pixel promise.
- Filter bar stays outside the primary scroll area.
- List content area is the only primary vertical scroll container.
- Long prompts may wrap or clamp, but rows must remain operable.
- No page-level horizontal scroll.

### A5. Settings / Settings Add / Settings Detail contract

- Header fixed by responsibility.
- Content form/list area is the only primary vertical scroll container.
- Footer action area, if present, stays outside primary scroll ownership.
- Long provider names, model ids, tags, and status text must truncate or wrap
  without pushing controls off-screen.
- No page-level horizontal scroll.

### A6. Header contract

- Header responsibility is stable.
- Header pixel height is not a permanent architectural constant.
- Header may grow within reason when narrow width, localization, or status
  density requires it.
- Header content must prefer truncation and controlled wrapping over overlap.

### A7. Composer contract

- Composer responsibility is stable.
- Composer pixel height is not fixed.
- Attachments and multiline input may increase Composer height up to a cap.
- Past the cap, local internal scroll begins.
- Core actions must remain reachable at minimum supported width.
- Core reachability does not imply all low-frequency actions remain always
  visible.

### A8. Content width contract

- Wider panels remain single-column.
- Messages, result images, and Composer content should use reasonable max
  reading widths.
- No dual-column, sidebar, or desktop rearrangement in this loop.

---

## Appendix B: ResizeObserver Decision SPEC

### B1. Default rule

- Do not add `ResizeObserver` unless CSS-first slices and responsive Chrome
  harness prove a remaining structural problem.

### B2. Allowed use

- One `ResizeObserver` on Panel Root only.
- It may exist only to derive a small semantic size state that CSS alone cannot
  express.
- If semantic state exists, Root is the only authority.

### B3. Forbidden use

- No observer on Composer.
- No observer on Dropdown, Toast, Picker, or menus.
- No per-component size subscriptions.
- No observer-driven per-pixel React rerender loop.
- No parallel CSS and React size-classification logic.

### B4. Authority rule

- If semantic states are introduced, Root computes them once.
- Root writes them to `data-*` attributes for CSS.
- Rare components that truly need conditional rendering may consume the same
  Root-derived source.
- There must not be one threshold table in CSS and another in React.

### B5. Candidate states

- `compact` and `short` are candidates only.
- They must not be introduced by default.
- They must be justified by measured component coexistence limits.

### B6. Update rule

- If semantic states exist, React updates must occur only when semantic state
  changes.
- No default debounce.
- No default `requestAnimationFrame`.
- Add scheduling only after real UXP drag-resize proves loop, jitter, or
  performance issues.

### B7. Cleanup rule

- Observer must disconnect on unmount.
- Observer must not leak across page switches, root remounts, or UXP hot reload
  cycles.
- Tests must assert cleanup if observer is added.

---

## Appendix C: Breakpoint and Measurement SPEC

### C1. Breakpoint rule

- No breakpoint may be justified only by common phone widths or subjective
  preference.
- Every breakpoint must come from measured coexistence constraints.

### C2. Width evidence must include

- Header left action + center content + right action coexistence
- Composer minimum coexistence for:
  - add-image entry
  - current model entry
  - send or stop
  - current running/error state visibility
- Whether target, aspect ratio, optimize, history, and settings remain direct
  or secondary actions
- Overlay minimum usable width without clipping or inaccessible options
- Long provider/model/profile name behavior

### C3. Height evidence must include

- Header effective height under realistic content
- Composer base height
- Composer attachment-expanded height
- Composer multiline growth cap
- Minimum remaining Conversation viewport that still preserves usability
- Overlay usable height at low panel heights

### C4. Measurement workflow

- First repair layout with CSS-first contract.
- Then use Chrome harness to inspect:
  - `scrollWidth` versus `clientWidth`
  - overflow presence
  - element bounding boxes for critical action rows
  - overlay containment
- If unresolved structural failure remains, document which element pair cannot
  coexist naturally.
- Only then derive a semantic mode threshold.

---

## Appendix D: Representative Harness and Acceptance Matrix SPEC

### D1. Matrix design rule

- Do not build a full Cartesian product.
- Use a small representative matrix plus component-level and contract-level
  tests.

### D2. Required Chrome responsive E2E cases

- Narrowest supported width x shortest supported height x most complex content
- Default preferred size x standard content
- Wider panel x long message and image content
- Width threshold minus one and plus one, if a width mode exists
- Height threshold minus one and plus one, if a height mode exists
- Overlay anchored near each edge:
  - top-left pressure
  - top-right pressure
  - bottom-left pressure
  - bottom-right pressure
- Repeated or continuous resize scenario in Chrome harness, if harness can
  express it maintainably

### D3. Required content states across the representative matrix

- Empty state
- Multi-message state
- Very long prompt
- Very long model or profile name
- Single attachment
- Multiple attachments
- Landscape image
- Portrait image
- Composer multiline growth
- Running state
- Long error
- Toast visible
- Dropdown/menu visible
- Main
- History
- Settings
- Settings Add
- Settings Detail

### D4. Required automated assertions

- No page-level horizontal scroll
- No core control overlap
- Core actions remain reachable
- Text and image content do not force container overflow
- Primary scroll ownership is correct for the active page
- Composer stays stable while Conversation absorbs vertical pressure
- If observer exists, UI state updates only on semantic change
- No observer leak
- No observer loop warning in supported harness contexts

### D5. Required Photoshop UXP manual checks

- Docked panel at preferred size
- Floating panel at preferred size
- Docked manual width shrink to validated minimum
- Docked manual height shrink to validated minimum
- Floating shrink to validated minimum
- Wider-than-default panel
- Taller-than-default panel
- Narrow + short stress case
- Continuous manual drag-resize
- Overlay opening near all practical panel edges
- Page switching after resize
- Main / History / Settings shared shell consistency

### D6. Required Photoshop UXP manual outcomes

- No obvious flicker during drag-resize
- No unusable clipping of core controls
- Conversation remains the primary vertical scroll in Main
- Other pages keep one primary vertical scroll area
- Composer growth does not corrupt Conversation layout
- Old-message review is not forced to bottom
- Overlay remains operable or fails in a documented, reproducible way that
  drives the final decision
- Final minimum usable width and height are recorded from actual host behavior

---

## Appendix E: Overlay and Action Priority SPEC

### E1. Overlay default direction

- Keep current absolute-positioned surfaces by default.
- First try containment and clamping inside the panel.

### E2. Overlay containment expectations

- Menus and pickers may switch anchor side if needed.
- Menus and pickers may gain internal scroll if too tall.
- Toast must remain visible without pushing page layout.
- Page switch or outside click must leave no stale interactive surface.

### E3. Action priority at minimum width

Directly reachable core actions:

- prompt input
- send or stop
- add input material
- identifiable current model entry
- running state
- error recovery

May become secondary if space requires and usability remains clear:

- history
- settings
- optimize
- secondary profile actions
- non-critical badges and supporting text

### E4. Wide panel rule

- Do not introduce dual-column or side-pane behavior.
- Wide panels only improve reading width and breathing room.
