---
name: uxp-ui-debugger
description: >
  Manual-only Photoshop UXP UI debugging workflow. Use only when the user
  explicitly invokes `$uxp-ui-debugger` or explicitly asks for this real-host
  DOM/event/style probe workflow. Do not auto-select from a generic UI bug
  report. Trigger: "$uxp-ui-debugger", "use uxp-ui-debugger", "run the UXP UI
  debugger workflow".
---

# UXP UI Debugger

## Trigger Mode

Manual-only.

- Enter this skill only when the user explicitly invokes `uxp-ui-debugger`, explicitly asks for this workflow, or a manually-invoked `uxp-issue-rca` run already concluded `hand off to uxp-ui-debugger`.
- Do not auto-enter just because the task looks like a UI bug.
- If UI ownership is not already established and there is no explicit invocation, stay in normal repo triage instead of loading this skill.

Use this skill to avoid Chrome-only or jsdom-only UI conclusions. The default loop is:

`real UXP probe -> runtime style/DOM hypothesis -> user-visible evidence -> source edit -> Watch reload -> real UXP re-probe -> tests -> memory writeback`

## Required Memory

Before debugging, read this skill's `MEMORY.md`:

```sh
sed -n '1,220p' .agents/skills/uxp-ui-debugger/MEMORY.md
```

After the task, append only durable reusable findings to `MEMORY.md`. Do not append raw logs, screenshots, execution transcripts, completed plans, or one-off command output.

Write entries under these headings when relevant:

- `Workflow Corrections`
- `UXP Runtime Facts`
- `Reusable Probes`
- `UI Failure Patterns`
- `Validation Gates`

## Scope Boundary

Use this skill only after UI ownership is already clear:

- layout, clipping, overflow, text truncation, alignment, spacing;
- icon visibility, icon/text overlap, SVG/native control rendering;
- menu/popover placement and interactive control state;
- Photoshop UXP vs Chrome visual divergence;
- UI source edits in `apps/app/src/shared/ui`, page components, harnesses, or UI tests.

Accepted entry conditions:

- the user explicitly reports a confirmed UI-only bug;
- the task is a UI change request scoped to existing UI surfaces;
- `uxp-issue-rca` already concluded `hand off to uxp-ui-debugger`.

Reject and route back to `uxp-issue-rca` when:

- the first question is whether the problem is UI;
- the symptom may be caused by provider, profile, dispatch, persistence, bridge, or host/runtime failures;
- the UI is only where a non-UI failure becomes visible;
- the report cannot yet rule out mixed ownership.

## Current Authority

Start from current code and repo authority:

```sh
git status --short
test -d .codegraph && codegraph explore "<component selector symptom>"
rg -n "<selector|component|symptom>" AGENTS.md README.md docs/ENGINEERING_CONTEXT.md docs/TESTING.md docs/loops apps/app
```

Preserve unrelated dirty worktree changes. Do not rewrite user edits unless explicitly asked.

## Real UXP Probe First

Before changing source, collect evidence from the real Photoshop UXP runtime whenever the issue is visible in Photoshop.

If the incoming report did not include a UI ownership decision, stop and return the missing dispatch precondition instead of probing.

Use `node scripts/uxp-debug/uxp-debug.mjs` as the default CLI surface for real Photoshop UXP probing. If this script is missing or broken, stop and report that blocker instead of replacing it with an ad hoc workflow. Run commands serially against the UDT relay; do not run multiple probe commands concurrently.

Do not use Computer Use against Photoshop. Photoshop window automation is not a supported evidence source for this workflow. Use UXP DOM/event probes, UDT relay data, screenshots supplied by the user, or explicit user manual feedback instead.

Minimum probe sequence:

```sh
node scripts/uxp-debug/uxp-debug.mjs targets
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel eval 'document.body?.tagName'
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel inspect '<selector>'
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel ancestors '<selector>'
```

For each target element, capture:

- rect;
- computed display / position / overflow;
- width / height / min-width / min-height;
- flex-direction / flex-grow / flex-shrink / flex-basis;
- align-items / justify-content;
- padding / gap;
- relevant text, class, id, data attributes;
- immediate children rects when overlap or alignment is suspected.

For ancestor chains, inspect every layer. Many UXP bugs come from a parent, not the target: `overflow: hidden`, `min-width: auto`, `flex-shrink: 1`, zero height, wrong containing block, or unexpected `align-items`.

