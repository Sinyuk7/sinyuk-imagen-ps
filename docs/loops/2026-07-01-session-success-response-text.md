# Session Success Response Text

Status: draft
Authority: current user authorization on 2026-07-01
Owner: cross-boundary slices under `apps/app` and `packages/providers`; no `packages/core-engine` or durable history ownership in this Loop
Created: 2026-07-01

## Context docs

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `apps/app/AGENTS.md`
- Current authority: `packages/providers/AGENTS.md`
- Historical reference only: `docs/dev-memory/memories/architecture/prompt-optimizer.md`
- Draft reference only, not active authority: `docs/loops/2026-07-01-global-generation-settings.md`

## Goal

Add session-only optional success-response text on `main-page`, backed by a
formal provider text contract and a global generation-settings toggle, with
plain-text rendering, mock-provider debug text, and mock-only validation through
`pnpm validate`.

## Non-goals

- No `HistoryPage` text rendering.
- No durable `TaskRecord` / restart persistence for response text.
- No `packages/core-engine` schema or lifecycle changes.
- No Markdown / rich text / HTML rendering.
- No live-provider smoke or real Photoshop / UXP proof.
- No broad settings IA redesign beyond one new generation-settings toggle in the
  existing global settings page.
- No raw provider payload dump, secret echo, or full request/response logging.
- No provider-specific success-card layout branches beyond mock-specific text
  content generation.

## Product semantics

- Success response text is session-only. Clearing the session or reloading the
  app drops it.
- The stable provider result contract should grow an optional `text?: string`
  field. UI must not depend on `raw` for success-text rendering.
- `main-page` success cards should render text when:
  - the composed response text is non-empty; and
  - either the global generation setting toggle is enabled, or the text is the
    only visible result content for that round.
- If no text exists, success cards stay image-only and behave exactly like
  today.
- The global toggle only hides supplemental success text for image-bearing
  results. It must not create an empty success card.
- If text exists but no image exists, the success card still renders as a valid
  result card with header plus text body even when the toggle is off.
- A completed image operation that returns no image assets must not silently
  look identical to a normal image-success card. The card needs a distinct
  text-only result treatment such as a neutral/info result label.
- Text is plain text only. Preserve line breaks with wrapped rendering. No
  Markdown parsing, linkification, or provider HTML.
- Default collapsed height is `3` lines. Expand / collapse is per-round,
  ephemeral UI state only, and appears only when the rendered text exceeds three
  lines.
- Text layout in success cards is `header -> text -> image -> action row`.
- The global toggle defaults to `on`.
- `sizePreset` is singular per request. One send carries one semantic output
  size preset value, not a list.

## UI and interaction target

### Global settings

- Extend the existing global generation settings model with one boolean toggle
  under a dedicated result-display group on `global-generation-settings-page`.
- Working semantics:
  - group: result display
  - label: show provider response text
  - default: enabled
  - scope: all providers, all current-session success cards
  - helper text: provider-returned text is shown in generated results; this
    changes UI display only and does not change the generation request
  - helper note: response text is current-session-only and is not written into
    history
- Do not mirror this toggle into the providers list summary row. It is a global
  display preference, not a provider capability or provider-profile property.

### Main-page success bubble

- Provider avatar, provider name, elapsed/done status, image carousel, place
  button, and download action remain in their current positions.
- Insert a new plain-text body region inside the success provider card between
  `.prov-top` and `.prov-img`.
- Text styling target:
  - same neutral card surface as the existing provider card;
  - body text, not monospace by default;
  - `white-space: pre-wrap` / equivalent preserved newlines;
  - 3-line clamp by default;
  - break long unspaced strings / URLs without widening the card;
  - a stable low-emphasis text button row:
    - `Expand response ▾`
    - `Collapse response ▴`
  - toggle appears only when truncation actually occurs.
- If the setting is off, remove the text region entirely rather than reserving
  empty space for image-bearing results.
- If the success card is text-only, omit image-specific chrome such as image
  count, hover overlay, place button, and download action.
- Response text must support copy.
- Preferred interaction:
  - text remains selectable when the runtime allows it;
  - card exposes `Copy response` even if native text selection is unreliable in
    UXP.
- Expand / collapse behavior:
  - each round is independent;
  - width changes re-evaluate truncation;
  - new rounds and retries do not inherit old expand state;
  - expanding a long reply should not abruptly jump the user away from the
    current card.

### Mock debug text target

- `MockProvider` should return deterministic success text by default so UI
  behavior can be exercised without live providers.
- `MockProvider` is a testing provider, so its returned text may be technical
  and inspection-oriented.
- The displayed mock success text should help inspect one request, not act as a
  product copywriting sample.
