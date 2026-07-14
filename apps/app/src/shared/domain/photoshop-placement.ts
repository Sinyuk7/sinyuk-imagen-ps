import type { ImageOutputSelection } from '@imagen-ps/application';
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
  readonly previewTask?: () => Promise<import('./host-image-asset').HostImagePreviewHandle | undefined>;
}

export type PlacementEvidenceStrength = 'frame' | 'document' | 'none';

export type PlacementIntentKind = 'exact-frame' | 'document-only' | 'unbound';

export interface ExactFramePlacementIntent {
  readonly kind: 'exact-frame';
  readonly documentId: number;
  readonly documentSizeAtCapture: ImageSize;
  readonly documentName?: string;
  readonly placementRect: PhotoshopRect;
  readonly providerInputTarget?: ImageSize;
  readonly outputSelection?: ImageOutputSelection;
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

export interface PlacementTargetResolution {
  readonly kind: 'resolved' | 'unbound';
  readonly targetDocumentId?: number;
  readonly matchConfidence?: 'strong' | 'weak' | 'active-document-fallback';
  readonly evidenceStrength: PlacementEvidenceStrength;
  readonly reason?: UnboundPlacementIntent['reason'];
}

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

/** 基于单条 Photoshop placement evidence 推导 round placement intent。 */
export function placementIntentFromCapturePlacement(placement: PhotoshopCapturePlacement): PlacementIntent {
  return {
    kind: 'exact-frame',
    documentId: placement.snapshot.documentId,
    documentSizeAtCapture: placement.snapshot.documentSize,
    ...(placement.snapshot.documentName !== undefined ? { documentName: placement.snapshot.documentName } : {}),
    placementRect: placement.placementRect,
    ...(placement.providerInputPlan ? { providerInputTarget: placement.providerInputPlan.targetSize } : {}),
  };
}

/** 输出尺寸只作为诊断证据；capture frame 本身决定 exact-frame authority。 */
export function placementIntentForActualOutput(
  intent: PlacementIntent,
  _actualOutputSize: ImageSize | undefined,
): PlacementIntent {
  return intent;
}

/** 判断当前 round intent 仍保留的 placement evidence 强度。 */
export function placementEvidenceStrength(intent: PlacementIntent): PlacementEvidenceStrength {
  if (intent.kind === 'exact-frame') {
    return 'frame';
  }
  if (intent.kind === 'document-only') {
    return 'document';
  }
  return 'none';
}

/**
 * 先尝试 source-document strong match；失败后允许 caller 提供 activeDocument fallback。
 * 这里不决定 exact/document-only，只负责目标文档解析与剩余证据强度。
 */
export function resolvePlacementTarget(
  placement: PlacementIntent,
  documents: readonly PlacementDocumentCandidate[],
  activeDocumentId?: number,
): PlacementTargetResolution {
  const evidenceStrength = placementEvidenceStrength(placement);
  if (placement.kind === 'unbound') {
    return {
      kind: 'unbound',
      reason: placement.reason,
      evidenceStrength,
    };
  }

  const matched = matchPlacementIntent(placement, documents);
  if (matched.kind === 'matched' && matched.confidence === 'strong') {
    return {
      kind: 'resolved',
      targetDocumentId: matched.documentId,
      matchConfidence: 'strong',
      evidenceStrength,
    };
  }

  if (matched.kind === 'missing-document' && activeDocumentId !== undefined) {
    return {
      kind: 'resolved',
      targetDocumentId: activeDocumentId,
      matchConfidence: 'active-document-fallback',
      evidenceStrength,
    };
  }

  if (matched.kind === 'matched') {
    return {
      kind: 'resolved',
      targetDocumentId: matched.documentId,
      matchConfidence: matched.confidence,
      evidenceStrength,
    };
  }

  return {
    kind: 'unbound',
    reason: 'no-photoshop-capture',
    evidenceStrength,
  };
}
