import { decode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { encodeCanonicalGrayscalePng } from '../../src/shared/image/canonical-mask';

describe('canonical mask', () => {
  it('deterministically encodes complete 8-bit grayscale geometry', () => {
    const coverage = new Uint8Array([0, 64, 128, 255]);
    const first = encodeCanonicalGrayscalePng(coverage, { width: 2, height: 2 });
    const second = encodeCanonicalGrayscalePng(coverage, { width: 2, height: 2 });
    const decoded = decode(first.bytes);

    expect(first).toMatchObject({ width: 2, height: 2 });
    expect(first.bytes).toEqual(second.bytes);
    expect(decoded).toMatchObject({ width: 2, height: 2, channels: 1, depth: 8 });
    expect(Array.from(decoded.data)).toEqual([0, 64, 128, 255]);
  });

  it.each([
    { data: new Uint8Array(1), size: { width: 0, height: 1 } },
    { data: new Uint8Array(1), size: { width: 1.5, height: 1 } },
    { data: new Uint8Array(3), size: { width: 2, height: 2 } },
  ])('rejects incomplete or invalid geometry: $size', ({ data, size }) => {
    expect(() => encodeCanonicalGrayscalePng(data, size)).toThrow(
      `Canonical mask requires complete grayscale data: ${size.width}x${size.height}.`,
    );
  });
});
