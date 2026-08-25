import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGrsaiGenerateProvider } from '../src/providers/grsai-generate/provider.js';

const config = {
  providerId: 'grsai-generate', displayName: 'GRSAI', family: 'grsai-generate' as const, apiFormat: 'grsai' as const,
  connection: { selectionMode: 'manual' as const, selectedEndpointId: 'main', endpoints: [{ id: 'main', url: 'https://relay.test/base', enabled: true }] },
  paths: { submit: '/v1/api/generate', result: '/v1/api/result' }, apiKey: 'secret',
};

const request = {
  operation: 'text_to_image' as const, prompt: '  draw a cube  ',
  model: { apiFormat: 'grsai' as const, modelId: 'nano-banana-2', requestStrategyId: 'grsai-generate-image-config' },
  capabilityModelId: 'nano-banana-2',
  output: { selection: { geometry: { kind: 'ratio-resolution' as const, aspectRatio: '16:9' as const, resolution: '2k' as const }, outputFormat: 'png' as const } },
};

describe('GRSAI Generate provider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('submits once and polls the same opaque task with safe source-order results', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-1' }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'running' }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded', results: [
        { url: 'data:image/png;base64,bad' }, { url: 'https://cdn.test/a.png?token=ok' }, { url: 'https://user:pass@cdn.test/b.png' }, { url: 'https://cdn.test/c.png' },
      ] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const provider = createGrsaiGenerateProvider();
    const resolved = provider.validateConfig(config);
    const lifecycle = provider.asyncLifecycle!;

    const submitted = await lifecycle.submit({ config: resolved, request });
    expect(submitted).toEqual({ status: 'pending', remoteRef: 'task-1' });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://relay.test/base/v1/api/generate');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer secret' } });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ model: 'nano-banana-2', prompt: 'draw a cube', aspectRatio: '16:9', imageSize: '2K', replyType: 'async' });

    expect(await lifecycle.poll({ remoteRef: 'task-1' })).toEqual({ status: 'pending' });
    const completed = await lifecycle.poll({ remoteRef: 'task-1' });
    expect(completed).toMatchObject({ status: 'completed', result: { assets: [{ url: 'https://cdn.test/a.png?token=ok' }, { url: 'https://cdn.test/c.png' }] } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1]?.[0]).toBe('https://relay.test/base/v1/api/result?id=task-1');
  });

  it('rejects empty prompts before dispatch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const provider = createGrsaiGenerateProvider();
    await expect(provider.asyncLifecycle!.submit({ config: provider.validateConfig(config), request: { ...request, prompt: ' ' } })).rejects.toThrow('prompt must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });
});
