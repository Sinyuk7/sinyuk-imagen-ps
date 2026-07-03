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

- Enter this skill only when the user explicitly invokes `uxp-issue-rca` or explicitly asks for this workflow.
- Do not auto-enter just because the task mentions Photoshop, UXP, logs, Chrome-vs-UXP divergence, or a panel failure.
- Inside an active `uxp-issue-rca` run, a pure UI finding may hand off to `uxp-ui-debugger`. Outside that workflow, do not auto-switch skills.

Use this skill to answer:

`What failed in the real Photoshop UXP plugin, which layer owns it, and is more probing actually needed?`

This skill is RCA-only. Do not spend skill space designing the code change.

## Hard Boundary

This skill owns only:

`what failed / likely owner / dispatch / whether unknowns block action`

It does not own UI debugging, DOM probing after UI owner is confirmed, or source edits.

- If the issue is already confirmed as pure UI, do not use this skill. Use `uxp-ui-debugger`.
- If the issue is mixed or unclear, this skill may inspect UI-facing evidence only far enough to decide owner.
- If current evidence already localizes owner with high confidence and another repro would not change owner, dispatch, or the immediate fix path, say so. Do not demand another repro just to satisfy the workflow.

## 1. Frame The Intake

Start compactly:

```text
Symptom:
Runtime: Photoshop UXP | Chrome | Both | Unknown
Type: UI | Non-UI | Mixed
Evidence:
First target:
```

Classify:

- `Non-UI`: provider, profile, command, storage, dispatch, Photoshop bridge, persistence, startup, build/load, request/response.
- `UI`: layout, rendering, click, focus, keyboard, menu/popover, icon, input, visual state.
- `Mixed`: a UI surface shows a runtime/backend failure; start from logs and persisted state, then decide owner.

Dispatch rule:

- `UI` at intake: route directly to `uxp-ui-debugger` unless the report still lacks enough evidence to separate UI from runtime failure.
- `Mixed`: this skill owns triage until one owner is localized.
- `Non-UI`: this skill owns the RCA.

## 2. Read Real UXP Evidence First

When the issue happened in Photoshop, inspect real plugin data before repo code:

```sh
UXP_DATA="$HOME/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/27/Developer/com.imagen-ps.panel/PluginData"
UXP_LOGS="$UXP_DATA/logs"
find "$UXP_LOGS" -type f -name '*.jsonl' -exec ls -lt {} + | head -20
```

Primary log shape:

`PluginData/logs/YYYY-MM-DD/imagen.jsonl`

Use the newest relevant log by timestamp. Grep event names, command IDs, request IDs, model/profile IDs, stack fragments, and exact error strings.

If logs are missing or stale, inspect `PluginData/` state, caches, settings, persisted profiles, and host-storage artifacts before assuming the app did not run.

Startup/load failures can still appear in `PluginData/logs/YYYY-MM-DD/imagen.jsonl` because `apps/app/vite.uxp.config.ts` injects a bootstrap logger before the app bundle.

When the panel is reachable and real-host inspection is needed beyond log files, use `node scripts/uxp-debug/uxp-debug.mjs` as the default Photoshop UXP probe surface. Do not switch to ad hoc DevTools-only DOM inspection or Photoshop window automation.

## 3. Localize The Owner

Trace from the strongest real evidence to one owner:

- UXP shell or adapter: `apps/app/src/shells/uxp`, `apps/app/src/adapters/uxp`
- Photoshop bridge / host IO
- application seam
- core engine / dispatch lifecycle
- provider transport / config
- persistence / profile state
- shared UI surface

For UI-looking symptoms, use logs and repo evidence only to separate:

- visible-only layout/rendering defect
- event or handler failure
- host/runtime divergence
- data/runtime-backed UI defect
- Chrome simulator mismatch

When confirming UI vs non-UI, inspect repo primitives before external docs:

- `apps/app/src/shared/ui/primitives/native-controls.tsx`
- `apps/app/src/shared/ui/primitives/icon-button.tsx`
- `apps/app/src/shared/ui/components/uxp-form-controls.tsx`
- `apps/app/src/shared/ui/components/icons.tsx`

Use local Adobe docs only when component or host behavior is still unclear:

- `.local/share/uxp`
- `.local/share/uxp-photoshop`

Repo-specific facts:

- The repo uses native HTML controls for dual-runtime coverage; do not assume `sp-*` widgets or `@swc-uxp-wrappers/*`.
- `@spectrum-web-components/icons-workflow` is for icons only.
- Shared UI must not branch on runtime or host identity.
- Simulator and fake UXP tests are not proof of real Photoshop behavior.

Stop once one of these is true:

- `pure UI owner confirmed`
- `non-UI owner confirmed`
- `still ambiguous and the ambiguity changes owner or fix path`

## 4. Unknowns Rule

Treat `Unknowns` as optional, not mandatory.

Include `Unknowns` only when the missing evidence could still change at least one of:

- owner
- dispatch
- immediate fix path

Omit `Unknowns` when the missing detail is only confirmatory, quantitative, or nice-to-have.

Examples of non-blocking unknowns:

- exact before/after quota value when the owner is already localized to balance presentation
- one missing stack frame when the failing branch is already identified
- another repro of an already-obvious UI defect shown by current evidence

If current evidence is enough for the next owner to start work with high confidence, say that directly:

`Next: start fix in <owner/surface>. no further probe needed.`

Ask for another repro or probe when current evidence is stale, contradictory, still owner-ambiguous, or when the remaining doubt could still change the immediate fix path.

## 5. Handoff Rule For UI Ownership

When the finding resolves to a pure UI issue, stop RCA and hand off with a compact packet:

```text
Dispatch: hand off to uxp-ui-debugger
Owner:
Why UI:
Surface:
Evidence:
Next:
```

`Next` should name the first UI surface to inspect. If current evidence already isolates the UI logic, say `no more repro needed`.

## 6. Output Contract

Keep the final output short and readable.

- Prefer 6-8 lines total.
- Prefer one sentence per field.
- Prefer at most 3 evidence bullets or one compact paragraph.
- Do not restate the whole investigation history.
- Do not pad with extra caveats after the owner is already clear.

Return the RCA state in this shape:

```text
Symptom:
Runtime:
Evidence:
Owner:
Cause:
Dispatch: stay in uxp-issue-rca | hand off to uxp-ui-debugger
Next:
Unknowns: <only if blocking>
```

Field rules:

- `Evidence`: strongest real log/PluginData/repo facts only.
- `Owner`: one owning layer, not a long list.
- `Cause`: use `confirmed` when evidence closes the loop; otherwise use `likely` plus the specific missing blocker.
- `Next`: either the next probe or the start-fix/handoff action.
- `Unknowns`: omit unless it is blocking by the rule above.

Evidence boundaries:

- Screenshot/video can prove visible breakage, not runtime cause.
- Chrome harness can suggest layout ownership, not prove Photoshop host behavior.
- Fake UXP tests can prove adapter contract shape, not real host IO.
- Real Photoshop smoke is manual evidence.
