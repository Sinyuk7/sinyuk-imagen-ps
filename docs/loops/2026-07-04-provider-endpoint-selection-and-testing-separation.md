Status: draft
Authority: current user authorization (2026-07-04)
Owner: `apps/app` provider settings UX, with `packages/application` command orchestration and `packages/providers` connectivity seams
Created: 2026-07-04

# Provider Endpoint Selection And Testing Separation

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `packages/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`
- active current-authority Loop: `docs/loops/2026-07-04-provider-architecture-audit-remediation.md` — current authority for provider transport work; this new document is a user-authorized draft and does not replace the root active-loop pointer

Historical / design references:

- `docs/loops/2026-07-03-settings-form-unification.md` — completed settings-form design analysis; use as design/history input only
- user-supplied endpoint management mockups and interaction notes from this turn

Current code references:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- `apps/app/src/shared/ui/styles/responsive.ts`
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/src/shared/ports/commands-port.ts`
- `packages/application/src/commands/profile-endpoints.ts`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/commands/types.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/config.ts`
- `packages/providers/src/contract/config-schema.ts`
- `packages/providers/src/transport/image-endpoint/failover.ts`
- `packages/providers/src/providers/image-endpoint/provider.ts`
- `packages/providers/src/providers/chat-image/provider.ts`
- focused tests under `apps/app/tests/`, `packages/application/src/commands/*.test.ts`, and `packages/providers/tests/`

## Goal

Define and execute a bounded redesign of provider endpoint management so provider add/detail pages present a simpler endpoint selection model, split provider-level connection testing from endpoint-level speed measurement, and preserve repo-owned ownership boundaries with mock-only validation.

## Non-goals

- No broad main-page, history-page, or composer redesign.
- No new BaseProvider abstract class.
- No live provider validation or real Photoshop / UXP proof as a default gate.
- No change to image generation request semantics beyond the endpoint-selection contract explicitly covered here.
- No billing, model picker, or global-generation-settings redesign outside the endpoint/testing surfaces they directly depend on.
- No broad transport retry/failover rewrite beyond the minimum semantic changes required by the new endpoint-selection contract.
- No permanent documentation outside the approved high-authority set.

## Scope

