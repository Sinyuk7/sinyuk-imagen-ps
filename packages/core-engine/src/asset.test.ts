import { describe, expect, it } from 'vitest';
import type { Asset } from './types/asset.js';

describe('Asset type', () => {
  it('accepts fileId-only reference without url or data', () => {
    const asset: Asset = {
      type: 'image',
      fileId: 'file-abc123',
    };

    expect(asset.fileId).toBe('file-abc123');
    expect(asset.url).toBeUndefined();
    expect(asset.data).toBeUndefined();
  });

  it('accepts url-only reference', () => {
    const asset: Asset = {
      type: 'image',
      url: 'https://example.com/a.png',
    };

    expect(asset.url).toBe('https://example.com/a.png');
    expect(asset.fileId).toBeUndefined();
  });

  it('accepts inline data with mimeType', () => {
    const asset: Asset = {
      type: 'image',
      data: 'AAA',
      mimeType: 'image/webp',
    };

    expect(asset.data).toBe('AAA');
    expect(asset.mimeType).toBe('image/webp');
  });

  it('allows all three channels to coexist (provider layer resolves priority)', () => {
    const asset: Asset = {
      type: 'image',
      url: 'https://example.com/a.png',
      data: 'AAA',
      fileId: 'file-xyz',
    };

    expect(asset.url).toBe('https://example.com/a.png');
    expect(asset.data).toBe('AAA');
    expect(asset.fileId).toBe('file-xyz');
  });
});
