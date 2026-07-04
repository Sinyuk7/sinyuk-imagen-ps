Status: draft
Authority: current user authorization to draft plan; not active until root `AGENTS.md` points here or the user explicitly starts execution
Owner: `apps/app` shared UI with `packages/application` command surface dependency
Created: 2026-07-04

# API Format Profile UI

## Context Docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`

Related draft:

- [`2026-07-04-api-format-provider-contract.md`](2026-07-04-api-format-provider-contract.md)

## Goal

Replace the current provider-type add/edit flow with one API profile editor that lets users enter endpoint/base URL nodes, token, and default model while the app displays the detected API format returned by application commands.

## Non-Goals

- No direct imports from `@imagen-ps/providers`.
- No Profile / Surface / ModelRoute UI.
- No video, media asset, or deferred task UI.
- No real provider live smoke.
- No host storage format migration in UI; storage shape is owned by application commands.
- No legacy profile UI compatibility; product has never launched and old provider-type/profile-family paths should be removed cleanly.
- No separate page per provider/adapter.

## Scope

Allowed:

- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- shared settings/profile editor components under `apps/app/src/shared/ui/**`
- app UI i18n message catalogs
- app tests and Chrome E2E tests covering settings/profile flows
- `packages/application` command type consumption only if required by app compile

Forbidden:

- Provider request builders, response parsers, transport, and registry.
- Application runtime/profile resolver implementation.
- Core engine dispatch/job lifecycle.
- UXP host IO and storage adapters except through existing app service wiring.
- New permanent docs unless durable UI behavior must be promoted after implementation.

## Ownership Boundary

- `apps/app` owns labels, form layout, endpoint/base URL input UX, advanced settings visibility, validation presentation, and command orchestration.
- `packages/application` owns command contracts, persistence, secret refs, endpoint classification result shape, profile save/test/measure behavior.
- `packages/providers` owns API format definitions and protocol/path semantics in the related provider Loop.

## Baseline

Before implementation:

- Run `pnpm --filter @imagen-ps/app test`.
- Run `pnpm --filter @imagen-ps/app build:chrome`.
- If either fails before edits, report baseline failure and stop unless clearly unrelated and the user approves continuing.

## Slices

1. Unified add-profile page
   - Goal: remove the separate provider-type selection step and show one API profile form.
   - Required fields:
     - Profile Name
     - Endpoint URL or Base URL Nodes
     - API Token
     - Default Model
     - Advanced settings
   - Stop rule: stop if application commands still require UI-visible legacy provider-family selection.
   - Validation: focused app tests for add page render and save command payload.

2. API format detection and presentation
   - Goal: show the supported API format detected from endpoint/path input without requiring users to choose it manually.
   - Required behavior:
     - UI does not require users to select API Format for recognized endpoints.
     - application classification result is shown as read-only feedback.
     - no persisted profile contains `auto`.
     - unrecognized endpoints cannot be saved as supported profiles.
     - if users provide only a root/base URL with no recognizable path, keep the base URL value, require a recognizable path or later command-provided classification, and highlight the missing detection state.
     - UI may display a detected format, but save commands must still derive or revalidate the API format from the final path config.
   - Stop rule: stop if command contract lacks a deterministic classification result.
   - Validation: app tests for detection display, unsupported state, and save payload.

3. Base URL node editor
   - Goal: keep endpoint nodes as base URLs only.
   - Required behavior:
     - users can configure multiple base URL nodes.
     - duplicate detection remains over canonical base URL node values.
     - path fields are not stored in `connection.endpoints[].url`.
     - all stored nodes share one profile-level API format and path config.
     - base-URL-only nodes are not independently classified.
     - adding a full endpoint URL whose classified format or protocol suffix conflicts with the profile is rejected with a create-separate-profile message.
   - Stop rule: stop if existing endpoint measurement command cannot accept new command payload.
   - Validation: app tests for duplicate node validation and measurement command input.

