---
name: ps-uxp-ui-rca
description: Diagnose Photoshop UXP UI display, click, focus, layout, or interaction defects in apps/app when the user explicitly says the issue appears in Photoshop, UXP, or differs between Chrome and PS. Use for fast RCA of broken rendering, wrong spacing, missing icons, bad focus or keyboard behavior, click failures, popover or menu issues, wrapper misuse, and “Chrome normal but PS abnormal” questions. Prefer this skill when Codex must inspect repo versions, wrapper aliases, local Adobe docs, and current component usage before proposing a fix.
---

# PS UXP UI RCA

Use this skill to answer one question only:

`Why does this UI behave differently from expectation in Photoshop UXP?`

Keep the investigation simple. Do not turn it into a broad architecture or test
exercise.

## 1. Start From The User Claim

Write a short frame:

```text
Symptom:
Expected:
Runtime: PS only | Chrome only | Both | Unknown
Type: display | click | focus | keyboard | layout | menu/popover | input
```

Then decide the first suspicion:

- `Both wrong` -> likely repo CSS or component usage
- `PS only wrong` -> likely wrapper usage, unsupported pattern, or host difference
- `Unknown` -> inspect code first

## 2. Check Repo Truth First

Always inspect these files before guessing:

- `apps/app/AGENTS.md`
- `apps/app/public/manifest.json`
- `apps/app/package.json`
- `apps/app/vite.uxp.config.ts`
- `apps/app/src/shared/ui/primitives/spectrum-controls.tsx`

Use them to confirm:

- actual Photoshop / UXP baseline
- locked SWC version
- which `@swc-uxp-wrappers/*` are really in use
- whether the component already has a shared wrapper-safe path

## 3. Find The Real Ownership Layer

Classify the broken thing:

### A. Self-drawn HTML/CSS

Examples:

- custom `button`, `div`, `span`
- repo radius / spacing / flex layout
- custom badge / chip / overlay

Default suspicion: repo CSS or layout.

### B. Wrapper-safe `sp-*`

Examples:

- `sp-button`
- `sp-action-button`
- `sp-textfield`
- `sp-checkbox`
- `sp-switch`

Default suspicion: wrong component usage first, Photoshop second.

### C. Custom composite control

Examples:

- `ComposerSelect`
- custom menu / popover / listbox chains

Default suspicion: too much custom behavior for a dual-runtime surface.

## 4. Read The Correct Component Contract

Search local Adobe docs before web search.

Use:

- `.local/share/uxp`
- `.local/share/uxp-photoshop`

Read only what you need:

- `Using with React.md`
- the exact component page
- `Spectrum to SWC Mapping`

Core rule:

- documented UXP widget existence does not mean it is the right component for
  this repo
- current repo wrapper coverage matters more than generic docs

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
4. Replace with an already-covered wrapper-safe primitive

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
