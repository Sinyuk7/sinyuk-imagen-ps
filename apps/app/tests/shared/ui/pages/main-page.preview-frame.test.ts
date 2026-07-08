import { describe, expect, it } from 'vitest';
import type { ImageOutputSelection } from '@imagen-ps/application';
import { previewFrameShapeForRound } from '../../../../src/shared/ui/pages/main-page';

function roundWithSelection(selection: ImageOutputSelection) {
  return {
    output: {
      count: 1 as const,
      selection,
    },
    outputSize: undefined,
  };
}

describe('MainPage preview frame shape', () => {
  it('uses requested ratio-resolution selection before provider metadata arrives', () => {
    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '16:9', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('landscape');

    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('square');
  });

  it('clamps taller-than-2:3 requests into portrait preview ceiling', () => {
    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('portrait');

    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '9:16', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('portrait');

    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'pixels', width: 900, height: 2100 },
      outputFormat: 'png',
    }))).toBe('portrait');
  });

  it('keeps very wide ratios in narrow-height preview buckets', () => {
    expect(previewFrameShapeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '21:9', resolution: '2k' },
      outputFormat: 'png',
    }))).toBe('wide');
  });

  it('falls back to output metadata when request ratio is unavailable', () => {
    expect(previewFrameShapeForRound({
      output: {
        count: 1,
        selection: {
          geometry: { kind: 'provider-default' },
          outputFormat: 'png',
        },
      },
      outputSize: '1024x1024',
    })).toBe('square');

    expect(previewFrameShapeForRound({
      output: {
        count: 1,
        selection: {
          geometry: { kind: 'provider-default' },
          outputFormat: 'jpeg',
        },
      },
      outputSize: '1408x768',
    })).toBe('landscape');

    expect(previewFrameShapeForRound({
      output: undefined,
      outputSize: undefined,
    })).toBe('unknown');
  });
});
