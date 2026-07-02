---
name: design-review
description: Review a page, panel, screenshot set, or layout proposal with evidence-first design findings and small-change decisions. Use when the user wants UI or page review without code implementation: classify visible issues into confirmed problems, conditional risks, optional optimizations, and A/B/C/D decisions; avoid guessing unseen states, avoid over-design, and prefer minimal visual/layout changes before structural changes. Do not use for Photoshop-only RCA that requires repo or wrapper investigation, and do not use for implementation once a confirmed bug is ready to fix.
---

# Design Review

Review only what the evidence supports. Treat this skill as a page-review
protocol, not a redesign prompt.

## Purpose

Produce a design review that answers, for each suggestion:

- what the evidence is;
- whether it is a bug or an optimization;
- how certain the conclusion is;
- what the smallest useful change is;
- what happens if nothing changes;
- how to accept or reject the change;
- what should explicitly stay unchanged.

Do not implement code. Do not drift into architecture or component rewrites
unless the evidence shows small changes cannot solve the problem.

## Handoff

If the review concludes that a confirmed bug should now be implemented, switch
to `ui-fix-guardrails`.

If the evidence suggests a Photoshop-only or `Chrome normal but PS abnormal`
divergence that requires repo, wrapper, or host investigation, switch to
`ps-uxp-ui-rca`.

## Required Inputs

Before reviewing, identify the available evidence:

- screenshot, video, or direct UI artifact;
- width and height context, if known;
- runtime context: `UXP` / `Chrome` / `Both` / `Unknown`;
- product constraints the user already stated;
- whether the request is bug triage, optimization review, or mixed.

If the evidence is only one screenshot, say so and constrain conclusions to
that state.

## Evidence Boundary

Only state as fact what is directly visible or explicitly provided.

Allowed:

- visible alignment, spacing, clipping, overlap, density, overflow, contrast,
  hierarchy, or responsiveness problems;
- user-provided constraints such as panel width, host limits, or expected
  behavior;
- conditional reasoning in the form `If ..., then ...; otherwise keep current`.

Not allowed:

- invent missing error, loading, hover, focus, disabled, success, or empty
  states from absence in the screenshot;
- assume a component, state machine, or data structure is missing;
- escalate a visual preference into a bug without visible failure evidence;
- require a refactor because a page looks plain, wide, or visually simple.

## Review Frame

Start every review with this compact frame:

```text
Scope:
Evidence:
Runtime:
Review type: Bug | Optimization | Mixed
Confidence limit:
```

`Confidence limit` states what cannot be concluded from the evidence.

## Classification Rules

Use exactly these classes:

### Confirmed Problem

Use only when the evidence shows a concrete failure or inconsistency.

Examples:

- overlap, clipping, off-screen overlay, unreadable contrast;
- wrong control affordance;
- obvious spacing or alignment break against the rest of the same form;
- responsive failure at the shown size.

This class may be a bug or a high-confidence UX defect.

### Conditional Risk

Use when the current screenshot suggests a problem only under a condition not
yet proven.

Format:

`If [condition holds], this becomes [impact]. Otherwise keep current behavior.`

Examples:

- if narrow width is a common usage mode, add a max-width or wrap rule;
- if this icon represents send rather than regenerate, its semantics mismatch;
- if the missing state exists elsewhere, do not alter the structure yet.

### Optional Optimization

Use when the page is functional but could improve clarity or density with a
small change.

Examples:

- add a divider;
- alternate two subtle surface tones;
- tighten max width;
- increase control grouping clarity;
- reduce empty horizontal span.

Do not label these as bugs.

### Keep As Is

Use when the screenshot shows no confirmed issue, or when the current design
is a reasonable tradeoff and the evidence is insufficient to justify change.

## Small-Change Priority

Always prefer the smallest change that can solve the visible issue:

1. spacing, padding, margin, alignment;
2. color, contrast, border, divider, surface separation;
3. icon, label, helper text, state wording;
4. max-width, wrap, ellipsis, overflow, stacking order, responsive rule;
5. layout mode switch at breakpoints;
6. structural or component changes only if 1-5 cannot solve it.

Do not jump to:

- component replacement;
- page structure rewrite;
- new state model;
- host-specific branching;
- ResizeObserver.

Only mention `ResizeObserver` when CSS cannot express the needed semantic
switch. If mentioned, require checks for observer ownership, mount/unmount
cleanup, duplicate listeners, and resize cost.

## Responsive Review Contract

