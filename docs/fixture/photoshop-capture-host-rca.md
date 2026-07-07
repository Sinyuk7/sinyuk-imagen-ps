# Photoshop UXP Capture Failure RCA

## Purpose

This note documents a real-host Adobe Photoshop UXP capture failure that was
reproduced manually against an existing PSD, investigated through staged host
logging, and narrowed to Photoshop-side imaging behavior.

It is written for readers who do not know this repository. Photoshop terms come
first. Repository-specific method names and log events appear only at the end.

## Executive Summary

In one problematic Photoshop document, capture repeatedly failed when started
from almost any non-Background layer, including regular pixel layers. The same
capture flow worked in a newly created document, and manual capture from the
real Background layer also worked in the problematic document.

The failure was thrown by Photoshop during imaging reads, not by provider
execution, placement, or downstream application logic.

The decisive error was:

`Photoshop Error. Code: -32005. Message: Could not update smart object files ^0.`

Despite that message, the issue was **not limited to Smart Objects**. It also
reproduced on ordinary pixel layers.

The final working mitigation was to stop reading pixels directly from the
current document/layer context after failure, and instead read pixels through a
temporary duplicate document path.

## Host Context

Observed during manual reproduction on a real Photoshop document:

- Problem document: `DSC08453.psd`
- Observed document id in logs: `59`
- Resolution at reproduction time: `72 ppi`
- Reproduction surface: Photoshop UXP plugin main-page `Capture` action

Important comparison cases:

- A newly created Photoshop document did **not** show the failure.
- In the problematic PSD, manual capture from the real `Background` layer could
  still succeed.

## User-Visible Symptom

From the panel, clicking `Capture` showed repeated failure prompts.

Observed pattern:

- Many different non-Background layers failed, not one single bad layer.
- Failures reproduced multiple times in the same PSD.
- Switching to another/new document made the feature work again.
- The user later confirmed a strong asymmetry:
  - `Background` could succeed
  - other tested layers failed

## What Actually Failed

The failing operation was Photoshop pixel extraction through the UXP imaging
API.

This is the important boundary:

- Failure happened before any model/provider request.
- Failure happened before placement replay.
- Failure happened before output handling.
- Failure happened inside Photoshop-side pixel read paths.

So this was **not**:

- a provider bug
- a task/job pipeline bug
- a placement bug
- a thumbnail UI-only bug

## Exact Host Error

Main reproduced host error:

`Photoshop Error. Code: -32005. Message: Could not update smart object files ^0.`

Earlier RCA probes also covered another Photoshop-side read failure string:

`Photoshop Error. Code: -32005. Message: Could not import the clipboard ^0.`

These messages were treated as Photoshop host-read failures, not as evidence
that the application was using clipboard import or that only Smart Objects were
involved.

## Experiment Timeline

### 1. Check whether this is one bad layer only

Test:

- Retry capture on multiple layers in the same PSD.

Observed:

- Failures were not isolated to one layer.
- Multiple non-Background layers failed repeatedly.

Conclusion:

- Not a single corrupted layer.

### 2. Check whether Smart Objects are the only failing layer type

Test:

- Retry capture on ordinary non-Smart-Object layers.

Observed:

- Regular pixel layers also failed.

Conclusion:

- Error string mentioned Smart Object update, but real failure class was
  broader than Smart Objects.

### 3. Check whether document resolution is the trigger

Hypothesis:

- The document might fail because it is `300 ppi`.

Observed:

- The document used in reproduction was actually `72 ppi`.

Conclusion:

- DPI / resolution was ruled out.

### 4. Check whether this is a thumbnail-only problem

Reason:

- A common failure shape is "thumbnail read fails, full capture still works".

Test:

- Add logs to distinguish thumbnail generation from main capture pixel read.

Observed:

- Failure was not confined to preview/thumbnail generation.
- Main capture pixel read could fail too.

Conclusion:

- Not only a preview or thumbnail problem.

### 5. Check whether reading the document composite avoids the bad layer

Test:

- After layer-scoped pixel read failure, try another Photoshop imaging read
  without a `layerID`, i.e. a composite read from the document.

Observed:

- Composite read could fail too in the problematic document.

Conclusion:

- Failure was not limited to the exact per-layer imaging call.
- The broader document imaging state could already be bad.

### 6. Check whether switching active layer to Background fixes it

Test:

- Temporarily switch the active layer to the real `Background`.
- Retry composite capture.
- Restore the original active layer.

Observed:

