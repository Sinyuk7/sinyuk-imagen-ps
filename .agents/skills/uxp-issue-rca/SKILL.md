---
name: uxp-issue-rca
description: Diagnose Imagen Photoshop UXP plugin issues from real host logs and repo evidence. Use for final-test defects, Photoshop/UXP runtime failures, UI or non-UI regressions, Chrome-vs-UXP divergence, provider/profile/status failures surfaced in the panel, and requests that need fast root-cause localization plus a verifiable UXP UI or runtime smoke path. Do not use for broad new requirements, provider contract redesign, or approved Loop execution.
---

# UXP Issue RCA

Use this skill to answer:

`What failed in the real Photoshop UXP plugin, where is the likely owner, and how can the finding be verified?`

This skill is about investigation and UXP verification. Do not spend skill space explaining how to design or implement the code change.

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
- `Mixed`: a UI surface shows a runtime/backend failure; start from logs, then inspect UI only after runtime evidence is understood.

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

## 3. Localize The Owner

For non-UI issues, trace from the log event or persisted plugin state to one owner:

- UXP shell or adapter: `apps/app/src/shells/uxp`, `apps/app/src/adapters/uxp`
- Photoshop bridge / host IO: UXP adapter and host bridge code
- application seam: shared ports or application package
- core engine: job/dispatch lifecycle
- provider transport/config: provider package or profile settings path
- persistence: UXP storage, secureStorage, recent logs, profile state

For UI issues, still start from logs. Then separate:

- visible-only layout/rendering defect;
- event or handler failure;
- host/runtime divergence;
- data/runtime-backed UI defect;
- Chrome simulator mismatch.

For UXP-specific UI behavior, inspect repo primitives before external docs:

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

## 4. Verify UXP UI Findings

UXP UI bugs need a verification surface that isolates the failing behavior. Use the normal app surface if it is enough; otherwise use or extend a harness.

Use the UXP CSS contract board for CSS/layout/control behavior:

- Chrome: `?harness=uxp-css-contract`
- Photoshop UXP: set before reloading the plugin:

```js
localStorage.setItem('imagenPsPanelHarness', 'uxp-css-contract');
```

Clear after the manual check:

```js
localStorage.removeItem('imagenPsPanelHarness');
```

When existing modules do not isolate the symptom, add a focused test module to `apps/app/src/harness/components/uxp-css-contract/uxp-css-contract-harness.tsx`. Add or update `apps/app/tests/uxp-css-contract-harness.test.tsx` only for harness selectors/structure that should stay stable.

Use the icon visual harness for icon replacement or inline SVG mapping questions:

- harness: `apps/app/harness/icon-visual/`
- script: `apps/app/harness/icon-visual/check-icon-rects.js`
- proof: expected icon selectors have non-zero bounding rects in real Photoshop.

Manual Photoshop / UXP proof is a separate gate. Record it as manual evidence; do not describe it as covered by `pnpm validate`.

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
UXP UI verification:
Manual host evidence:
Unknowns:
Next probe:
```

Use `Confirmed cause` only when log, repo, and verification evidence close the loop. Otherwise leave it as `not confirmed` and name the next probe.

Evidence boundaries:

- Screenshot/video can prove visible breakage, not runtime cause.
- Chrome harness can isolate layout logic, not prove Photoshop host behavior.
- Fake UXP tests can prove adapter contract shape, not real host IO.
- Real Photoshop smoke is manual evidence.
- Stop the skill output at RCA evidence, likely owner, verification path, and next probe.
