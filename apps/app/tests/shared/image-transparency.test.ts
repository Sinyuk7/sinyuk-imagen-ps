import { describe, expect, it } from 'vitest';
import { assetHasTransparency, hasImageTransparency } from '../../src/shared/image/image-transparency';
import { VALID_TRANSPARENT_PNG, realRgbPngWithSize, realJpegWithSize } from '../helpers/host-bridge-harness';

describe('image transparency detection', () => {
  it('detects transparent PNG pixels and ignores opaque PNG payloads', () => {
    expect(hasImageTransparency(VALID_TRANSPARENT_PNG, 'image/png')).toBe(true);
    expect(hasImageTransparency(realRgbPngWithSize(2, 2), 'image/png')).toBe(false);
  });

  it('treats JPEG assets as opaque and supports inline asset payloads', () => {
    expect(hasImageTransparency(realJpegWithSize(2, 2), 'image/jpeg')).toBe(false);
    expect(assetHasTransparency({
      mimeType: 'image/png',
      data: `data:image/png;base64,${Buffer.from(VALID_TRANSPARENT_PNG).toString('base64')}`,
    } as const)).toBe(true);
  });
});