- Keep it concise and stable inside the same success-text body region. Do not
  introduce a separate debug panel or secondary card just for mock results.
- Prefer a compact labeled text block over a raw JSON dump.
- Target information priority:
  - operation
  - selected model
  - prompt
  - output size preset, output format, aspect ratio
  - provider input max side
  - image count and mask presence
  - emitted asset count
  - fail/delay simulation markers when present
- The format should remain readable under the default 3-line clamp. Favor short
  labeled lines over paragraph prose.
- Photoshop placement and document details are app-owned context, not provider
  contract data. If shown in mock success text, they must be appended by
  `apps/app` from existing session data, not synthesized inside
  `packages/providers`.

## Scope

Allowed files and areas:

- `apps/app/src/shared/ports/app-generation-settings.ts`
- `apps/app/src/shared/ui/hooks/use-generation-settings.ts`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/global-generation-settings-page.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/styles/conversation.ts`
- `apps/app/src/shared/ui/i18n/messages.ts`
- focused app tests under `apps/app/tests/*generation-settings*`,
  `apps/app/tests/main-page.test.tsx`, and
  `apps/app/tests/use-conversation.test.tsx`
- `packages/providers/src/contract/result.ts`
- `packages/providers/src/transport/chat-image/*`
- `packages/providers/src/providers/chat-image/*`
- `packages/providers/src/providers/mock/*`
- focused provider tests under `packages/providers/tests/chat-image-provider.test.ts`
  and `packages/providers/tests/mock-provider.test.ts`
- narrow `packages/application` or workspace type/test adjustments only if the
  new `ProviderInvokeResult.text` field causes compile-time fallout

Forbidden files and areas:

- `packages/core-engine/**`
- durable history contracts in `packages/core-engine/src/types/task.ts`
- `apps/app/src/shared/ui/pages/history-page.tsx`
- Photoshop host IO behavior or document matching logic
- provider credentials, secret storage, or raw transport logging
- broad settings/profile schema redesign
- live-provider or manual-host-only validation as acceptance proof

## Ownership boundary

- `apps/app` owns:
  - generation-settings toggle persistence and UI;
  - session-only `ConversationRound` text mapping;
  - main-page success-card rendering and collapse/expand interaction;
  - any app-owned supplemental context text derived from attachments or
    `PlacementIntent`.
- `packages/providers` owns:
  - the stable `ProviderInvokeResult.text` contract field;
  - `chat-image` upstream text normalization from `message.content`;
  - mock-provider default debug-text generation from provider-visible request
    data.
- `packages/application` may absorb narrow type/test adjustments only if needed
  by the new provider result field, but it must not gain UI state, DOM, host IO,
  or provider raw parsing responsibilities.
- `packages/core-engine` is out of scope. Session-only rendering must not force
  durable task schema changes.

## Baseline

Before implementation:

```bash
pnpm check:policy
```

Current on-disk baseline already includes:

- global generation-settings storage and page;
- main-page success cards with image-only success rendering;
- `chat-image` parsing that sees `message.content` in shape but drops it;
- `mock` provider success output that returns images plus a small `raw` debug
  object, but no stable text field.

If baseline validation fails, report whether the failure is pre-existing. Only
continue if unrelated failures do not block attribution for this Loop.

## Canonical design target

### Provider result contract

```ts
interface ProviderInvokeResult {
  assets: readonly Asset[];
  text?: string;
  diagnostics?: ProviderDiagnostics;
  raw?: unknown;
  created?: number;
  usage?: ProviderInvokeUsage;
  metadata?: ProviderInvokeMetadata;
}
```

Contract intent:

- `text` is optional and stable for production consumers.
- `raw` remains non-stable and must not be required by the success-text UI.
- Provider families with no meaningful success text simply omit `text`.

### App session text composition

`apps/app` should map provider text into a session-visible field such as
`ConversationRound.responseText?: string`.

For the `mock` family only, the displayed text may be composed into one
continuous plain-text response from:

1. provider-owned debug text from `ProviderInvokeResult.text`;
2. app-owned local request context derived from:
   - selected model
   - current generation settings
   - attachment count/types
   - `PlacementIntent`
   - existing Photoshop capture placement evidence

This preserves the provider boundary while still surfacing Photoshop-related
placement facts in the current session, without creating a separate mock-only
debug surface.

## Slices

### Slice 1: Generation-settings toggle

Goal: add one global generation-settings toggle that controls whether success
response text is explicitly rendered in the current session.

Allowed scope:

- app generation-settings contract/store
- global generation-settings page
- settings summary text if needed
- focused app tests

Required behavior:

- new boolean setting defaults to `true`
- setting persists through existing app storage adapters
- global settings page exposes the toggle with clear helper text
- no per-profile override and no provider config ownership

Validation:

```bash
pnpm --filter @imagen-ps/app test -- global-generation-settings-page settings-page chrome-adapter
```

Stop rule: stop if the toggle cannot live in app-owned generation settings
without moving into provider-profile config or durable task state.

### Slice 2: Provider success-text contract

Goal: add a stable optional provider success-text field and normalize upstream
text where supported.

Allowed scope:

- `packages/providers/src/contract/result.ts`
- `packages/providers/src/transport/chat-image/*`
- `packages/providers/src/providers/chat-image/*`
- `packages/providers/src/providers/mock/*`
- focused provider tests

Required behavior:

- `ProviderInvokeResult.text?: string` becomes the stable channel
- `chat-image` extracts plain text from upstream `message.content` when present
- `chat-image` still succeeds when upstream returns images with no text
- `mock` provider returns deterministic plain-text debug text by default
- no provider needs UI imports, host IO, or app/session state

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- chat-image-provider mock-provider
```

Stop rule: stop and produce a Decision Packet if current code/tests/docs cannot
support a stable plain-text normalization rule for `chat-image.message.content`.

### Slice 3: Session mapping and main-page success bubble

Goal: render optional success-response text on `main-page` without changing
history persistence.

Allowed scope:

- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/styles/conversation.ts`
- `apps/app/src/shared/ui/i18n/messages.ts`
- focused app tests

Required behavior:

- `ConversationRound` gains an optional session-only text field
- success cards render text above images when the toggle is on and text exists
- text-only results still render text when the toggle is off
- text uses plain-text rendering with preserved newlines
- default collapse is three lines
- expand / collapse state is per-round and not persisted
- success cards support text-only replies
- when the toggle is off, supplemental text on image-bearing results does not
  render
- existing image placement/download interactions continue to work unchanged
- text reply affordances include a stable expand/collapse control and copy
  action
- image-generation rounds with zero assets and non-empty text use a distinct
  text-only result label/tone rather than looking identical to normal image
  success

Mock-family app-owned context target:

- if mock debug text is shown, append or compose concise local context into the
  same visible response body using existing session state only
- allowed local context fields:
  - one `sizePreset` value for the current request
  - output format
  - aspect ratio
  - provider input max side
  - attachment count / type summary
  - placement kind
  - `documentId`, `documentName`, `documentSizeAtCapture`, and
    `placementRect` when already present on `PlacementIntent` or capture
    evidence
- do not add host-only context to provider contracts or durable task history

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page use-conversation global-generation-settings-page
```

Stop rule: stop if satisfying Photoshop-context text would require moving host
placement data into `packages/providers` or durable task records.

### Slice 4: Narrow compatibility fallout

Goal: absorb only compile-time or test fallout caused by the new provider result
field, without broadening runtime ownership.

Allowed scope:

- narrow type/test-only updates in `packages/application` or shared workspace
  imports

Validation:

```bash
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if runtime behavior changes are needed in
`packages/application` to preserve current-session-only text.

### Slice 5: Final validation

Goal: prove the mock-only repository gate passes after the full slice.

Validation:

```bash
pnpm validate
```

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test -- chat-image-provider mock-provider
pnpm --filter @imagen-ps/app test -- main-page use-conversation global-generation-settings-page settings-page chrome-adapter
pnpm --filter @imagen-ps/application test
```

Final:

```bash
pnpm validate
```

Manual-only:

- none required for Loop acceptance

Live-provider:

- none; keep this Loop mock-only

## UX acceptance scenarios

- short one-line provider text under an image result
- long multi-line provider text with real truncation and expand/collapse
- text containing blank lines
- one very long URL or unspaced token
- multiple rounds expanded independently
- panel width change causing truncation to appear or disappear
- whitespace-only or newline-only text should not create a response region
- image-bearing result with toggle on vs off
- text-only result with toggle on vs off
- image operation completed with zero assets and non-empty text
- mock debug text with appended Photoshop-context lines
- keyboard focus on expand response, collapse response, and copy response
- expanding a long response keeps the current card readable and does not cause a
  disorienting scroll jump

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- `chat-image.message.content` cannot be normalized into one stable plain-text
  rule from current code/tests/docs;
- mock debug requirements expand into a demand for raw HTTP payload dumps,
  provider-secret echo, or a separate mock-only debug panel;
- Photoshop placement details are requested inside provider contracts rather than
  app-owned session composition;
- current-session-only scope is no longer acceptable and the slice would need
  durable history schema changes;
- the settings toggle placement requires a broader settings navigation or layout
  redesign than this Loop allows.

## Completion report

The executing agent must report:

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

Maybe yes, but only if implementation establishes a durable repository rule for
session-only success text versus durable history, or if the provider/app split
for mock debug text and Photoshop context proves stable enough for future work.
