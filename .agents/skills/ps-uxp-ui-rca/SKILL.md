---
name: ps-uxp-ui-rca
description: Diagnose Photoshop UXP-specific UI defects in apps/app when the user explicitly says the issue appears in Photoshop, UXP, or differs between Chrome and PS. Use for repo-level RCA of broken rendering, click, focus, keyboard, menu, popover, wrapper, or host-behavior mismatches that require inspecting component usage, wrapper coverage, local Adobe docs, or runtime boundaries. Do not use for screenshot-only visual review, broad design optimization, or shared UI bugs already confirmed in both Chrome and UXP.
---

# PS UXP UI RCA

Use this skill to answer one question only:

`Why does this UI behave differently from expectation in Photoshop UXP?`

Keep the investigation simple. Do not turn it into a broad architecture or test
exercise.

## Do Not Use

Do not use this skill when:

- the user only wants a page or screenshot review without repo RCA;
- the problem is already confirmed in both Chrome and UXP and is now ready to
  implement;
- the discussion is about general density, spacing, grouping, or optimization
  without Photoshop-specific evidence;
- the issue can already be explained as a shared UI bug without host or wrapper
  investigation.

## 1. Start From The User Claim

Write a short frame:

```text
Symptom:
Expected:
Runtime: PS only | Chrome only | Both | Unknown
Type: display | click | focus | keyboard | layout | menu/popover | input
```

Then decide the first suspicion:

- `Both wrong` -> likely shared UI or component usage; prefer `ui-fix-guardrails`
  once the bug is confirmed
- `PS only wrong` -> likely wrapper usage, unsupported pattern, or host difference
- `Unknown` -> inspect code first

## 2. Check Repo Truth First

Always inspect these files before guessing:

- `apps/app/AGENTS.md`
- `apps/app/public/manifest.json`
- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/primitives/icon-button.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`

Use them to confirm:

- actual Photoshop / UXP baseline
- locked SWC version (`@spectrum-web-components/icons-workflow` is the only SWC
  dependency; no `@swc-uxp-wrappers/*` form controls remain)
- which native controls the repo already covers
- whether the component already has a repo UXP-safe native path

## 3. Find The Real Ownership Layer

Classify the broken thing:

### A. Self-drawn HTML/CSS

Examples:

- custom `button`, `div`, `span`
- repo radius / spacing / flex layout
- custom badge / chip / overlay

Default suspicion: repo CSS or layout.

### B. Repo UXP-safe native control

Examples:

- `Button`, `TextField`, `Checkbox`, `ActionButton`, `FieldLabel`,
  `HelpText`, `Divider` from
  `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `IconButton` from `apps/app/src/shared/ui/primitives/icon-button.tsx`
- `UxpTextArea` from
  `apps/app/src/shared/ui/components/uxp-form-controls.tsx`

Default suspicion: wrong usage of the repo control API or CSS/flex issue first,
Photoshop second. The repo deliberately uses native HTML controls (not `sp-*`)
for stable dual-runtime coverage; `@swc-uxp-wrappers/*` is no longer a
dependency. Do not assume Spectrum Web Components here.

### C. Custom composite control

Examples:

- `ComposerSelect`
- custom menu / popover / listbox chains

Default suspicion: too much custom behavior for a dual-runtime surface.

## 4. Read The Correct Component Contract

Search local Adobe docs before web search. Pick the doc set by control type:

- native HTML controls (`Button`, `TextField`, `Checkbox`, `UxpTextArea`,
  `IconButton`) → UXP HTML/CSS support docs under `.local/share/uxp` and
  `.local/share/uxp-photoshop`; `Using with React.md` still applies.
- `@spectrum-web-components/icons-workflow` (icons only) → `Spectrum to SWC
  Mapping` under `.local/share/uxp` and the SWC reference under
  `.local/share/uxp-photoshop`.

Read only what you need:

- `Using with React.md`
- the UXP HTML element / CSS property page for the failing native element
- `Spectrum to SWC Mapping` only for icon glyph questions

Core rule:

- documented UXP widget existence does not mean it is the right component for
  this repo
- this repo no longer wraps `sp-*` form controls; native HTML is the contract,
  so Spectrum widget docs do not override UXP HTML/CSS docs for control behavior
- current repo control coverage matters more than generic docs

## 5. Ask Two Narrow Questions

For every defect, answer these first:

1. `Are we using the component correctly?`
2. `If yes, is the pattern itself too custom for PS UXP?`

Typical outcomes:

- wrong slot usage
- wrong boolean attribute usage
- wrong event wiring
- CSS/flex layout mistake
- custom control should be simplified
- wrapper or host behavior likely differs

## 6. Fix Direction

Prefer this order:

1. Fix wrong usage
2. Fix CSS/layout
3. Reduce custom complexity
4. Replace with an already-covered repo UXP-safe native primitive from
   `primitives/native-controls.tsx` or `components/uxp-form-controls.tsx`

Do not jump to host-specific explanations if repo code is already suspicious.

## 7. Expand The Fix Surface Lightly

After finding one misuse, quickly scan for sibling patterns:

- same component misuse elsewhere
- same icon / slot misuse elsewhere
- same radius / flex / layout misuse elsewhere
- same custom composite pattern elsewhere

Fix sibling cases in the same pass when they are clearly the same bug class.

## 8. Keep This Skill Current

After the conversation, if you learned a stable new UXP UI pitfall in this repo,
update:

- `SKILL.md` if the workflow itself was wrong
- `references/source-map.md` if the lookup map was incomplete
- `references/checklist.md` if a short new prompt would help future RCA

Do not turn this skill into a test plan or a large documentation index.

## References

- [references/source-map.md](references/source-map.md)
- [references/checklist.md](references/checklist.md)
