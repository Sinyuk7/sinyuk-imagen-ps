Status: draft
Authority: current user authorization (2026-07-03)
Owner: cross-boundary slices under `apps/app`, `packages/application`, and `packages/providers`
Created: 2026-07-03

# Main Page Status Visibility And Readiness

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `packages/application/AGENTS.md`
- `packages/providers/AGENTS.md`

Historical design references:

- `docs/loops/2026-07-02-provider-balance-display.md` is a draft reference only. Reuse its billing separation: balance, task cost, provider health, and model availability are separate concerns.
- `docs/loops/2026-07-01-global-generation-settings.md` is a draft reference only. Reuse its placement and output-size semantics where already aligned with current code.

Current code references:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-conversation.ts`
- `apps/app/src/shared/ui/hooks/use-profile-billing.ts`
- `apps/app/src/shared/ui/components/composer-select*.tsx`
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/tests/main-page-*.test.tsx`
- `apps/app/tests/use-conversation.test.tsx`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/types.ts`
- `packages/providers/src/contract/model.ts`
- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/*`

## Goal

Make the main page expose provider/model readiness, generation cost context, compatible model/size choices, retry semantics, placement intent, running phase, and actionable error states before the user reaches a late send-time failure, with mock-only tests proving the app/application/provider contracts.

## Non-goals

- No live provider smoke, paid billing proof, or real account balance proof.
- No real Photoshop / UXP host proof.
- No new mask UI.
- No new multi-image editing product surface beyond representing known or unknown capability.
- No provider health decisions based on billing refresh.
- No balance-driven generation routing, provider disablement, or retry decisions.
- No durable persistence of runtime health, estimated cost, or billing snapshots.
- No broad redesign of settings pages, history page, or provider configuration.
- No change to `packages/core-engine` job lifecycle unless a narrow type boundary is proven necessary.
- No claims that mock tests prove real Photoshop document identity or live provider behavior.

## Scope

Allowed implementation scope:

- `packages/providers/src/contract/model.ts`
- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/*`
- focused provider tests under `packages/providers`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/types.ts`
- focused application tests under `packages/application`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/*`
- `apps/app/src/shared/ui/components/composer-select*`
- `apps/app/src/shared/ui/components/*` for focused status/select primitives
- `apps/app/src/shared/ui/i18n/*`
- `apps/app/src/shared/ui/styles/*` for focused main-page/select/status styling
- focused app tests under `apps/app/tests`
- Chrome E2E only if the final UI behavior cannot be verified through component tests

Forbidden scope:

- `packages/core-engine` unless a compile-time type extension is unavoidable.
- Photoshop / UXP host adapters except for read-only inspection of existing placement contracts.
- Secret storage, provider credential handling, and profile persistence schema unrelated to model capability summaries.
- Provider billing adapter behavior beyond display routing in the app surface.
- Live provider credentials, raw provider payload logs, or paid smoke calls.
- Broad docs cleanup or permanent documentation outside current authority.

## Ownership boundary

- `packages/providers` owns image-model capability rules, operation support, output-size support, and provider-specific request compatibility.
- `packages/application` owns surface-agnostic profile/model command output and any runtime profile-health cache if introduced.
- `apps/app` owns main-page composition, readiness derivation, localized copy, disabled states, tooltips, inline notices, billing display placement, placement labels, and tests through fake services.
- Photoshop placement execution remains host-owned. Shared UI may display the round placement intent, but must pass it through unchanged.
- `packages/core-engine` remains the job lifecycle boundary and should not learn UI readiness semantics.

## Baseline

Known current-state facts:

- `MainPage` derives `canSend` as a single boolean from prompt, profile, running state, and `supportStatus`; disabled reasons are not structured.
- Empty prompt can still be swallowed silently in both `MainPage.handleSend()` and `useConversation.submit()`.
- The profile menu renders profile names only and has no health or probe state.
- The model menu receives only `id` and label options. `ComposerSelectOption` cannot currently express disabled entries, reasons, or capability badges.
- `ProviderModelInfo` carries `supportStatus`, but not operation capability, output-size capability, mask support, multi-image support, or separate availability/capability reasons.
- `packages/providers` already has `resolveImageModelOutput()`, `isSupportedImageModelOutput()`, and `getSupportedImageOutputSizePresets()`; these are the correct provider-owned source for model/size compatibility.
- Billing is visible in multiple places: main balance pill, top last-cost/change text, and positive observed billing toast.
- `useConversation.retry()` currently re-submits an `ok` or `err` round using that round's prompt, profile, model, attachments, output, and provider-input size snapshot. This is too strong for failed-round Retry; the desired failed-round interaction is composer fill only.
- `derivePlacementIntent()` already distinguishes no capture, multiple documents, and source-document placement intent. The result place button does not expose this intent.
- Running state currently shows elapsed seconds plus a generic generating label.

Baseline validation before implementation claims:

```bash
pnpm check:policy
pnpm --filter @imagen-ps/app test -- main-page use-conversation
pnpm --filter @imagen-ps/application test -- profile-models
pnpm --filter @imagen-ps/providers test
```

If baseline validation fails before implementation, report whether it is pre-existing and whether it blocks the slice.

## Design target

### 1. Model capability and availability summary

Add a light, UI-safe model summary that keeps theoretical model capability separate from current profile availability.

Recommended shape:

```ts
type SupportEvidence = 'supported' | 'unsupported' | 'unknown';

interface ProviderModelAvailability {
  readonly status: ProviderModelSupportStatus;
  readonly reason?: ProviderModelAvailabilityReason;
}

interface ProviderModelCapabilities {
  readonly operations: {
    readonly textToImage: ModelOperationCapability;
    readonly imageEdit: ModelOperationCapability;
  };
  readonly inputImages?: {
    readonly maxCount?: number;
    readonly mask: 'supported' | 'unsupported' | 'unknown';
  };
}

interface ModelOperationCapability {
  readonly support: SupportEvidence;
  readonly sizePresets: readonly ('512' | '1k' | '2k' | '4k')[] | 'unknown';
  readonly reason?: ProviderModelCapabilityReason;
}

type ProviderModelAvailabilityReason =
  | 'not-remotely-available'
  | 'auth-failed'
  | 'profile-misconfigured'
  | 'model-discovery-failed'
  | 'unknown';

type ProviderModelCapabilityReason =
  | 'not-in-local-catalog'
  | 'operation-unsupported'
  | 'size-unsupported'
  | 'insufficient-catalog-evidence'
  | 'unknown';
```

Rules:

- Provider catalog remains the capability source.
- Application command output may carry the summary, but does not invent capability facts.
- `supportStatus` and `availability.reason` answer whether this profile can use this model now.
- `capabilities` and `capability.reason` answer what the model theoretically supports.
- Model menu disabled reasons must preserve that difference, so the user knows whether to switch models or fix the provider/profile.
- `unknown` must not be collapsed into `unsupported`.
- Unknown generic/OpenAI-compatible models must not be disabled only because catalog evidence is missing.
- `sizePresets: []` means known no supported sizes; `sizePresets: 'unknown'` means catalog has no size evidence.
- UI copy maps reasons to localized labels.
- Unknown custom models should be selectable only according to current `supportStatus` semantics, but capability badges should be conservative.

### 2. Unified composer readiness

Add a pure app-owned helper that produces exactly one primary readiness state.

Recommended states:

- `ready`
- `generation-in-progress`
- `select-profile`
- `checking-profile`
- `profile-load-failed`
- `select-model`
- `loading-models`
- `model-unavailable`
- `preparing-attachment`
- `attachment-failed`
- `model-does-not-support-image-edit`
- `model-does-not-support-text-to-image`
- `size-unsupported`
- `resolve-placement-conflict`
- `enter-prompt`
- `optimizing-prompt`

Rules:

- `Send` disabled state, tooltip, aria label, and nearby status text read from this helper.
- Prompt empty must become `enter-prompt`, not a click-time no-op.
- Attachments imply `image-edit`; no attachments imply `text-to-image`.
- Model loading should not be represented as ready.
- If there is exactly one reason, show that reason near `Send` or as tooltip.
- Readiness must use a stable blocking priority:
  1. generation in progress
  2. missing/checking/failed profile
  3. missing/loading/unavailable model
  4. attachment preparing or failed
  5. operation capability conflict
  6. size conflict
  7. placement conflict
  8. prompt empty
  9. ready
- System and capability problems take precedence over user input problems. If the selected model cannot edit images and the prompt is empty, show the model conflict first.
- Do not include an `add-input-image` readiness state in the current main page unless an explicit image-edit mode or an image-edit-only model creates a real no-attachment error. Today no attachments means text-to-image.

### 3. Capability-driven menus

Extend `ComposerSelectOption` with disabled and explanatory metadata.

Recommended fields:

```ts
interface ComposerSelectOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly description?: string;
  readonly badges?: readonly string[];
}
```

Rules:

- Incompatible model options stay visible but disabled with a reason.
- Output size options derive from the current selected model plus current operation.
- If the user has never explicitly selected a size and is still on the default, the app may auto-switch to the new model's default compatible size.
- If the user explicitly selected a size, preserve the user's choice and show a size conflict unless there is exactly one deterministic compatible fallback and the app shows inline feedback such as `2K is unavailable; changed to 1K`.
- Size auto-adjustment feedback belongs next to the size control, not in Toast.
- "Show once" means once per actual adjustment event, not once per render.
- Disabled size options may remain visible when useful for explaining capability boundaries.

### 4. Attachment and capture linkage

Rules:

- When the selected model cannot edit images, disable Add Image, Capture, and PS Layers.
- Tooltip text must explain that the current model does not support image input.
- If attachments already exist and the user selects a text-only model, keep attachments and show a local conflict with actions: choose compatible model or remove images.
- Do not silently delete attachments because of a model switch.

### 5. Failed-round Retry is composer fill only

Rules:

- Failed-round `Retry` must not submit a job.
- Failed-round `Retry` must not call application `retryJob`.
- Failed-round `Retry` must not switch profile, provider, model, output size, format, aspect ratio, or provider-input size.
- Failed-round `Retry` only copies that failed round's prompt and attachments into the current Composer.
- After fill, the current Composer remains the source of truth. If the user clicks Send later, the request uses the currently selected profile, model, size, and settings.
- If old attachments cannot be safely reused because their resource derivative was released or evicted, show a local replace-image style message instead of submitting.

Reason:

- This avoids hidden cross-time submission semantics and keeps Retry as a draft-reuse action, not a background job action.

### 6. Billing display layering

Rules:

- Profile-level balance stays in the profile/header/composer summary area.
- Task-level exact cost belongs to the completed round metadata only when the provider explicitly returns cost attributable to that round.
- Observed balance change may be shown on the round only as `Observed balance change`, never as `Cost`.
- Display examples:
  - `Cost CNY 0.08`
  - `Observed balance change -CNY 0.08`
- Normal successful generation should not emit a positive billing toast.
- Toast stays for insufficient balance, user-initiated balance refresh failure, explicit billing authentication failure, or explicit billing API failure.
- Do not implement abnormal billing change Toast until a testable threshold and concurrency rule are defined.
- Background automatic refresh failure should normally show stale state in the billing surface rather than a Toast.
- Billing refresh failure must not alter provider health, model availability, or generation status.

### 7. Placement intent display

Rules:

- Place button label or tooltip derives from `round.placementIntent`.
- For `exact-frame` and `document-only`, keep the button label short (`Place`) and put document/target detail in Tooltip or nearby secondary text.
- For `unbound` with `no-photoshop-capture`, use button text `Place in Active Document`; Tooltip must explain that the destination is the active Photoshop document at click time.
- Do not use `Current Active Canvas`; use `Active Document`.
- For `unbound` with `multiple-documents`, disable the button as `Cannot Place`; show the conflict reason in Tooltip or nearby secondary text. `Placement conflict` is a state, not an action label.
- UI must pass the placement intent through unchanged to `placeAssetOnCanvas()`.

### 8. Running phase and composer editing

Rules:

- Prefer real phase evidence if available from session/job snapshots.
- If only local evidence exists, show local phases such as `Preparing input`, `Submitting`, `Generating`, and `Preparing preview`.
- Do not fake a determinate progress bar.
- Prefer allowing the user to edit the next draft while a generation is running.
- While running, disable Send and any action that would submit or mutate the running task boundary.
- If any Composer control remains locked during running, show the lock reason explicitly.
- Draft edits made during running must not mutate the running round snapshot.

### 9. Error feedback

Rules:

- Map common errors into user-action categories before exposing raw provider text:
  - authentication failed
  - model unavailable
  - model does not support this size
  - image input could not be read
  - provider temporarily unavailable
  - placement conflict
- Primary action should match the category:
  - open provider settings
  - choose supported size
  - choose compatible model
  - replace image
  - fill composer from failed round
- Request ID and raw detail belong in a collapsed or visually secondary details block.

## Slices

### Slice 0: Current-state harness audit

Goal:

Add no product behavior. Confirm which existing main-page tests already cover retry, billing, attachment submission, and placement, and add skipped or pending test names only if the runner supports them without failing default validation.

Allowed scope:

- test files only, or no file changes

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page use-conversation
```

Stop rule:

Stop if existing focused tests fail before implementation and attribution is unclear.

### Slice 1: Provider/application model capability and availability summary

Goal:

Expose model operation and size capability summaries separately from current profile availability through provider-owned catalog helpers and application `listProfileModels()`.

Allowed scope:

- `packages/providers/src/contract/model.ts`
- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/*`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/types.ts`
- focused provider/application tests

Validation:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test -- profile-models
node packages/providers/scripts/check-image-model-catalog.mjs
```

Stop rule:

Stop if model-level mask or multi-image support cannot be evidenced from current catalog/provider code. Represent it as unknown or leave it out instead of guessing.

### Slice 2: Composer readiness pure state

Goal:

Add app-owned readiness derivation and use it for Send disabled reason, tooltip, aria label, and inline status.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- new focused app helper under `apps/app/src/shared/ui/*`
- `apps/app/src/shared/ui/i18n/*`
- focused app tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-composer-controls
```

Stop rule:

Stop if readiness requires provider facts not available from Slice 1 or current `ProviderModelInfo`.

### Slice 3: Model and output-size menus

Goal:

Render capability-driven model and output-size menus with disabled options, separate capability/availability reasons, and the stricter user-selected size conflict/repair rules.

Allowed scope:

- `apps/app/src/shared/ui/components/composer-select*`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/styles/*`
- `apps/app/src/shared/ui/i18n/*`
- `apps/app/tests/composer-select.test.tsx`
- `apps/app/tests/main-page-composer-controls.test.tsx`

Validation:

```bash
pnpm --filter @imagen-ps/app test -- composer-select main-page-composer-controls
pnpm check:policy
```

Stop rule:

Stop if the shared select primitive cannot express disabled options without breaking existing settings/global-generation select usage.

### Slice 4: Attachment linkage and conflict banner

Goal:

Disable image-input entry points for non-edit models and show a local conflict when existing attachments are incompatible with the selected model.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/i18n/*`
- focused attachment tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-attachment-submission main-page-composer-controls
```

Stop rule:

Stop if preserving attachments while blocking send conflicts with current attachment lifetime/disposal semantics.

### Slice 5: Failed-round Retry composer fill

Goal:

Change failed-round Retry into a composer fill action that copies only the failed round's prompt and attachments into the current Composer without submitting or changing profile/model/size settings.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-conversation.ts` only if the existing retry API must be narrowed or split
- `apps/app/src/shared/ui/i18n/*`
- focused app tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-result-rendering main-page-attachment-submission use-conversation
```

Stop rule:

Stop if old failed-round attachments cannot be safely reused after the original round releases or evicts provider-input derivatives.

### Slice 6: Billing display relocation and toast reduction

Goal:

Remove normal positive billing-change Toast, keep profile balance in the summary area, and attach only semantically correct task-level exact cost or observed balance change labels to the completed round.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-profile-billing.ts` only if observation behavior needs a narrow adjustment
- `apps/app/src/shared/ui/i18n/*`
- `apps/app/tests/main-page-billing.test.tsx`

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-billing
```

Stop rule:

Stop if the app cannot associate the observed post-generation billing state with the correct round without adding durable billing state or pretending balance delta is exact task cost.

### Slice 7: Placement label and running phase

Goal:

Expose placement intent on result actions with short action labels and replace generic running status with reliable phase labels while preserving draft-edit boundaries.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/shared/ui/hooks/use-conversation.ts` only for app-local phase evidence
- `apps/app/src/shared/ui/i18n/*`
- focused app tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-result-rendering main-page-placement-writeback use-conversation
node apps/app/scripts/verify-placement-core.mjs
```

Stop rule:

Stop if a desired placement label requires real Photoshop document names not stored in current round/task evidence.

### Slice 8: Error card action mapping

Goal:

Map common failed-round errors to user-facing categories, primary repair actions, and secondary details.

Allowed scope:

- `apps/app/src/shared/ui/pages/main-page.tsx`
- new app-local error classification helper
- `apps/app/src/shared/ui/i18n/*`
- focused app tests

Validation:

```bash
pnpm --filter @imagen-ps/app test -- main-page-result-rendering
```

Stop rule:

Stop if provider errors lack structured category/detail evidence and the mapping would require guessing provider-specific semantics from raw strings.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test -- main-page use-conversation composer-select
```

Final:

```bash
pnpm validate
```

Manual-only:

- Optional Chrome visual review of model menu, output-size menu, disabled controls, running card, and placement button copy.
- Optional Photoshop / UXP smoke only if implementation touches host placement execution or host document evidence. UI labels alone do not require host proof.

Live-provider:

- Not part of default validation.
- Only run with explicit user approval because it may require credentials and incur cost.

## Required test coverage

- Provider model capability summary includes text-to-image support, image-edit support, and size presets derived from catalog rules without mixing in availability.
- `gpt-image-1` exposes both text-to-image and image-edit capability, with separate size summaries for each operation.
- `dall-e-3` represents text-to-image-only capability and its independent size limits.
- A catalog-unknown model keeps operation and size capability as `unknown`, not `unsupported`.
- `listProfileModels()` preserves current discovery semantics while adding separate availability and capability summaries.
- Composer readiness reports `enter-prompt` instead of silent no-op when no higher-priority blocker exists.
- Composer readiness priority is stable when multiple blockers exist; capability/system blockers win over prompt-empty.
- Send disabled reason is singular and user-visible for no profile, no model, loading model, unsupported operation, unsupported size, and running.
- Model menu keeps incompatible models visible but disabled with a reason that distinguishes availability from capability.
- Output size menu derives options from current model and operation.
- Size incompatibility after model switch preserves explicit user size unless a deterministic fallback is applied with inline feedback near the size control.
- Add Image, Capture, and PS Layers disable when current model cannot edit images.
- Existing attachments are not deleted when switching to an incompatible model.
- Failed-round Retry copies only that failed round's prompt and attachments into the current Composer.
- Failed-round Retry does not call `submitJob`, does not call `retryJob`, and does not switch profile, provider, model, output size, format, aspect ratio, or provider-input size.
- Normal successful generation does not emit a positive billing toast.
- Round metadata labels provider-returned task cost as `Cost`.
- Round metadata labels balance delta only as `Observed balance change`.
- Placement button copy derives from `round.placementIntent` without putting long document names in the button.
- Multiple-document placement conflict does not silently choose active document.
- Unbound placement says `Place in Active Document` and explains click-time dynamic target semantics.
- Running card shows phase labels without claiming determinate progress, and draft edits during running do not mutate the running round.
- Error card prioritizes a repair action and keeps request ID/raw detail secondary.

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- The team must choose between provider-level health only, endpoint-level health, or model-level health for the profile dropdown.
- Model capability facts are not available from current provider catalog and would require live provider assumptions.
- UI behavior would disable an unknown catalog model as unsupported rather than preserving unknown capability.
- A desired cost estimate requires model pricing data not present in repo-owned code or trusted provider response evidence.
- Billing delta would be presented as exact task cost without exact provider evidence.
- An abnormal billing-change Toast is requested without a testable threshold and concurrency rule.
- Placement labels require Photoshop document names or active-document identity not present in current task/round snapshots.
- Composer unlock during a running task would require changing session single-task semantics.
- A slice requires `packages/core-engine` ownership changes outside the allowed boundary.

## Recommended Decision Packet defaults

If execution must start immediately:

- A. Implement app-only readiness using existing `supportStatus`.
- B. Implement provider/application capability summary first, then app readiness and menus.
- C. Implement profile health, capability menus, billing relocation, placement labels, and errors in one broad UI pass.

Recommendation:

- Choose B.

Reason:

- A improves copy but leaves model/size compatibility unsupported by data.
- C has too much blast radius and makes failures hard to attribute.
- B aligns with repository ownership: provider owns capability facts, application transports them, app renders readiness.

For profile health:

- A. Show only configured/enabled/model-loading status in the profile dropdown.
- B. Add runtime endpoint-probe health cache and display healthy/degraded/unreachable.
- C. Treat billing refresh as profile health.

Recommendation:

- Start with A unless the user explicitly prioritizes live connectivity status; choose B as a separate slice after readiness. Reject C.

## Completion report

Future execution report must include:

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

No. This draft does not establish durable implementation truth until slices are executed and validated.