Allowed implementation scope:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ui/styles/pages.ts`
- `apps/app/src/shared/ui/styles/responsive.ts`
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/src/shared/ports/commands-port.ts`
- focused app tests and chrome-e2e harness updates under `apps/app/tests/`
- `packages/application/src/commands/profile-endpoints.ts`
- new focused command files under `packages/application/src/commands/`
- `packages/application/src/commands/index.ts`
- `packages/application/src/commands/types.ts`
- focused application command tests
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/config.ts`
- `packages/providers/src/contract/config-schema.ts`
- focused provider files needed to expose provider-level test and endpoint-measurement seams
- focused provider tests
- `docs/ENGINEERING_CONTEXT.md` only if durable contract knowledge changes
- `docs/TESTING.md` only if validation guidance materially changes

Forbidden scope:

- `packages/core-engine/**`
- `packages/foundation/**`
- Photoshop host IO behavior
- provider billing semantics
- output-size or composer state contracts
- unrelated docs cleanup
- paid live-provider smoke or release-test expansion
- replacing the root active-loop pointer unless the user explicitly asks

## Ownership boundary

- `apps/app` owns endpoint editor layout, hover states, button hierarchy, inline status rendering, Auto/Manual UX affordances, and page-level loading partitioning between endpoint measurement and provider test connection.
- `packages/application` owns draft-aware profile command orchestration, secret resolution, input/output command types, and the split between provider-level test vs endpoint-level measurement commands.
- `packages/providers` owns provider contract seams for connectivity and endpoint measurement, plus any default helper behavior used by built-in providers. It must not take UI state or persistence ownership.
- `packages/core-engine` stays unaware of provider settings UI, endpoint measurement status, and provider test-connection UX.

## Baseline

Known current-state facts from on-disk code:

- UI still models endpoint selection as `selectionMode: manual | auto`, `failoverEnabled`, and `preferredEndpointId`.
- Endpoint rows still render `Endpoint 1`, `Endpoint 2`, `Preferred`, per-row enabled checkbox, and a bottom `Auto Select` + `Fail over when unavailable` cluster.
- Current `probeProfileEndpoints()` is a draft-aware command that probes each enabled endpoint by forcing one-endpoint manual config and calling `provider.discoverModels()`.
- The current bottom `Test connection` button is therefore endpoint-discovery-oriented, not a provider-owned connection test contract.
- `normalizeProviderConnectionDraft()` drops `preferredEndpointId` in auto mode and keeps `failoverEnabled` independent from `selectionMode`.
- Provider runtime failover currently uses `connection.failoverEnabled` and `connection.selectionMode` as separate semantics.

Baseline validation before implementation claims:

```bash
pnpm check:policy
pnpm --filter @imagen-ps/app test -- settings-add settings-detail app-shell uxp-css-compat
pnpm --filter @imagen-ps/application test -- profile-endpoints profile-models provider-profiles
pnpm --filter @imagen-ps/providers test -- provider-config-endpoints image-endpoint-provider chat-image-provider retry-endpoint-failover
```

If baseline validation fails:

- report whether the failure is pre-existing;
- do not use that failure to justify broadening scope;
- stop and produce a Decision Packet if attribution between UI, application, and provider layers becomes unclear.

## Frozen product decisions

These decisions are fixed for this Loop unless a Decision Packet reopens them:

1. Endpoint rows stop exposing ordinal labels such as `Endpoint 1`.
2. `Preferred` terminology is removed from the UI and replaced by a current-selection concept.
3. `Fail over when unavailable` is removed as a separate user-facing control.
4. `Auto Select` becomes the single user-facing strategy switch:
   - `off` = user-controlled manual selection;
   - `on` = system-controlled endpoint selection plus automatic failover.
5. Provider-level `Test connection` and endpoint-level `Speed test` are different features and must not share one overloaded command.
6. Endpoint speed-test results render inline per row.
7. Module-level `Speed test` is not a primary page action; bottom `Provider Test Connection` remains the stronger page-level validation action.
8. In Auto mode, user clicks on endpoint rows do not change the selected endpoint.
9. In Auto mode, if all measured endpoints are unavailable, runtime `resolvedEndpointId` becomes `undefined` / `null`; the UI may keep a fallback highlight, but the data model must not lie about a valid resolved endpoint.
10. Switching `Manual -> Auto` immediately triggers one background endpoint measurement pass when the profile has at least one valid enabled endpoint; users should not need to click `Speed test` first to let the system take control.
11. Because the repo is in a zero-user stage, conflicting legacy endpoint-selection config should be cleaned up directly rather than preserved indefinitely for backward UX compatibility.

## Field semantics migration table

| Current field / state | Proposed contract | Owner | Notes |
|---|---|---|---|
| `selectionMode: 'manual' | 'auto'` | keep | `packages/providers` + `packages/application` | Still the top-level strategy switch. |
| `failoverEnabled: boolean` | remove from user-facing config; derive from `selectionMode === 'auto'` | `packages/providers` contract + `packages/application` orchestration | Implementation may temporarily preserve storage compatibility during migration, but the editable semantic is gone. |
| `preferredEndpointId` | rename to `selectedEndpointId` or equivalent current-selection term | `packages/providers` contract + `packages/application` + `apps/app` | Manual-mode persisted selection only. |
| `suggestedEndpointId` | replace with session/runtime `resolvedEndpointId` or `measuredBestEndpointId` | `packages/application` / UI session state | Used for Auto-mode visual current selection; not persisted as profile config by default. May be empty when all endpoints fail. |
| row blue dot | `resolvedSelectedEndpointId` derived UI state | `apps/app` | Manual mode: persisted selected endpoint. Auto mode: runtime-resolved endpoint. |
| per-row probe status text (`healthy`, `degraded`) | explicit measurement result model (`idle`, `running`, `success(ms)`, `failed(reason)`) | `packages/application` + `apps/app` | Endpoint speed results must be UX-oriented, not raw discovery-state strings. |
| implicit empty row after `+` | explicit UI-only `draft row` state | `apps/app` | Not part of persisted/command endpoint collection until minimally valid. |

Recommended migration rule:

- persisted profile config owns `selectionMode`, `selectedEndpointId`, `endpoints`;
- runtime-only state owns `resolvedEndpointId`, per-endpoint measurement results, and provider-test status;
- Auto mode must not silently rewrite the persisted manual selection every time a measurement result changes.

## UI state machine

The endpoint module needs one explicit state machine across four dimensions:

1. selection strategy: `manual` | `auto`
2. endpoint measurement: `idle` | `running` | `complete`
3. provider test connection: `idle` | `running` | `success` | `failure`
4. row interaction lane: `select` | `locked-by-auto` | `delete-hover` | `measurement-status`

### Row interaction rules

Manual mode:

- row click selects that endpoint;
- selected row shows blue dot + selected border/background;
- hover shows stronger row background and delete affordance;
- non-measuring rows may reveal delete on hover when more than one endpoint exists.

Auto mode:

- row click does not switch selected endpoint;
- the module treats selection as system-owned;
- recommended default: row remains visually readable but selection click is disabled, and any attempted click may emit one low-priority toast such as `Auto Select is managing endpoint choice`;
- hover affordance should not look like a selectable radio-style action in Auto mode;
- current highlighted row comes from runtime `resolvedEndpointId`, not direct user click.

### Trailing-slot rules

Idle:

- right side is empty by default;
- on hover, show delete icon if deletion is allowed and the row is not currently blocked by running measurement.

Measurement running:

- right side shows spinner/loading state;
- delete action is hidden or disabled to avoid accidental mutation during in-flight measurement.

Measurement complete:

- right side shows success latency such as `195ms`, slow success such as `945ms`, or localized failure text such as `Failed` / `Timeout`;
- result display takes precedence over delete affordance;
- failure states should expose reason details via tooltip/popover without crowding the row text.

Hover override:

- even in `Measurement complete`, hover gets the final say for destructive affordance;
- on hover, the row may temporarily hide the latency/failure summary and reveal the delete icon when deletion is allowed;
- on pointer leave, the measurement result reappears;
- running measurement remains non-destructive: hover must not re-enable delete while the row is actively measuring.

### Module-level Auto-mode decision rules

If Auto mode is on and speed test returns at least one success:

- choose the best available endpoint using the command result order/ranking;
- update runtime `resolvedEndpointId`;
- highlight that row as the current system-selected endpoint.
- tie-breaker must be stable:
  - first keep the current `resolvedEndpointId` if it is still among the best-ranked endpoints;
  - otherwise fall back to the earliest configured endpoint index among the tied winners;
  - do not let repeated measurement runs cause meaningless focus jitter between equally good endpoints.

If Auto mode is on and all endpoints fail:

- set runtime `resolvedEndpointId` to empty;
- UI may keep the previous highlight as a stale visual fallback if that helps continuity, but it must not be represented as a resolved healthy endpoint in command state;
- show a module-level warning banner/notice: `All endpoints are unavailable. Check network or add a new endpoint.`
- do not silently switch to a random failed endpoint and present it as healthy.

Auto-mode click feedback:

- default to non-click affordance rather than corrective toast spam;
- use cursor / hover / opacity treatment so non-selected rows do not advertise manual selection when Auto mode owns the decision;
- reserve toast usage for rare explicit education moments, not as the default response to ordinary clicks.

### Provider-test independence

- endpoint measurement running must not block alias editing, endpoint input editing, or provider-level test button rendering longer than necessary;
- provider-level `Test connection` gets its own loading state and status lane;
- endpoint measurement and provider test must not share one ambiguous `busy` flag if that would freeze unrelated controls.
- draft and secret snapshots used by endpoint measurement vs provider test must be captured per command invocation so concurrent clicks do not read partially-mutated shared state.

### Draft row rule

- clicking `+` creates a UI-only draft row first;
- a draft row stays invisible to command orchestration until it passes basic local URL validation;
- while draft-only:
  - no measurement status;
  - no auto-selection ownership;
  - no synthetic failure rendering;
  - no accidental inclusion in background Auto-mode measurement;
- promotion from draft row into the real endpoint collection happens on blur/confirm once the URL is minimally valid.

### URL readability rule

- compact endpoint lists must not rely on naive tail ellipsis alone because endpoint differences often live in the suffix;
- preferred default: non-editing row content uses middle ellipsis or a similarly scannable summarized display;
- keep full URL available on focus, edit mode, or tooltip;
- avoid hiding the differentiating suffix of similar endpoints.

## Command split proposal

Current problem:

- `probeProfileEndpoints()` currently mixes endpoint-level connectivity probing, model discovery, and summary status suitable for the bottom `Test connection`.
- that overload makes it impossible to represent endpoint speed measurement and provider-level test as independent UX concepts.

Recommended split:

### 1. `measureProfileEndpoints()`

Owner: `packages/application`

Purpose:

- draft-aware endpoint-only measurement for the request-address management module.

Expected output:

- per-endpoint status;
- latency when available;
- failure reason kind + short detail;
- best endpoint candidate for Auto mode;
- optional diagnostics safe for tooltip/debug display.

Behavior:

- resolve current draft config and secrets;
- measure enabled endpoints independently;
- return `unsupported` when the provider family does not implement endpoint measurement;
- do not claim provider-level readiness from this command alone;
- do not persist profile changes.

### 2. `testProviderProfileConnection()`

Owner: `packages/application`

Purpose:

- provider-level connection test for the page footer action.

Expected output:

- one provider-level result: success / warning / failure;
- provider-owned message or normalized fallback message;
- optional provider-returned metadata such as discovered model count when relevant.

Behavior:

- command resolves the current draft config and secrets;
- then delegates to provider-owned connectivity behavior;
- provider may implement custom logic;
- if no custom logic exists, application may use a documented default path built from provider helpers, but not by reusing the endpoint speed-test UX contract.
- if the provider does not support a meaningful connection test, return an explicit unsupported state so UI can hide or disable the footer action intentionally rather than leaving a confusing idle button.

### 3. `refreshProfileModels()`

Owner: `packages/application`

Purpose:

- keep model-list refresh as a separate concern;
- do not let endpoint measurement become the new generic model-refresh path by accident.

### Provider seam recommendation

Recommended provider-contract direction:

- add explicit optional provider methods such as:
  - `measureEndpoints?()`
  - `testConnection?()`

Do not require a BaseProvider class for this.

Instead:

- keep the seam interface-based under `packages/providers`;
- provide built-in helper functions for families that share default behavior;
- allow image-endpoint/chat-image/prompt-optimize/mock to opt into different implementations without pushing UI concerns downward.

## Dynamic feedback and error-detail constraints

- Endpoint failure text must distinguish `Failed`, `Timeout`, and similar states where possible.
- Failure rows should expose short cause details on hover/focus tooltip, for example:
- Failure rows should expose short cause details on hover/focus tooltip, for example:
  - `DNS resolution failed`
  - `Connection timed out`
  - `Authentication failed`
- Tooltips must not leak secrets, raw headers, or resolved secret-bearing config.
- Provider-level test failures may be longer-lived inline notices; endpoint measurement failures should stay compact per row plus tooltip detail.
- Measurement results become stale after any endpoint URL edit, enable/disable change, strategy change, or secret change that could invalidate the result.
- Stale results should clear predictably rather than linger as if still authoritative.
- Success states should be visually quiet:
  - latency text in neutral/subtle color by default;
  - no aggressive success icon required;
  - reserve red/orange emphasis for failure or warning conditions.
- If Auto mode changes the highlighted endpoint after measurement, use a soft focus-transition treatment rather than a harsh jump so users can track the system decision.

## Visual hierarchy constraints

- page footer `Provider Test Connection` is the emphasized page-level validation action;
- endpoint-module `Speed test` is a secondary/tonal/outline action, not a competing primary button;
- only one dominant primary action cluster should exist on the page at a time;
- endpoint rows need a clear hover background in Manual mode to advertise click-to-select affordance;
- Auto mode must reduce that affordance so the interface does not promise a click outcome it will refuse.
- `Speed test` should not visually overpower `Provider Test Connection`;
- if endpoint measurement is unsupported for the current provider, hide or clearly disable the module-level action rather than presenting a dead primary-looking control.

## Slices

## Slice 0: Freeze terminology, fields, and state-machine contract

Goal:

Produce one implementation-ready terminology and state contract across UI, application, and provider seams before code changes.

Allowed scope:

- this Loop doc
- targeted inspection of current code and tests

Forbidden scope:

- product implementation
- schema edits

Validation:

- quick: none beyond document review

Stop rule:

- stop and produce a Decision Packet if `preferredEndpointId` must remain user-visible due to an external persisted contract not evidenced in code/tests.

## Slice 1: `apps/app` endpoint module redesign

Goal:

Replace the current endpoint editor interaction model with the new row list, Auto/Manual affordances, hover/delete behavior, and split module/page actions.

Allowed scope:

- `apps/app/src/shared/ui/components/provider-profile-editor.tsx`
- relevant settings pages, styles, i18n, and app tests

Forbidden scope:

- `packages/application`
- `packages/providers`

Validation:

```bash
pnpm --filter @imagen-ps/app test -- settings-add settings-detail app-shell uxp-css-compat
pnpm --filter @imagen-ps/app test:chrome-e2e
```

Stop rule:

- stop if the UI rewrite requires unsupported UXP CSS features, or if Auto-mode row locking cannot be expressed without breaking keyboard/focus behavior in the current control set.
- stop if the compact row design cannot preserve URL differentiability without expanding into an unauthorized broader endpoint-card redesign.

## Slice 2: Application command separation

Goal:

Split endpoint measurement from provider-level connection testing, with draft-aware orchestration and independent status models.

Allowed scope:

- `packages/application/src/commands/`
- `apps/app/src/shared/ports/commands-port.ts`
- focused application tests

Forbidden scope:

- provider transport behavior changes beyond command-call seam preparation
- app visual implementation beyond wiring

Validation:

```bash
pnpm --filter @imagen-ps/application test -- profile-endpoints profile-models provider-profiles
pnpm --filter @imagen-ps/app test -- settings-add settings-detail
```

Stop rule:

- stop and produce a Decision Packet if one split command still needs to own both model discovery and provider-level health semantics to satisfy existing tests/contracts.
- stop if concurrent draft mutation, secret replacement, or Auto-toggle remeasurement introduces an unresolved race that cannot be bounded with per-invocation snapshots.

## Slice 3: Provider seam extraction

Goal:

Expose provider-owned connection-test and endpoint-measurement seams without introducing a broad provider hierarchy rewrite.

Allowed scope:

- `packages/providers/src/contract/provider.ts`
- focused built-in provider files
- focused provider tests
- minimal application command wiring needed by the new seam

Forbidden scope:

- broad retry/failover architecture refactor unrelated to this feature
- BaseProvider class introduction
- app surface ownership drift into providers

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- provider-config-endpoints image-endpoint-provider chat-image-provider retry-endpoint-failover
pnpm --filter @imagen-ps/application test -- profile-endpoints
```

Stop rule:

- stop and produce a Decision Packet if a generic provider seam cannot support both endpoint measurement and provider-level test without forcing unsupported family-specific abstractions.

## Slice 4: Config migration and runtime-selection semantics

Goal:

Remove or hide independent `failoverEnabled` editing, migrate `preferred` semantics to current selection, and preserve runtime ordering semantics safely.

Allowed scope:

- `packages/providers/src/contract/config.ts`
- `packages/providers/src/contract/config-schema.ts`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `packages/application/src/commands/types.ts`
- focused tests in app/application/providers

Forbidden scope:

- unrelated persistence migrations
- core-engine changes

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- provider-config-endpoints retry-endpoint-failover
pnpm --filter @imagen-ps/application test -- profile-endpoints provider-profiles
pnpm --filter @imagen-ps/app test -- settings-add settings-detail app-shell
```

Stop rule:

- stop if config compatibility requires a repo-wide persisted schema migration not bounded to current profile config normalization.
- because this is a zero-user phase, do not stop merely to preserve conflicting legacy endpoint-setting UX; prefer direct cleanup unless a real code-level compatibility boundary proves otherwise.

## Slice 5: Closeout harness and documentation writeback

Goal:

Prove the new UX and seam separation through focused tests and write durable contract summaries into canonical docs if implementation stabilizes.

Allowed scope:

- focused tests
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- relevant module `AGENTS.md` only if durable rules changed

Forbidden scope:

- new permanent docs outside approved authority

Validation:

```bash
pnpm validate
```

Manual-only evidence:

- optional Chrome screenshot/harness comparison for hover, Auto/Manual, and failure states
- no real Photoshop or live provider proof required by default

Stop rule:

- stop if final behavior claims depend on live network/provider semantics not covered by mock-only harnesses.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- app-focused: `pnpm --filter @imagen-ps/app test -- settings-add settings-detail app-shell uxp-css-compat`
- application-focused: `pnpm --filter @imagen-ps/application test -- profile-endpoints profile-models provider-profiles`
- provider-focused: `pnpm --filter @imagen-ps/providers test -- provider-config-endpoints image-endpoint-provider chat-image-provider retry-endpoint-failover`

Final:

- `pnpm validate`

Manual-only:

- optional chrome-e2e or screenshot comparison for endpoint module states
- do not claim this proves real Photoshop / UXP host behavior

Live-provider:

- not approved for this Loop by default

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- `preferredEndpointId` cannot be safely renamed or reinterpreted without breaking persisted-config compatibility beyond bounded normalization.
- provider families need fundamentally different test-connection abstractions that cannot fit one optional seam shape.
- endpoint speed measurement would require paid or side-effecting requests for any built-in provider family.
- Auto-mode visual current selection cannot be defined without conflating persisted manual selection and runtime chosen endpoint.
- row-delete and result-display affordances cannot coexist within UXP-safe layout constraints.
- the existing active provider-architecture Loop needs to be amended or superseded for this work to proceed.

## Completion report

When a slice is executed, report:

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

## Memory note candidate

No by default.

Promote to `yes: architecture` only if implementation stabilizes a durable repo-wide contract for:

- provider-level test vs endpoint-level measurement separation;
- Auto-mode endpoint-selection semantics;
- or persisted-vs-runtime endpoint selection ownership.
