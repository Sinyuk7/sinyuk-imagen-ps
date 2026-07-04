import { describe, expect, it, vi } from 'vitest';
import {
  createGeminiGenerateContentProvider,
  geminiGenerateContentDescriptor,
} from '../src/providers/gemini-generate-content/index.js';
import {
  buildGeminiGenerateContentRequest,
  normalizeGeminiGenerateContentModelId,
} from '../src/transport/gemini-generate-content/build-request.js';
import { parseGeminiGenerateContentResponse } from '../src/transport/gemini-generate-content/parse-response.js';
import { listLocalCatalogModels, resolveImageModelRule } from '../src/contract/image-model-capability.js';

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const tinyJpegBase64 = '/9j/2Q==';

describe('gemini-generate-content provider', () => {
  it('exposes the dedicated provider identity and config defaults', () => {
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com', enabled: true }],
      },
      apiKey: 'test-key',
    });

    expect(provider.id).toBe('gemini-generate-content');
    expect(provider.family).toBe('gemini-generate-content');
    expect(provider.describe()).toEqual(geminiGenerateContentDescriptor);
    expect(config.authMode).toBe('x-goog-api-key');
    expect(config.apiVersion).toBe('v1');
    expect(provider.describe().defaultModels?.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
      'gemini-3.1-flash-lite-image',
    ]);
  });

  it('rejects version-owned endpoints and auth header overrides', () => {
    const provider = createGeminiGenerateContentProvider();

    expect(() => provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
      authMode: 'bearer',
      apiVersion: 'v1beta',
    })).toThrow('versionless');

    expect(() => provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai', enabled: true }],
      },
      apiKey: 'test-key',
      extraHeaders: { Authorization: 'Bearer override' },
    })).toThrow('provider-owned');
  });

  it('normalizes bare and prefixed model ids onto one version-owned path', () => {
    const plain = buildGeminiGenerateContentRequest({
      request: {
        operation: 'text_to_image',
        prompt: 'make an image',
        providerOptions: { model: 'gemini-3.1-flash-image' },
      },
      apiVersion: 'v1',
    });
    const prefixed = buildGeminiGenerateContentRequest({
      request: {
        operation: 'text_to_image',
        prompt: 'make an image',
        providerOptions: { model: 'models/gemini-3.1-flash-image' },
      },
      apiVersion: 'v1',
    });

    expect(normalizeGeminiGenerateContentModelId('models/gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image');
    expect(plain.path).toBe('/v1/models/gemini-3.1-flash-image:generateContent');
    expect(prefixed.path).toBe('/v1/models/gemini-3.1-flash-image:generateContent');
  });

  it('builds Gemini-native edit requests with contents parts and one response-format revision', () => {
    const built = buildGeminiGenerateContentRequest({
      request: {
        operation: 'image_edit',
        prompt: 'replace the sky',
        images: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
        output: {
          count: 1,
          sizePreset: '2k',
          aspectRatio: '16:9',
        },
      },
      defaultModel: 'models/gemini-3.1-flash-image',
      apiVersion: 'v1',
    });

    expect(built.wireRevision).toBe('response-format-image');
    expect(built.body.contents[0]?.parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { text: 'replace the sky' },
    ]);
    expect(built.body.generationConfig).toMatchObject({
      responseModalities: ['TEXT', 'IMAGE'],
      candidateCount: 1,
      responseFormat: {
        image: {
          imageSize: 'IMAGE_SIZE_TWO_K',
          aspectRatio: 'ASPECT_RATIO_SIXTEEN_NINE',
        },
      },
    });
    expect(built.body.generationConfig).not.toHaveProperty('imageConfig');
  });

  it('parses Gemini thought images by preferring final assets and falling back to the last thought image', () => {
    const finalImage = parseGeminiGenerateContentResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'hidden reasoning', thought: true },
              { inlineData: { mimeType: 'image/jpeg', data: tinyJpegBase64 }, thought: true },
              { inlineData: { mimeType: 'image/png', data: tinyPngBase64 } },
            ],
          },
        },
      ],
    });

    expect(finalImage.assets).toEqual([
      { type: 'image', name: 'generated-3.png', mimeType: 'image/png', data: tinyPngBase64 },
    ]);
    expect(finalImage.text).toBeUndefined();
    expect(JSON.stringify(finalImage.raw)).not.toContain(tinyPngBase64);
    expect(finalImage.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'gemini-generate-content.response.thought-part-ignored' }),
    ]));

    const allThought = parseGeminiGenerateContentResponse({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: tinyJpegBase64 }, thought: true },
              { inlineData: { mimeType: 'image/png', data: tinyPngBase64 }, thought: true },
            ],
          },
        },
      ],
    });

    expect(allThought.assets).toEqual([
      { type: 'image', name: 'generated-2.png', mimeType: 'image/png', data: tinyPngBase64 },
    ]);
    expect(allThought.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'gemini-generate-content.response.thought-image-fallback' }),
    ]));
  });

  it('invokes official endpoints with x-goog-api-key auth and response-format-image bodies', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'hidden', thought: true },
                  { inlineData: { mimeType: 'image/jpeg', data: tinyJpegBase64 }, thought: true },
                  { inlineData: { mimeType: 'image/png', data: tinyPngBase64 } },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'models/gemini-3.1-flash-image',
    });

    const result = await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'text_to_image',
        prompt: 'test',
        output: { count: 1, sizePreset: '2k', aspectRatio: '16:9' },
      }),
    });

    expect(result.assets).toEqual([
      { type: 'image', name: 'generated-3.png', mimeType: 'image/png', data: tinyPngBase64 },
    ]);
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    expect(JSON.stringify(result.raw)).not.toContain(tinyPngBase64);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-key',
    });
    expect(init?.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        responseFormat: {
          image: {
            imageSize: 'IMAGE_SIZE_TWO_K',
            aspectRatio: 'ASPECT_RATIO_SIXTEEN_NINE',
          },
        },
      },
    });
    fetchSpy.mockRestore();
  });

  it('invokes v1beta gateways with bearer auth when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/jpeg', data: tinyJpegBase64 } }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/gateway', enabled: true }],
      },
      apiKey: 'test-key',
      authMode: 'bearer',
      apiVersion: 'v1beta',
    });

    await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'text_to_image',
        prompt: 'test',
        providerOptions: { model: 'models/gemini-3-pro-image' },
        output: { sizePreset: '4k' },
      }),
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.n1n.ai/gateway/v1beta/models/gemini-3-pro-image:generateContent');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key',
    });
    fetchSpy.mockRestore();
  });

  it('keeps same model ids distinct across chat-image and gemini-generate-content catalogs', () => {
    expect(listLocalCatalogModels('gemini-generate-content').map((model) => model.id)).toContain('gemini-3.1-flash-image');
    expect(resolveImageModelRule({
      providerId: 'chat-image',
      modelId: 'gemini-3.1-flash-image',
    }).ruleId).toBe('chat-image-gemini-3.1-flash-image');
    expect(resolveImageModelRule({
      providerId: 'gemini-generate-content',
      modelId: 'gemini-3.1-flash-image',
    }).ruleId).toBe('gemini-generate-content-gemini-3.1-flash-image');
  });
});
