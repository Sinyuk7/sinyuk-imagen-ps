# New Model Information Brief

Use this document to collect the complete fact set for one new image model.
Goal: produce a model brief that is good enough for any implementation team to wire the model correctly.

This document is intentionally implementation-agnostic. It describes what must be known, not how this repository stores it.

## 1. Model Identity

Collect:

- Canonical public model ID
- Alternative IDs, aliases, vendor-prefixed IDs, historical IDs
- Human-facing model name
- Vendor / brand
- Whether the model is a first-party model or a routed/relay model

Questions:

- What is the single canonical ID that should anchor all downstream references?
- Which alternate strings must still resolve to the same model?
- Which name should appear in user-facing pickers and settings?

Definition of done:

- One canonical ID is chosen.
- All known aliases are listed.
- One display name is approved.

## 2. Operation Support

Collect:

- Supported operations: `text_to_image`, `image_edit`, inpainting, variation, upscaling, or other provider-specific variants
- Unsupported operations that must fail closed
- Any operation-specific restrictions

Questions:

- Which generation intents are truly supported?
- Does support differ by operation, endpoint, tier, or region?
- Are there hidden capability gaps that should not be exposed to users?

Definition of done:

- Supported and unsupported operations are explicit.
- Unknown capability areas are marked as unknown, not guessed.

## 3. Output Capability

Collect:

- Supported geometry model:
  - free pixel dimensions; or
  - ratio + resolution matrix; or
  - provider default only
- Size constraints:
  - min pixels
  - max pixels
  - max side
  - multiple-of rule
  - max aspect ratio
- Supported aspect ratios
- Supported resolutions / size presets
- Supported output formats
- Default output selection

Questions:

- What output shapes are truly accepted by the upstream service?
- Which combinations are supported versus merely documented?
- Which combinations should be exposed to users?

Definition of done:

- Capability truth is separated from UI exposure.
- One default output selection is defined.

## 4. Input Capability

Collect:

- Whether image-edit inputs are supported
- Supported input formats
- Max number of input images
- Per-image size limits
- Mask support:
  - supported or not
  - mask format
  - target image
  - same-dimension requirement

Questions:

- What must the caller normalize before submitting?
- Which edit flows need special validation?

Definition of done:

- Input requirements are explicit enough to reject invalid requests before dispatch.

## 5. Request Semantics

Collect:

- Required model field
- Optional model-related parameters
- Whether model choice alone determines behavior, or whether extra request strategy is needed
- Any provider-owned output fields that must not be overridden by callers

Questions:

- Is this model compatible with the existing request shape?
- Does the model require a different request strategy even under the same upstream protocol?

Definition of done:

- The request contract is specific enough to build a stable request strategy.

## 6. Discovery And Availability

Collect:

- Whether the model appears in remote model discovery
- Whether remote presence is required before exposing it
- Whether the model should be visible even without discovery
- Any tier/region/account gating

Questions:

- Is this an officially curated model or merely a discovered remote fact?
- Should local configuration permit the model before discovery confirms it?

Definition of done:

- The visibility policy is explicit.

## 7. Reliability, Billing, And Safety

Collect:

- Billing mode or pricing caveats
- Rate limits
- Retry safety constraints
- Idempotency caveats
- Known malformed-response patterns
- Safety policy or moderation caveats

Questions:

- Which failures are safe to retry?
- Which failures may duplicate billing or side effects?
- Which response anomalies must be normalized safely?

Definition of done:

- Recovery and billing risks are called out explicitly.

## 8. UX Exposure

Collect:

- Whether the model should be visible in pickers
- Whether it can be selected as a default model
- User-facing label
- Brand/icon hint
- Any warnings or caveats that must be shown to users

Questions:

- Should the model be broadly selectable or expert-only?
- What should users see if the raw wire ID is ugly or unstable?

Definition of done:

- Picker visibility and default eligibility are explicit.

## 9. Evidence

Collect:

- Official docs
- API reference
- Model cards
- Provider examples
- Verified live traces or smoke results, if available
- Known contradictions between docs and real behavior

Questions:

- What is source-of-truth versus folklore?
- Which facts are proven, inferred, or still unknown?

Definition of done:

- Every important claim has evidence or is clearly marked as unknown.

## Output Format

A finished model brief should end with:

- `Identity summary`
- `Capability summary`
- `Request summary`
- `Exposure summary`
- `Risk summary`
- `Evidence list`
