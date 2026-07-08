import { describe, expect, it } from 'vitest';
import type { ImageOutputSelection } from '@imagen-ps/application';
import {
  mediaCardKindForRound,
  mediaCardWidthStyleForRound,
  previewLayoutModeForRound,
} from '../../../../src/shared/ui/pages/main-page';

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
    }))).toBe('tall-contain');

    expect(previewLayoutModeForRound(roundWithSelection({
      geometry: { kind: 'pixels', width: 900, height: 2100 },
      outputFormat: 'png',
    }))).toBe('tall-contain');
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
    })).toBe('tall-contain');

    expect(previewLayoutModeForRound({
      output: undefined,
      outputSize: undefined,
    })).toBe('fallback');
  });

  it('derives media card kind from request or output ratio', () => {
    expect(mediaCardKindForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '16:9', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('landscape');

    expect(mediaCardKindForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('square');

    expect(mediaCardKindForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('portrait');

    expect(mediaCardKindForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '9:16', resolution: '1k' },
      outputFormat: 'png',
    }))).toBe('tall');
  });

  it('uses media-driven width rules for each preview kind', () => {
    expect(mediaCardWidthStyleForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '16:9', resolution: '1k' },
      outputFormat: 'png',
    }))).toMatchObject({
      width: 'var(--chat-preview-inline-max)',
      maxWidth: '100%',
    });

    expect(mediaCardWidthStyleForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '1:1', resolution: '1k' },
      outputFormat: 'png',
    }))).toMatchObject({
      width: 'var(--chat-preview-block-fallback)',
      maxWidth: '100%',
    });

    expect(mediaCardWidthStyleForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '2:3', resolution: '1k' },
      outputFormat: 'png',
    }))).toMatchObject({
      width: `calc(var(--chat-preview-block-fallback) * ${2 / 3})`,
      maxWidth: '100%',
    });

    expect(mediaCardWidthStyleForRound(roundWithSelection({
      geometry: { kind: 'ratio-resolution', aspectRatio: '9:16', resolution: '1k' },
      outputFormat: 'png',
    }))).toMatchObject({
      width: 'var(--chat-preview-block-fallback)',
      maxWidth: '100%',
    });

    expect(mediaCardWidthStyleForRound({
      output: undefined,
      outputSize: undefined,
    })).toMatchObject({
      width: 'var(--chat-preview-block-fallback)',
      maxWidth: '100%',
    });
  });
});
