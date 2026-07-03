---
name: uxp-issue-rca
description: >
  Manual-only Photoshop UXP RCA workflow. Use only when the user explicitly
  invokes `$uxp-issue-rca` or explicitly asks for this log-first
  owner-localization workflow. Do not auto-select from a generic
  Photoshop/UXP bug report. Trigger: "$uxp-issue-rca", "use uxp-issue-rca",
  "run the UXP RCA workflow".
---

# UXP Issue RCA

## Trigger Mode

Manual-only.

- Enter this skill only when the user explicitly invokes `uxp-issue-rca` or explicitly asks for this RCA workflow.
- Do not auto-enter just because the task mentions Photoshop, UXP, Chrome-vs-UXP divergence, logs, or a panel failure.
- Inside an already-active `uxp-issue-rca` run, a UI-owned finding may hand off to `uxp-ui-debugger`. Outside that workflow, do not auto-switch skills.

Use this skill to answer:

`What failed in the real Photoshop UXP plugin, where is the likely owner, and how can the finding be verified?`

This skill is about investigation, ownership, and dispatch. Do not spend skill space explaining how to design or implement the code change.

## Hard Boundary

This skill owns only the question:

`What failed, which layer owns it, and should the next step stay in RCA or move to uxp-ui-debugger?`

It does not own UI debugging or UI source edits.

- If the issue is already confirmed as a pure UI bug, do not use this skill. Use `uxp-ui-debugger`.
- If the issue is mixed or unclear, this skill may inspect UI-facing evidence only far enough to decide owner.
- If the result is `UI owner confirmed`, stop here and hand off. Do not continue into DOM probes, style mutation, harness authoring, or UI source changes.
- If the result is `non-UI owner confirmed`, stay in this skill.

## 1. Frame The Investigation

Start with a compact frame:

```text
Symptom:
Expected:
Runtime: Photoshop UXP | Chrome | Both | Unknown
Type: UI | Non-UI | Mixed
Evidence available:
First evidence target:
Confidence limit:
```

Classify the symptom:

- `Non-UI`: provider, profile, command, storage, dispatch, Photoshop bridge, persistence, startup, build/load, request/response.
- `UI`: layout, rendering, click, focus, keyboard, menu/popover, icon, input, visual state.
- `Mixed`: a UI surface shows a runtime/backend failure; start from logs and persisted state, then decide whether the owner is UI or non-UI.

Dispatch rule:

- `UI` at intake: route directly to `uxp-ui-debugger` unless the report still lacks enough evidence to distinguish UI from runtime failure.
- `Mixed`: this skill owns the triage until one owner is localized.
- `Non-UI`: this skill owns the RCA.

## 2. Read Real UXP Logs First

When the issue happened in Photoshop, inspect real plugin data before guessing from repo code:

```sh
UXP_DATA="$HOME/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/27/Developer/com.imagen-ps.panel/PluginData"
UXP_LOGS="$UXP_DATA/logs"
find "$UXP_LOGS" -type f -name '*.jsonl' -exec ls -lt {} + | head -20
```

Primary log shape:

`PluginData/logs/YYYY-MM-DD/imagen.jsonl`

Use the newest relevant log by timestamp. Grep event names, command IDs, request IDs, model/profile IDs, stack fragments, and exact error strings. If logs are missing or stale, inspect `PluginData/` for plugin state, caches, settings, persisted profiles, and host-storage artifacts before assuming the app did not run.

Startup/load failures can still appear in `PluginData/logs/YYYY-MM-DD/imagen.jsonl` because `apps/app/vite.uxp.config.ts` injects a zero-dependency bootstrap logger before the app bundle.

When the panel is reachable and RCA needs real host inspection beyond log files, use `node scripts/uxp-debug/uxp-debug.mjs` as the default Photoshop UXP probe surface. Do not switch to ad hoc DevTools-only DOM inspection or Photoshop window automation.

## 3. Localize The Owner

For non-UI issues, trace from the log event or persisted plugin state to one owner:

- UXP shell or adapter: `apps/app/src/shells/uxp`, `apps/app/src/adapters/uxp`
- Photoshop bridge / host IO: UXP adapter and host bridge code
- application seam: shared ports or application package
- core engine: job/dispatch lifecycle
- provider transport/config: provider package or profile settings path
- persistence: UXP storage, secureStorage, recent logs, profile state

For UI-looking symptoms, use logs and repo evidence only to separate:

- visible-only layout/rendering defect;
- event or handler failure;
- host/runtime divergence;
- data/runtime-backed UI defect;
- Chrome simulator mismatch.

Stop once one of these is true:

- `pure UI owner confirmed` -> hand off to `uxp-ui-debugger`;
- `non-UI owner confirmed` -> continue RCA in this skill;
- `still ambiguous` -> report the missing evidence and next probe.

When confirming whether a symptom belongs to UI or not, inspect repo primitives before external docs:

- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/primitives/icon-button.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`
- `apps/app/src/shared/ui/components/icons.tsx`

Use local Adobe docs only when component or host behavior is unclear:

- `.local/share/uxp`
- `.local/share/uxp-photoshop`

Repo-specific facts:

- The repo uses native HTML controls for stable dual-runtime coverage; do not assume `sp-*` widgets or `@swc-uxp-wrappers/*` are available.
- `@spectrum-web-components/icons-workflow` is for icons only.
- Shared UI must not branch on runtime or host identity. Runtime differences belong in capabilities, ports, adapters, or shell ownership.
- The simulator and fake UXP tests are not proof of real Photoshop behavior.

## 4. Handoff Rule For UI Ownership

When the finding resolves to a pure UI issue, hand off with a compact transfer packet:

```text
Dispatch: hand off to uxp-ui-debugger
Why it is UI-owned:
Failing surface:
Selectors/components suspected:
Real host evidence already collected:
Runtime/non-UI causes ruled out:
First UI probe to run:
```

Do not keep investigating inside this skill after the transfer packet is complete.

## 5. Report Evidence, Not Implementation

Return the RCA state in this shape:

```text
Symptom:
Runtime:
Log evidence:
PluginData evidence:
Repo evidence:
Likely owner:
Confirmed cause:
Dispatch:
Unknowns:
Next probe:
```

Use `Confirmed cause` only when log and repo evidence close the loop for the owning layer. Otherwise leave it as `not confirmed` and name the next probe.

`Dispatch` must be exactly one of:

- `stay in uxp-issue-rca`
- `hand off to uxp-ui-debugger`

Evidence boundaries:

- Screenshot/video can prove visible breakage, not runtime cause.
- Chrome harness can suggest layout ownership, not prove Photoshop host behavior.
- Fake UXP tests can prove adapter contract shape, not real host IO.
- Real Photoshop smoke is manual evidence.
- Stop the skill output at RCA evidence, likely owner, dispatch decision, and next probe.