## Runtime Hypothesis Before Source Edit

Test CSS and DOM hypotheses in the live UXP page before editing source:

```sh
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel style '<selector>' border-radius 6px
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel reset '<selector>' border-radius
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel reset '<selector>'
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel reset --all
```

Trust only style tools that preserve original inline styles through `window.__UXP_DEBUG_PATCHES__` or equivalent snapshots. `reset` must restore the prior inline value and priority, not simply remove the property.

For text/icon overlap, also probe child boxes:

```sh
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel eval "(() => [...document.querySelector('<selector>').children].map((el) => ({ tag: el.tagName, className: el.className, text: el.textContent, rect: el.getBoundingClientRect().toJSON?.() ?? el.getBoundingClientRect(), style: getComputedStyle(el).cssText })))()"
```

If `inspect` rects look correct but the screenshot looks wrong, treat the screenshot as stronger evidence for visual correctness. Rects prove boxes, not glyph alignment or host rendering.

For interaction bugs, add event instrumentation before editing source:

```sh
node scripts/uxp-debug/uxp-debug.mjs --plugin-id com.imagen-ps.panel eval "(() => { window.__UXP_EVENT_LOGS__=[]; const record=(phase,e)=>window.__UXP_EVENT_LOGS__.push({phase,type:e.type,target:e.target?.getAttribute?.('data-testid')||e.target?.className||e.target?.tagName,active:document.activeElement?.getAttribute?.('data-testid')||document.activeElement?.tagName,defaultPrevented:e.defaultPrevented}); ['pointerdown','mousedown','pointerup','mouseup','click','focus','select'].forEach((type)=>document.addEventListener(type,(event)=>record('capture',event),true)); return true; })()"
```

Then read `window.__UXP_EVENT_LOGS__`. Confirm the actual target, propagation, focus, and selection state before choosing a source edit.

## Source Edit Gate

Edit source only after one of these is true:

- a real UXP runtime probe proves the failing box/style/ancestor;
- a live style or DOM mutation improves the visible issue;
- an event probe proves the failing event target, propagation, focus, or selection state;
- the source cause is mechanically obvious from real UXP evidence;
- the issue cannot be probed live, and the limitation is explicitly reported.

Do not patch source from a partially proven hypothesis. If the runtime probe cannot reproduce the user's symptom, stop and report the missing proof instead of continuing with code changes.

When editing UI:

- prefer existing primitives and styles;
- avoid runtime-specific branches in shared UI;
- keep CSS ownership in the existing style module when possible;
- do not add decorative UI or layout redesign unrelated to the bug;
- update focused tests only for stable contract changes.

## Watch Reload Acceptance

Real acceptance is not one command succeeding. Verify the UDT Watch loop:

1. Run UDT Debug once for `com.imagen-ps.panel`.
2. Confirm `inspect` and `ancestors` work.
3. Edit source and run the app build/watch path needed for UDT Watch to reload.
4. Let UDT Watch reload the plugin.
5. Re-run `inspect`, `ancestors`, `style`, and `reset` without manual Debug.
6. Repeat across at least three Watch reloads for debugger-chain changes.

For normal UI bug fixes, one post-edit Watch reload plus real UXP probe and user-visible confirmation is enough unless the debug chain itself changed.

## Visual Proof

Use screenshots or explicit user-visible feedback for final visual checks. A valid UI fix report distinguishes:

- real UXP DOM evidence;
- runtime style/DOM/event hypothesis result;
- screenshot/video/user manual visual evidence;
- source diff;
- automated tests;
- remaining manual-only uncertainty.

Do not present Chrome, jsdom, fake UXP tests, or package tests as proof of real Photoshop visual correctness.

If user-visible proof is unavailable, say so directly. Do not substitute Photoshop Computer Use output as proof.

## Validation

Pick the smallest validation set that covers the edit:

```sh
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test -- <focused test files>
pnpm check:policy
```

Use `pnpm validate` only when the change crosses package boundaries or the user asks for the full gate.

## Report Shape

Use this compact shape:

```text
Symptom:
UI handoff source:
Real UXP evidence:
Runtime probe tried:
Confirmed cause:
Source change:
Visual proof:
Tests:
Memory writeback:
Remaining risk:
```

If the task produced reusable knowledge, append it to `MEMORY.md` before the final response and report the section updated.
