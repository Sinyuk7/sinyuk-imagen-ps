import type { CaptureUploadPlan, ImageSize, PlacementScalePlan, ProviderInputPlan } from '../image/resize';

export interface PhotoshopRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PhotoshopCaptureSnapshot {
  readonly documentId: number;
  readonly documentSize: ImageSize;
  readonly layerId: number;
  readonly layerBoundsNoEffects: PhotoshopRect;
  readonly selectionBounds: PhotoshopRect | null;
}

export interface PhotoshopCapturePlacement {
  readonly snapshot: PhotoshopCaptureSnapshot;
  readonly placementRect: PhotoshopRect;
  readonly uploadPlan?: CaptureUploadPlan;
  readonly providerInputPlan?: ProviderInputPlan;
}

export interface PhotoshopCaptureResult {
  readonly image: import('./host-image-asset').HostImageAsset;
  readonly placement: PhotoshopCapturePlacement;
  readonly sourceKind: 'selection' | 'layer';
}

export type PlacementIntentKind = 'exact-frame' | 'document-only' | 'unbound';

export interface ExactFramePlacementIntent {
  readonly kind: 'exact-frame';
  readonly documentId: number;
  readonly documentSizeAtCapture: ImageSize;
  readonly placementRect: PhotoshopRect;
  readonly scalePlan?: PlacementScalePlan;
}

export interface DocumentOnlyPlacementIntent {
  readonly kind: 'document-only';
  readonly documentId: number;
  readonly documentSizeAtCapture: ImageSize;
}

export interface UnboundPlacementIntent {
  readonly kind: 'unbound';
  readonly reason: 'no-photoshop-capture' | 'multiple-documents';
}

export type PlacementIntent =
  | ExactFramePlacementIntent
  | DocumentOnlyPlacementIntent
  | UnboundPlacementIntent;
