import type { CaptureUploadPlan, ImageSize, PlacementScalePlan, ProviderInputPlan } from '../image/resize';

export interface PhotoshopRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PhotoshopCaptureSnapshot {
  readonly documentId: number;
  readonly documentName?: string;
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
  readonly documentName?: string;
  readonly placementRect: PhotoshopRect;
  readonly scalePlan?: PlacementScalePlan;
}

export interface DocumentOnlyPlacementIntent {
  readonly kind: 'document-only';
  readonly documentId: number;
  readonly documentSizeAtCapture: ImageSize;
  readonly documentName?: string;
}

export interface UnboundPlacementIntent {
  readonly kind: 'unbound';
  readonly reason: 'no-photoshop-capture' | 'multiple-documents';
}

export type PlacementIntent =
  | ExactFramePlacementIntent
  | DocumentOnlyPlacementIntent
  | UnboundPlacementIntent;

export interface PlacementDocumentCandidate {
  readonly documentId?: number;
  readonly width?: number;
  readonly height?: number;
  readonly name?: string;
}

export type PlacementMatchResult =
  | { readonly kind: 'matched'; readonly confidence: 'strong' | 'weak'; readonly documentId: number }
  | { readonly kind: 'missing-document' }
  | { readonly kind: 'ambiguous-document'; readonly candidates: number }
  | { readonly kind: 'document-mismatch'; readonly reason: string }
  | { readonly kind: 'layer-mismatch'; readonly reason: string }
  | { readonly kind: 'unverifiable'; readonly reason: string };

function dimensionsMatch(
  document: PlacementDocumentCandidate,
  expected: { readonly width: number; readonly height: number },
): boolean {
  return document.width === expected.width && document.height === expected.height;
}

function namedDimensionMatches(
  documents: readonly PlacementDocumentCandidate[],
  name: string | undefined,
  expected: { readonly width: number; readonly height: number },
): readonly PlacementDocumentCandidate[] {
  if (!name) {
    return [];
  }
  return documents.filter((document) => document.name === name && dimensionsMatch(document, expected));
}

/** Matches durable placement evidence against currently visible Photoshop documents. */
export function matchPlacementIntent(
  placement: PlacementIntent,
  documents: readonly PlacementDocumentCandidate[],
): PlacementMatchResult {
  if (placement.kind === 'unbound') {
    return { kind: 'unverifiable', reason: placement.reason };
  }

  const document = documents.find((candidate) => candidate.documentId === placement.documentId);
  if (!document?.documentId) {
    const weakMatches = namedDimensionMatches(documents, placement.documentName, placement.documentSizeAtCapture);
    if (weakMatches.length > 1) {
      return { kind: 'ambiguous-document', candidates: weakMatches.length };
    }
    const weakMatch = weakMatches[0];
    if (weakMatch?.documentId !== undefined) {
      return { kind: 'matched', confidence: 'weak', documentId: weakMatch.documentId };
    }
    return { kind: 'missing-document' };
  }
  if (!dimensionsMatch(document, placement.documentSizeAtCapture)) {
    return {
      kind: 'document-mismatch',
      reason: `document size ${document.width ?? 'unknown'}x${document.height ?? 'unknown'} does not match ${placement.documentSizeAtCapture.width}x${placement.documentSizeAtCapture.height}`,
    };
  }
  return { kind: 'matched', confidence: 'strong', documentId: document.documentId };
}
