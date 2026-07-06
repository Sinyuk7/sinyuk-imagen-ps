# Photoshop Capture Host RCA

## Scope

This note records a manual-only RCA for a real Photoshop UXP capture failure in
`apps/app` `captureActiveImage()`. It is intentionally limited to stable host
facts that were reproduced against a real Photoshop document and observed in the
UXP log stream.

## Symptom

- The main-page `Capture` action fails for one specific Photoshop document while
  the same action succeeds in a newly created document.
- In the problematic document, every tested non-`Background` layer failed:
  normal pixel layers, `Background copy`, selection-based captures, and smart
  object layers.
- Direct human selection of the real `Background` layer still succeeds in the
  same document.

## Failure Boundary

- The failure occurs before provider execution, job creation, or placement
  replay logic.
- The failing method is `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
  `captureActiveImage()`.
- The actual host error comes from Photoshop imaging reads:

  `Photoshop Error. Code: -32005. Message: Could not update smart object files ^0.`

- The failure is not thumbnail-only. It also affects:
  - layer pixel reads
  - composite reads without `layerID`
  - selection-based capture reads

## What Was Ruled Out

- DPI was not the cause. The problematic document was reproduced at `72 dpi`.
- Smart objects were not the only cause. Regular pixel layers failed too.
- A single corrupted layer was not the cause. Multiple non-`Background` layers
  failed consistently.
- Thumbnail generation was not the only failing path. Full capture reads failed
  at the same time.
- Soft layer switching was not the cause. Programmatic
  `activeDocument.activeLayers = [backgroundLayer]` did not recover reads.
- Lack of a real host selection was not the cause. A `batchPlay`-based
  `select Background` probe still failed.
- Same-modal contamination was not the full explanation. A second probe in a
  fresh modal scope still failed with the same `-32005` error.

## Probe Progress

The host bridge gained staged RCA logging and a series of increasingly strong
probes:

1. Added stable failure-stage logging for thumbnail, capture, selection, PNG
   encode, and asset-store boundaries.
2. Allowed preview failure fallback so body capture could continue far enough to
   reveal the real failing stage.
3. Added a composite probe without `layerID` after layer-read failure.
4. Added a `Background` composite probe after programmatic layer switch.
5. Replaced soft selection with `batchPlay` layer selection plus redraw.
6. Added a second `Background` probe in a fresh modal scope after the main
   capture failed.

These probes established that all script-level recovery attempts still failed on
the same document once capture started from a non-`Background` layer.

## Final Conclusion

For this problematic document, the failure is best treated as a Photoshop host
imaging failure tied to the current document and active-layer context, not as an
application, provider, task-history, placement, or preview-only bug.

More specifically:

- Starting capture from a non-`Background` layer can put Photoshop imaging reads
  into a bad state for that document.
- Script-level recovery through `batchPlay` background selection, redraw, and a
  new modal probe was not enough to restore `imaging.getPixels()`.
- Human manual selection of `Background` before capture still succeeds, which
  means the script-visible host state does not fully reproduce the manual host
  state transition.

## Log Events To Check First

When this class of issue reappears, inspect these events in
`logs/YYYY-MM-DD/imagen.jsonl` first:

- `hostbridge.capture_active_image.preview_unavailable`
- `hostbridge.capture_active_image.composite_probe.fail`
- `hostbridge.capture_active_image.background_composite_probe.fail`
- `hostbridge.capture_active_image.background_modal_probe.fail`
- `hostbridge.capture_active_image.fail`

Useful fields:

- `failedStage`
- `sourceKind`
- `layerId`
- `backgroundProbeSelectionMethod`
- `backgroundProbeRedrawElapsedSeconds`
- `previewFailureMessage`

## Practical Next Step

If a product workaround is required, prefer a host-side fallback that avoids
direct capture from the problematic layer context, for example by moving through
a temporary document or another host-native isolation path, instead of assuming
that additional `imaging.getPixels()` retries will recover the same document.