Treat the panel as resizable unless the user explicitly says otherwise.

At minimum, consider these states in the review:

- `240px` narrow stress case;
- default working width;
- wide panel;
- short height;
- tall panel.

Do not require structural redesign only because a wide panel looks empty. Wide
emptiness is often an optimization question, not a bug.

Prefer CSS-first suggestions:

- natural reflow;
- `flex-wrap`;
- `minmax()`;
- `overflow`;
- `text-overflow: ellipsis`;
- breakpoint-based layout switch.

## Fixed And Scroll Regions

When reviewing chat-like or panel UIs, explicitly check:

- whether header stays stable;
- whether composer or primary controls stay stable;
- whether the middle content owns scrolling;
- whether shorter height creates double scroll or pushes controls away;
- whether overlay surfaces stay attached to the visible panel region.

Only call this a confirmed problem if the evidence shows it. Otherwise classify
as `Conditional Risk`.

## Overlay Review Contract

Treat overlays as high-risk.

Check, when evidence exists:

- toast covering header or primary controls;
- select menu leaving panel bounds;
- tooltip clipped by panel;
- dialog unusable at narrow width;
- overlay positioned against browser viewport instead of panel.

Do not assume a hidden overlay state exists if it is not shown.

## Theme Review Contract

Do not review only the shown dark screenshot as if it proves the whole theme.

If theme coverage is incomplete, require follow-up verification for the repo's
actual theme tokens:

- `dark`
- `light`
- `dark-mc`
- `light-mc`

These map to `data-app-theme="dark|light"` and `.theme-dark-mc` /
`.theme-light-mc` classes in `apps/app/src/shared/ui/styles/`; they are not the
generic Spectrum `Darkest / Dark / Light / Lightest` set.

Call out theme issues conditionally unless directly visible. Prefer wording:

`If this text uses host theme variables correctly, keep current. Otherwise verify contrast in light and light-mc themes.`

Do not rely on Chrome-only theme behavior as proof for UXP.

## Chrome And UXP Boundary

When Chrome and UXP differ, do not immediately blame shared UI.

Keep conclusions split across possible owners:

- shared UI or CSS;
- Chrome simulator or fake environment;
- UXP host capability difference;
- adapter or composition seam.

If real-host evidence is missing, do not prescribe host branching or component
replacement as a firm conclusion.

## Decision Format

For every non-bug recommendation, prefer A/B/C/D instead of a forced single
answer.

Use:

- `A — Recommended`: lowest-risk, smallest change, keeps structure;
- `B — Optional`: valid if a specific product goal is true;
- `C — Not recommended`: too much change or weak payoff;
- `D — Keep current`: evidence is insufficient or current design is acceptable.

For each option, state:

- change size;
- tradeoff;
- when to choose it.

## Output Contract

Return only these sections, in this order:

### 1. Confirmed Problems

For each item, use:

```text
[Title]
Evidence:
Classification: Bug | High-confidence UX defect
Confidence:
Smallest change:
If unchanged:
Acceptance:
Do not change:
```

### 2. Conditional Risks

For each item, use:

```text
[Title]
Evidence:
Condition:
If condition is true:
Otherwise:
Confidence:
Suggested check:
Do not change yet:
```

### 3. A/B/C/D Decisions

Use only for non-bug choices or optimization paths.

```text
[Topic]
Evidence:
A — Recommended:
B — Optional:
C — Not recommended:
D — Keep current:
Acceptance trigger:
```

### 4. Do Not Change

List the parts that should stay as they are based on current evidence.

Examples:

- keep current left/right chat semantics;
- do not infer missing error states from one screenshot;
- do not rewrite round structure for a divider-level issue.

## Writing Rules

- Keep the tone direct and evidence-based.
- Prefer `can confirm`, `cannot confirm`, `if ... then ... otherwise ...`.
- Avoid `should redesign`, `needs refactor`, or `must rebuild` unless small
  changes are explicitly ruled out by evidence.
- Separate bugs from optimization. Do not blur them.
- If the user asked for page review only, do not discuss implementation code.
- If no confirmed problems exist, say so plainly and move the weight to
  conditional risks and keep-current decisions.

## Review Stop Rules

Stop escalating when:

- the screenshot shows a workable UI and the change is only preference-based;
- a divider, spacing, color, or max-width change can address the issue;
- the missing evidence would determine whether a problem exists at all.

Only propose structural change when you can defend:

- why small changes fail;
- what visible problem remains unsolved;
- why the added complexity is worth it.
