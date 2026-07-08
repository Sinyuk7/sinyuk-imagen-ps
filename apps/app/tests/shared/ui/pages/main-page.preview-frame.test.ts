import { describe, expect, it } from 'vitest';
import type { ImageOutputSelection } from '@imagen-ps/application';
import { previewLayoutModeForRound } from '../../../../src/shared/ui/pages/main-page';

function roundWithSelection(selection: ImageOutputSelection) {
  return {
    output: {
      count: 1 as const,
      selection,
    },
    outputSize: undefined,
  };
}

describe('MainPage preview layout mode', () => {
  it('uses intrinsic layout when request ratio is not taller than 2:3', () => {
    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '16:9', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('intrinsic');

    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('intrinsic');

    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('intrinsic');
  });

  it('caps only taller-than-2:3 requests into contain layout', () => {
    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '9:16', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('portrait-cap');

    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'pixels', width: 900, height: 2100 },
      outputFormat: 'png',
    }))).toBe('portrait-cap');
  });

  it('falls back to output metadata when request ratio is unavailable', () => {
    expect(previewLayoutModeForRound({
      output: {
        count: 1,
        selection: {
          geometry: { kind: 'provider-default' },
          outputFormat: 'png',
        },
      },
      outputSize: '1024x1024',
    })).toBe('intrinsic');

    expect(previewLayoutModeForRound({
      output: {
        count: 1,
        selection: {
          geometry: { kind: 'provider-default' },
          outputFormat: 'jpeg',
        },
      },
      outputSize: '768x1408',
    })).toBe('portrait-cap');

    expect(previewLayoutModeForRound({
      output: undefined,
      outputSize: undefined,
    })).toBe('fallback');
  });
});
