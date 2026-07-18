import { describe, expect, it, vi } from 'vitest';
import { createComfyUiHttpTransport } from '../../../src/adapters/comfyui/comfyui-http-transport';

describe('ComfyUI host HTTP transport', () => {
  it('uses same-origin credential-free requests and returns bounded bytes', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }));
    const transport = createComfyUiHttpTransport(fetchImpl);
    await expect(transport.request({
      origin: 'https://comfy.example.test',
      method: 'GET',
      path: '/system_stats',
      timeoutMs: 1_000,
      maxResponseBytes: 16,
    })).resolves.toMatchObject({ status: 200, body: new Uint8Array([1, 2, 3]) });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://comfy.example.test/system_stats',
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    );
  });

  it('rejects cross-origin paths and oversized responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(32), { status: 200 }));
    const transport = createComfyUiHttpTransport(fetchImpl);
    await expect(transport.request({
      origin: 'https://comfy.example.test',
      method: 'GET',
      path: 'https://other.example.test/data',
      timeoutMs: 1_000,
      maxResponseBytes: 64,
    })).rejects.toThrow('unsafe request URL');
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(transport.request({
      origin: 'https://comfy.example.test',
      method: 'GET',
      path: '/system_stats',
      timeoutMs: 1_000,
      maxResponseBytes: 8,
    })).rejects.toThrow('byte limit');
  });

  it('propagates caller abort without waiting for timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const transport = createComfyUiHttpTransport(fetchImpl);
    const controller = new AbortController();
    const pending = transport.request({
      origin: 'https://comfy.example.test',
      method: 'GET',
      path: '/system_stats',
      timeoutMs: 30_000,
      maxResponseBytes: 8,
    }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
