import { describe, expect, it } from 'vitest';
import { matchPlacementIntent, resolvePlacementTarget } from '../../../src/shared/domain/photoshop-placement';

describe('photoshop placement matching', () => {
  it('matches the same document id and dimensions strongly', () => {
    expect(matchPlacementIntent(
      { kind: 'document-only', documentId: 42, documentSizeAtCapture: { width: 512, height: 384 } },
      [{ documentId: 42, width: 512, height: 384 }],
    )).toEqual({ kind: 'matched', confidence: 'strong', documentId: 42 });
  });

  it('matches reopened document evidence weakly by unique name and dimensions', () => {
    expect(matchPlacementIntent(
      { kind: 'document-only', documentId: 42, documentName: 'source.psd', documentSizeAtCapture: { width: 512, height: 384 } },
      [{ documentId: 99, name: 'source.psd', width: 512, height: 384 }],
    )).toEqual({ kind: 'matched', confidence: 'weak', documentId: 99 });
  });

  it('rejects multiple weak document matches as ambiguous', () => {
    expect(matchPlacementIntent(
      { kind: 'document-only', documentId: 42, documentName: 'source.psd', documentSizeAtCapture: { width: 512, height: 384 } },
      [
        { documentId: 99, name: 'source.psd', width: 512, height: 384 },
        { documentId: 100, name: 'source.psd', width: 512, height: 384 },
      ],
    )).toEqual({ kind: 'ambiguous-document', candidates: 2 });
  });

  it('rejects size drift for exact-frame placement', () => {
    expect(matchPlacementIntent(
      {
        kind: 'exact-frame',
        documentId: 42,
        documentSizeAtCapture: { width: 512, height: 384 },
        placementRect: { left: 0, top: 0, right: 256, bottom: 256 },
      },
      [{ documentId: 42, width: 256, height: 384 }],
    )).toMatchObject({ kind: 'document-mismatch' });
  });

  it('falls back to activeDocument after source-document resolution fails', () => {
    expect(resolvePlacementTarget(
      { kind: 'exact-frame', documentId: 42, documentName: 'source.psd', documentSizeAtCapture: { width: 512, height: 384 }, placementRect: { left: 0, top: 0, right: 256, bottom: 256 } },
      [{ documentId: 77, width: 640, height: 480, name: 'other.psd' }],
      77,
    )).toEqual({
      kind: 'resolved',
      targetDocumentId: 77,
      matchConfidence: 'active-document-fallback',
      evidenceStrength: 'frame',
    });
  });
});