- Manual human selection of `Background` could succeed.
- Script-driven switching to `Background` did **not** reliably restore pixel
  reads.

Conclusion:

- "Just set active layer to Background in script" was not sufficient.
- Photoshop's script-visible state was not equivalent to the manual UI state
  transition performed by a human.

### 7. Check whether soft layer assignment is the issue

Test:

- Do not rely only on `activeDocument.activeLayers = [...]`.
- Use stronger Photoshop-native selection through `batchPlay select`.

Observed:

- Even with explicit Photoshop selection plus redraw, the failure still
  reproduced.

Conclusion:

- Not just a soft JavaScript-side active-layer assignment problem.

### 8. Check whether same-modal contamination explains the failure

Hypothesis:

- Maybe earlier failure poisoned only the current modal execution scope.

Test:

- After main failure, open a fresh modal execution.
- Re-select `Background`.
- Re-run the probe there.

Observed:

- The fresh modal probe could still fail with the same host error.

Conclusion:

- Not only a same-modal contamination problem.

### 9. Check whether the issue is document-specific rather than globally broken

Test:

- Retry the same feature in a newly created Photoshop document.

Observed:

- Capture worked in the new document.

Conclusion:

- The Photoshop installation or plugin flow was not globally broken.
- The failure depended on the state/content/history of the problematic PSD.

## What Was Ruled Out

By the end of investigation, these explanations were ruled out:

- one corrupted layer only
- Smart Object layers only
- document DPI / `300 ppi` suspicion
- preview-only or thumbnail-only failure
- simple `activeLayers` assignment issue
- lack of Photoshop-native layer selection
- same-modal-only contamination
- provider/model/request pipeline issue
- placement/writeback issue

## Best Current Explanation

The strongest interpretation is:

- In this PSD, starting capture from many non-Background layers could push
  Photoshop imaging reads into a bad document/layer state.
- Once in that state, direct UXP imaging reads from the original document were
  unreliable.
- Manual Photoshop UI interaction with the real `Background` layer could still
  succeed, but equivalent script-driven state changes could still fail.

So the problem was best treated as a **Photoshop host imaging behavior tied to
this document context**, not as an application-layer bug.

## Practical Product Direction

Because repeated direct reads in the same document context were not reliable,
the best workaround direction was to stop insisting on "read pixels directly
from current document + current layer context".

Safer workaround family:

- duplicate document
- merged copy
- flatten temporary document
- read pixels from the temporary document

This changes the capture source from "live problematic document state" to
"fresh temporary document state", which is closer to a host-side isolation
workaround than a retry.

## Repository Mapping

Only after the host conclusion was stable did the repository adopt an explicit
fallback.

Relevant application method:

- `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
- method: `captureActiveImage()`

Current fallback behavior:

1. Try direct layer-scoped pixel read.
2. If that fails, record stable RCA logs.
3. Fall back to:
   - `document.duplicate(name, true)`
   - `flatten()` when available, otherwise `mergeVisibleLayers()`
   - composite `imaging.getPixels()` on the temporary document
   - close temp document
   - restore previous active document

This fallback is a product workaround, not proof that Photoshop root cause was
fully fixed.

## Stable Log Events

For future incidents of this class, inspect these events first:

- `hostbridge.capture_active_image.preview_unavailable`
- `hostbridge.capture_active_image.composite_probe.ok`
- `hostbridge.capture_active_image.composite_probe.fail`
- `hostbridge.capture_active_image.background_composite_probe.ok`
- `hostbridge.capture_active_image.background_composite_probe.fail`
- `hostbridge.capture_active_image.background_modal_probe.ok`
- `hostbridge.capture_active_image.background_modal_probe.fail`
- `hostbridge.capture_active_image.temp_document_fallback.ok`
- `hostbridge.capture_active_image.temp_document_fallback.fail`
- `hostbridge.capture_active_image.fail`

Useful fields:

- `failedStage`
- `sourceKind`
- `layerId`
- `documentId`
- `documentResolution`
- `previewFailureMessage`
- `backgroundProbeSelectionMethod`
- `backgroundProbeRedrawElapsedSeconds`
- `captureFallbackUsed`

## Final Takeaway

Do not over-read Photoshop's error text literally here.

Even though Photoshop reported `Could not update smart object files`, the real
observed incident was broader:

- non-Background layers failed repeatedly
- ordinary pixel layers were affected
- a new document worked
- manual `Background` interaction could work
- script-driven reads in the original document context remained unreliable

That is why the correct engineering response was not "retry harder" but "leave
the bad document context and read through a temporary duplicate document path".
