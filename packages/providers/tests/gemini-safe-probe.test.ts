import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiGenerateContentProvider } from '../src/providers/gemini-generate-content/provider.js';

const provider = createGeminiGenerateContentProvider();

const baseConfig = {
  providerId: 'gemini-generate-content',
  displayName: 'Gemini',
  family: 'gemini-generate-content' as const,
  apiFormat: 'gemini-generate-content' as const,
  connection: {
    selectionMode: 'manual' as const,
    selectedEndpointId: 'primary',
    endpoints: [{ id: 'primary', url: 'https://example.test/v1beta', enabled: true }],
  },
  paths: { invokeTemplate: '/models/{model}:generateContent' },
  apiKey: 'test-key',
  authMode: 'x-goog-api-key' as const,
  defaultModel: 'nano-banana-fast',
};

describe('gemini generate content safeProbe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failed when modelId missing', async () => {
    const result = await provider.safeProbe!(
      { ...baseConfig, defaultModel: undefined },
      {},
    );
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'model_id_required',
    });
  });

  it('returns verified when countTokens succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ totalTokens: 1 }),
      text: async () => '{"totalTokens":1}',
    })));

    const result = await provider.safeProbe!(
      baseConfig,
      { modelId: 'nano-banana-fast' },
    );

    expect(result).toMatchObject({
      status: 'verified',
      reason: 'verified',
    });
  });

  it('returns partial when countTokens endpoint is unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'text/plain' }),
      json: async () => {
        throw new Error('not json');
      },
      text: async () => 'not found',
    })));

    const result = await provider.safeProbe!(
      baseConfig,
      { modelId: 'nano-banana-fast' },
    );

    expect(result).toMatchObject({
      status: 'partial',
      reason: 'safe_probe_unsupported',
      httpStatus: 404,
    });
  });
});
