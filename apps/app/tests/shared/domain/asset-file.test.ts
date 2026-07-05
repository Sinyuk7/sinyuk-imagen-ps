import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@imagen-ps/application';
import { assetToArrayBuffer } from '../../../src/shared/domain/asset-file';

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

describe('asset file byte resolution', () => {
  it('fetches URL storedRefs instead of resolving them through AssetStore', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(async () => new Response(arrayBufferFromBytes(data), {
      headers: { 'content-type': 'image/jpeg' },
    })) as unknown as typeof fetch;
    const resolveStoredRef = vi.fn(async () => undefined);
    const asset: Asset = {
      type: 'image',
      name: 'generated.png',
      mimeType: 'image/png',
      url: 'https://example.test/generated.jpeg',
      storedRef: {
        kind: 'url',
        ref: 'https://example.test/generated.jpeg',
        mimeType: 'image/jpeg',
        name: 'generated.jpeg',
      },
    };

    const result = await assetToArrayBuffer(asset, { fetchImpl, resolveStoredRef });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/generated.jpeg');
    expect(resolveStoredRef).not.toHaveBeenCalled();
    expect(new Uint8Array(result.data)).toEqual(data);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('keeps hostObject storedRefs on the AssetStore path', async () => {
    const data = new Uint8Array([5, 6, 7]);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const resolveStoredRef = vi.fn(async () => arrayBufferFromBytes(data));
    const asset: Asset = {
      type: 'image',
      name: 'stored.png',
      mimeType: 'image/png',
      storedRef: {
        kind: 'hostObject',
        ref: 'uxp-asset-1.png',
        mimeType: 'image/png',
      },
    };

    const result = await assetToArrayBuffer(asset, { fetchImpl, resolveStoredRef });

    expect(resolveStoredRef).toHaveBeenCalledWith(asset.storedRef);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(new Uint8Array(result.data)).toEqual(data);
    expect(result.mimeType).toBe('image/png');
  });

  it('reports URL fetch failures for URL storedRefs', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;

    await expect(assetToArrayBuffer({
      type: 'image',
      name: 'signed-url.png',
      storedRef: {
        kind: 'url',
        ref: 'https://example.test/expired.png',
      },
    }, { fetchImpl })).rejects.toThrow('Failed to fetch asset URL: 403');
  });
});
