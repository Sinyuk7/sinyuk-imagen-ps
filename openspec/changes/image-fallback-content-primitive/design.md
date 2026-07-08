## Context

The current app surface renders image-preview fallback states in three different hosts:

- the main result preview frame in `main-page.tsx`
- the composer attachment thumbnail row
- the history task thumbnail row

These hosts already own their layout, radius, border, overflow, motion, and surrounding card structure. However, their fallback content is inconsistent. The result frame shows localized text, attachment thumbnails fall back to a blank block, and history thumbnails mix blank blocks, spinners, and an error icon. At the data layer, `assetToPreviewUrl()` and `thumbnail-store` largely collapse distinct preview failures into an empty string, while `task-resource-resolver` preserves only part of the missing vs unresolvable distinction.

The design must stay inside current app-surface boundaries:

- no new card system
- no runtime claims more precise than actual preview evidence
- no hardcoded fallback palette outside existing app theme tokens
- no complex SVG features that are risky under Photoshop UXP

## Goals / Non-Goals

**Goals:**

- Introduce one fallback primitive that renders content inside existing thumbnail and preview-frame hosts.
- Define a stable UI-visible fallback state contract that separates display state from optional diagnostic reason.
- Standardize fallback behavior across attachment thumbnails, history thumbnails, and result preview frames.
- Preserve current host-owned surface/layout contracts and existing motion behavior.
- Create a mapper path that can carry better preview evidence than a bare `url: ''`.
- Keep user-visible copy conservative while preserving room for richer internal diagnostics later.

**Non-Goals:**

- Do not introduce a new standalone card layout or “media-card density.”
- Do not merge preview-display failures with provider-input derivative readiness or upload-readiness state.
- Do not expose `decode-failed` or `unsupported-format` as public UI states in Phase A.
- Do not show “permission failed” user copy without explicit host evidence.
- Do not add complex SVG filters, masks, gradients, noise textures, or external icon packs.
- Do not redesign unrelated image cards, task cards, or Photoshop writeback flows.

## Decisions

### 1. Use `ImageFallbackContent` as a host-interior primitive

The primitive will be named `ImageFallbackContent`, not `ImageFallbackSurface`. It renders only fallback icon/text/action content and does not own container width, height, border, radius, background, overflow, or motion.

Why:

- current hosts already define those properties
- “surface” incorrectly suggests a new layout/card abstraction
- the same content primitive can be mounted inside `att-thumb`, `task-thumb`, and `img-frame`

Alternative considered:

- `ImageFallbackSurface`: rejected because it implies container ownership and increases risk of parallel layout systems.

### 2. Separate UI state from diagnostic reason

The public contract will distinguish user-visible fallback state from optional internal reason:

- `density`: `thumbnail | preview-frame | large-empty`
- `state`: `loading | empty | preview-unavailable | file-missing | resource-unresolvable`
- `reason`: `decode-failed | unsupported-format | host-unavailable | permission-denied | unknown`

Why:

- UI needs stable, conservative states
- internal mapping may learn more detail later
- Phase A evidence does not justify exposing all low-level causes directly to users

Alternative considered:

- exposing all low-level failures as public states: rejected because current contracts cannot prove those distinctions end to end.

### 3. Treat `media-card` as host capacity, not a separate visual density

There will be no dedicated `media-card` density. Large hosts that want more content will still use `preview-frame` behavior, optionally with `detail` and `actionSlot`. `large-empty` remains reserved for true expected-empty surfaces only.

Why:

- failure happens inside an image frame, not at the card-shell level
- a separate density would duplicate layout rules that hosts already own
- `empty` must remain semantically distinct from preview failure

Alternative considered:

- a dedicated `media-card` density: rejected because it creates a second layout language for the same failure state.

### 4. Add a richer preview availability mapping contract

The data layer will stop treating fallback as only `url | ''`. Mapping will combine current signals from:

- `assetToPreviewUrl()` / inline asset previewability
- `thumbnail-store` generation and stored-ref resolution
- `task-resource-resolver` availability (`available`, `missing`, `unresolvable`, `remote-only`)
- host image preview handles and attachment/resource metadata

