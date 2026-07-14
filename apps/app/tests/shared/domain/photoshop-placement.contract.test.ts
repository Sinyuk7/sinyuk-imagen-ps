import { describe, expect, it } from 'vitest';
import {
  matchPlacementIntent,
  placementIntentForActualOutput,
  resolvePlacementTarget,
} from '../../../src/shared/domain/photoshop-placement';

describe('photoshop placement contract', () => {
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
      {
        kind: 'exact-frame',
        documentId: 42,
        documentName: 'source.psd',
        documentSizeAtCapture: { width: 512, height: 384 },
        placementRect: { left: 0, top: 0, right: 256, bottom: 256 },
      },
      [{ documentId: 77, width: 640, height: 480, name: 'other.psd' }],
      77,
    )).toEqual({
      kind: 'resolved',
      targetDocumentId: 77,
      matchConfidence: 'active-document-fallback',
      evidenceStrength: 'frame',
    });
  });

  it.each([
    {
      name: 'unknown actual output size',
      actualOutputSize: undefined,
      outputSelection: undefined,
    },
    {
      name: 'no output selection with provider-default sized output',
      actualOutputSize: { width: 1024, height: 1024 },
      outputSelection: undefined,
    },
    {
      name: 'provider-default output selection',
      actualOutputSize: { width: 1024, height: 1024 },
      outputSelection: {
        geometry: { kind: 'provider-default' },
        outputFormat: 'png',
      },
    },
    {
      name: 'explicit pixels mismatch',
      actualOutputSize: { width: 1024, height: 577 },
      outputSelection: {
        geometry: { kind: 'pixels', width: 1024, height: 576 },
        outputFormat: 'png',
      },
    },
    {
      name: 'ratio-resolution aspect match',
      actualOutputSize: { width: 2048, height: 2048 },
      outputSelection: {
        geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '2k' },
        outputFormat: 'png',
      },
    },
    {
      name: 'ratio-resolution aspect mismatch',
      actualOutputSize: { width: 2048, height: 1536 },
      outputSelection: {
        geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '2k' },
        outputFormat: 'png',
      },
    },
    {
      name: 'input-derived exact size mismatch',
      actualOutputSize: { width: 1024, height: 1024 },
      outputSelection: {
        geometry: { kind: 'input-derived', mode: 'exact-size' },
        outputFormat: 'png',
      },
    },
  ] as const)('keeps exact-frame when output geometry is $name', ({ actualOutputSize, outputSelection }) => {
    expect(placementIntentForActualOutput(
      {
        kind: 'exact-frame',
        documentId: 42,
        documentName: 'source.psd',
        documentSizeAtCapture: { width: 512, height: 384 },
        placementRect: { left: 0, top: 0, right: 256, bottom: 128 },
        providerInputTarget: { width: 2048, height: 769 },
        ...(outputSelection ? { outputSelection } : {}),
      },
      actualOutputSize,
    )).toEqual({
      kind: 'exact-frame',
      documentId: 42,
      documentName: 'source.psd',
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 0, top: 0, right: 256, bottom: 128 },
      providerInputTarget: { width: 2048, height: 769 },
      ...(outputSelection ? { outputSelection } : {}),
    });
  });
});