4. Full URL paste assistant
   - Goal: allow users to paste full URLs as a convenience while storing base URL and paths separately.
   - Required behavior:
     - recognized full URL fills base URL node, API format, and path config.
     - recognized path-only input updates path config only.
     - URL splitting keeps stable protocol suffixes in path config and stores everything before that suffix, including version/prefix segments, in the base URL node.
     - examples:
       - `https://api.deepseek.com/v1/chat/completions` -> base URL `https://api.deepseek.com/v1`, path `/chat/completions`.
       - `https://foo.com/openai/v1/chat/completions` -> base URL `https://foo.com/openai/v1`, path `/chat/completions`.
       - `https://llm-api.net/v1beta/models/gemini-2.5-flash-image:generateContent` -> base URL `https://llm-api.net/v1beta`, path template `/models/{model}:generateContent`, extracted default model `gemini-2.5-flash-image`.
     - extracted Gemini model may fill Default Model only if the user has not manually edited the model field.
     - an edit-only OpenAI Images URL such as `/images/edits` may fill Edit Path but leaves the profile incomplete until Generation Path is provided.
     - non-empty query strings are unsupported and must not be silently dropped; hash fragments may be ignored.
     - unrecognized input shows unsupported format guidance and does not guess.
     - Auto Detect is an action/result state, not a saved profile value.
   - Stop rule: stop if classifier behavior is not available from application commands or shared app-safe helpers.
   - Validation: unit tests for UI handler cases.

5. Advanced path/auth settings
   - Goal: show API-format-specific advanced settings.
   - Required behavior:
     - OpenAI Images: Generation Path and optional Edit Path.
     - OpenAI Chat Completions: Invoke Path.
     - Gemini GenerateContent: Invoke Path Template only; do not expose a separate API Version field.
     - Auth defaults:
       - OpenAI Images: Bearer.
       - OpenAI Chat Completions: Bearer.
       - Gemini GenerateContent: `x-goog-api-key`, with Bearer available for compatible relays.
     - auth mode options are `bearer`, `x-goog-api-key`, and `none`.
     - API keys remain secret fields and are not represented as ordinary extra headers.
     - token shape is not used as protocol evidence; do not warn based on prefixes such as `sk-`.
   - Stop rule: stop if path config semantics are not finalized by provider Loop.
   - Validation: app tests for conditional fields and payload.

6. Model and connection actions
   - Goal: refresh/test/measure actions use API profile fields and still hide provider internals.
   - Required behavior:
     - "Default Model" may remain in profile settings for this Loop.
     - Default Model always supports manual input.
     - Refresh Models is shown/enabled only when application commands report model discovery support.
     - unsupported model discovery is a capability state, not a connection failure.
     - connection test uses detected API format/path/token through commands.
     - Test Connection must not trigger paid generation; paid generation smoke remains explicit live/release-only work.
     - tri-state connection results render distinctly: Connected, Could not verify without generating content, or Connection failed.
   - Stop rule: stop if application model commands still require legacy `providerId` only.
   - Validation: existing settings-detail tests plus focused additions.

7. Copy and i18n cleanup
   - Goal: replace user-facing provider-family/provider-type copy with API profile/API format copy.
   - Required behavior:
     - keep technical identifiers untranslated: `API Key`, `Base URL`, and model IDs.
     - keep detected API format labels untranslated: `OpenAI Images`, `OpenAI Chat Completions`, `Gemini GenerateContent`.
     - no user-facing `image-endpoint`, `chat-image`, or `provider family`.
     - no hidden legacy provider-type selection UI remains.
   - Stop rule: stop if copy change needs a broad visual redesign.
   - Validation: app tests and manual Chrome visual check if layout changes.

8. Chrome E2E smoke
   - Goal: prove the settings flow remains usable in the Chrome harness.
   - Required behavior:
     - seed/add/edit profile flow works with mock/app command fakes.
     - no text overflow or incoherent overlap at existing representative viewports.
   - Stop rule: stop if responsive defects require unrelated layout refactor.
   - Validation: `pnpm --filter @imagen-ps/app test:chrome-e2e` when the implementation changes rendered settings flows.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm --filter @imagen-ps/app test:chrome-e2e` for rendered settings-flow changes

Final:

- `pnpm validate`

Manual-only:

- Optional Photoshop/UXP visual smoke only if shared UXP CSS or Spectrum behavior changes.

Live-provider:

- None.

## Decision Packet Triggers

Produce an A/B/C Decision Packet if:

- provider/application API-format command contracts are not available.
- unified add page cannot preserve current profile save/test behavior.
- full URL parsing has ambiguous behavior that would silently store the wrong base URL or path.
- Auto Detect result can drift from edited form state without save-time contract validation.
- UI treats an unverified connection test as successful/green.
- UI needs direct provider imports to render supported formats.
- responsive layout cannot fit the new fields within current settings page constraints.

## Completion Report

Executor must report:

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

Yes: decision, if implementation confirms that the user-facing profile model is API profile + detected API format + base URL nodes + path config.