Phase A mapping rules:

- loading work or pending thumbnail generation → `loading`
- no asset / intentionally empty slot → `empty`
- availability `missing` → `file-missing`
- availability `unresolvable` → `resource-unresolvable`
- preview expected but unresolved URL or failed preview generation without stronger evidence → `preview-unavailable`
- `decode-failed` and `unsupported-format` may populate internal `reason`, but public UI state remains `preview-unavailable`

Why:

- current `''` contract loses necessary UI evidence
- History already has partial availability distinctions worth preserving
- conservative downgrade keeps UI honest in Phase A

Alternative considered:

- keeping only `previewUrl?: string`: rejected because it cannot express loading, missing, or unresolvable consistently.

### 5. Keep preview fallback separate from provider-input derivative state

Preview fallback models display availability only. Provider-input derivative readiness, upload-readiness, or generation-time conversion failures remain on a separate axis and must not be represented as image fallback content states.

Why:

- preview display and provider submission are different product contracts
- current `ImageResource` model already separates `thumbnail` and `providerInput` derivatives
- mixing the two would create misleading UI and tangled recovery logic

Alternative considered:

- using one shared status model for preview and provider-input: rejected because identical status labels would mean different things in different flows.

### 6. Use token-driven monochrome fallback visuals compatible with UXP

Fallback visuals will use simple DOM/CSS with inline SVG paths driven by `currentColor` or CSS variables mapped to existing app semantic tokens. New local variables may include:

- `--image-fallback-icon-color`
- `--image-fallback-title-color`
- `--image-fallback-detail-color`
- `--image-fallback-gap`

These variables will default to existing semantic tokens such as app text, muted text, border, and background-layer tokens.

Why:

- Photoshop UXP is safer with simple SVG/icon patterns
- current repo already owns theme-token generation
- a muted monochrome fallback is less visually noisy when many failures are on screen

Alternative considered:

- colorful illustration-style empty states or complex SVG effects: rejected for both product tone and UXP compatibility risk.

## Risks / Trade-offs

- [Preview evidence still incomplete in some paths] → Some flows may only prove “preview unavailable,” not root cause. Mitigation: keep `reason` optional and degrade to conservative public states.
- [Cross-cutting data contract change] → `mappers`, thumbnail generation, conversation attachments, and history preview state all need alignment. Mitigation: introduce the richer preview contract at shared boundaries before replacing host render branches.
- [Empty vs failure misuse] → Reusing `empty` as an error fallback would hide actual problems. Mitigation: define `empty` strictly as “no image is expected here.”
- [Token drift across hosts] → Host-level CSS may accidentally restyle fallback content inconsistently. Mitigation: define a small fallback token surface and verify in existing CSS contract tests.
- [UXP rendering surprises] → Some valid image bytes may still fail at runtime or appear blank. Mitigation: keep user copy conservative, keep SVG simple, and prefer runtime-safe fallback content.

## Migration Plan

1. Introduce the shared preview-fallback contract and content primitive without replacing all host branches at once.
2. Upgrade shared preview mapping so attachments and preview frames can consume state/reason rather than only `previewUrl`.
3. Integrate the primitive into `att-thumb`, `task-thumb`, and `img-frame`, preserving existing host shells.
4. Add targeted tests for mapper output, host rendering, and CSS/token expectations across thumbnail and preview-frame densities.
5. Keep Phase A user-visible copy conservative; defer any richer diagnostic exposure until the runtime evidence chain is proven.

Rollback is straightforward because no durable schema or external API migration is required. Hosts can fall back to current blank/text placeholders if the shared mapping contract proves unstable.

## Open Questions

- Whether `large-empty` needs a real Phase A host remains open; the contract can keep it reserved without forcing immediate adoption.
- Whether preview diagnostics should later flow through `ImageDerivativeState` directly or through a dedicated preview-result type can be decided during implementation, as long as the public state/reason boundary remains unchanged.
