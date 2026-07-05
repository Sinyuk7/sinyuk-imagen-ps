import { describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import {
  createGeminiGenerateContentProvider,
  geminiGenerateContentDescriptor,
} from '../src/providers/gemini-generate-content/index.js';
import {
  buildGeminiGenerateContentRequest,
  normalizeGeminiGenerateContentModelId,
} from '../src/transport/gemini-generate-content/build-request.js';
import { parseGeminiGenerateContentModelsResponse } from '../src/transport/gemini-generate-content/models.js';
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
    expect(config.apiFormat).toBe('gemini-generate-content');
    expect(config.paths).toEqual({ invokeTemplate: '/models/{model}:generateContent' });
    expect(provider.describe().defaultModels?.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
      'gemini-3.1-flash-lite-image',
    ]);
  });

  it('accepts version-owned base URLs and rejects auth header overrides', () => {
    const provider = createGeminiGenerateContentProvider();

    const config = provider.validateConfig({
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
    });

    expect(config.connection.endpoints[0]?.url).toBe('https://api.n1n.ai/v1beta');

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
    });
    const prefixed = buildGeminiGenerateContentRequest({
      request: {
        operation: 'text_to_image',
        prompt: 'make an image',
        providerOptions: { model: 'models/gemini-3.1-flash-image' },
      },
    });

    expect(normalizeGeminiGenerateContentModelId('models/gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image');
    expect(plain.path).toBe('/models/gemini-3.1-flash-image:generateContent');
    expect(prefixed.path).toBe('/models/gemini-3.1-flash-image:generateContent');
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

  it('parses native Gemini model discovery payloads by filtering generateContent models and stripping prefixes', () => {
    const parsed = parseGeminiGenerateContentModelsResponse({
      models: [
        {
          name: 'models/gemini-3.1-flash-image',
          displayName: 'Gemini 3.1 Flash Image',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/gemini-3-pro-image',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/text-embedding-004',
          supportedGenerationMethods: ['embedContent'],
        },
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });

    expect(parsed.sourceFormat).toBe('gemini-native');
    expect(parsed.models.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
    ]);
  });

  it('falls back to a narrow OpenAI-like model list only after native parse fails', () => {
    const parsed = parseGeminiGenerateContentModelsResponse({
      data: [
        { id: 'models/gemini-3.1-flash-image' },
        { id: 'gemini-3-pro-image' },
        { id: 'gpt-image-1' },
      ],
    });

    expect(parsed.sourceFormat).toBe('openai-like-fallback');
    expect(parsed.models.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
    ]);
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
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1', enabled: true }],
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

  it('logs Gemini request summaries, ignored request diagnostics, and response summaries without leaking image data', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_gemini_logs',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: tinyPngBase64 } }],
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
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'models/gemini-3.1-flash-image',
    });
    const request = provider.validateRequest({
      operation: 'text_to_image',
      prompt: 'test',
      output: { count: 1, sizePreset: '2k', aspectRatio: '1:1', outputFormat: 'png' },
      providerOptions: { model: 'gemini-3.1-flash-image', unsupportedFlag: 'ignored' },
    });

    try {
      await provider.invoke({ config, request, logger });

      const requestSummary = sink.records.find((record) => record.event === 'provider.gemini_generate_content.request_summary');
      expect(requestSummary?.attrs).toMatchObject({
        operation: 'text_to_image',
        model: 'gemini-3.1-flash-image',
        wireRevision: 'response-format-image',
        requestedOutputFormat: 'png',
        requestedSizePreset: '2k',
        requestedAspectRatio: '1:1',
        wireResponseFormatImageSize: 'IMAGE_SIZE_TWO_K',
        wireResponseFormatAspectRatio: 'ASPECT_RATIO_ONE_BY_ONE',
      });
      const ignoredDiagnostics = sink.records.filter(
        (record) => record.event === 'provider.gemini_generate_content.request_option_ignored',
      );
      expect(ignoredDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          level: 'warn',
          attrs: expect.objectContaining({
            diagnosticCode: 'gemini-generate-content.request.provider-option-ignored',
            key: 'unsupportedFlag',
            reason: 'not-allowlisted',
            model: 'gemini-3.1-flash-image',
            wireRevision: 'response-format-image',
          }),
        }),
        expect.objectContaining({
          level: 'warn',
          attrs: expect.objectContaining({
            diagnosticCode: 'gemini-generate-content.request.output-option-ignored',
            key: 'outputFormat',
            requested: 'png',
            supported: ['jpeg'],
            model: 'gemini-3.1-flash-image',
            wireRevision: 'response-format-image',
          }),
        }),
      ]));
      const responseSummary = sink.records.find((record) => record.event === 'provider.gemini_generate_content.response_summary');
      expect(responseSummary?.attrs).toMatchObject({
        model: 'gemini-3.1-flash-image',
        wireRevision: 'response-format-image',
        selectedEndpointId: 'primary',
        assetCount: 1,
        assetMimeTypes: ['image/png'],
        assetNames: ['generated-1.png'],
        textPresent: false,
        usageInputTokens: '[REDACTED]',
        usageOutputTokens: '[REDACTED]',
        usageTotalTokens: '[REDACTED]',
      });
      expect(sink.records.some((record) => record.event === 'transport.request.start')).toBe(true);
      expect(JSON.stringify(sink.records)).not.toContain(tinyPngBase64);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('discovers Gemini models from the native /models endpoint and reuses x-goog-api-key auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-3.1-flash-image',
              displayName: 'Gemini 3.1 Flash Image',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-3.1-flash-lite-image',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            {
              name: 'models/text-embedding-004',
              supportedGenerationMethods: ['embedContent'],
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
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const models = await provider.discoverModels?.(config);

    expect(models?.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
    ]);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-key',
    });
    fetchSpy.mockRestore();
  });

  it('falls back to the local Gemini catalog when discovery returns no curated generateContent models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
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
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const models = await provider.discoverModels?.(config);

    expect(models).toEqual(listLocalCatalogModels('gemini-generate-content').map((model) => ({
      ...model,
      remotelyAvailable: false,
    })));
    fetchSpy.mockRestore();
  });

  it('accepts OpenAI-like discovery payloads only as a fallback and logs a warning', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'models/gemini-3.1-flash-image' },
            { id: 'gemini-3.1-flash-lite-image' },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const loggerWarn = vi.fn();
    const logger = {
      warn: loggerWarn,
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      startSpan: vi.fn(),
      child: vi.fn(),
      context: {},
    } as any;
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://gateway.example.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const models = await provider.discoverModels?.(config, logger);

    expect(models?.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
    ]);
    expect(loggerWarn).toHaveBeenCalledWith(
      'provider.gemini_generate_content.discover_models.non_native_payload',
      expect.objectContaining({
        selectedEndpointId: 'primary',
        targetPath: '/models',
      }),
    );
    fetchSpy.mockRestore();
  });

  it('logs discovery summaries for native and fallback model discovery results', async () => {
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://gateway.example.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    {
      const sink = createMemorySink();
      const logger = createLogger({
        sink,
        context: { surface: 'test', package: 'application', component: 'runtime' },
        traceId: 'tr_gemini_discovery_native',
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-3.1-flash-image',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const models = await provider.discoverModels?.(config, logger);

      expect(models?.map((model) => model.id)).toEqual(['gemini-3.1-flash-image']);
      const summary = sink.records.find((record) => record.event === 'provider.gemini_generate_content.discover_models.summary');
      expect(summary?.attrs).toMatchObject({
        selectedEndpointId: 'primary',
        targetPath: '/models',
        sourceFormat: 'gemini-native',
        parsedModelCount: 1,
        returnedModelCount: 1,
        fallbackLocalCatalogUsed: false,
        remoteSelectableCount: 1,
        modelIds: ['gemini-3.1-flash-image'],
      });
      fetchSpy.mockRestore();
    }

    {
      const sink = createMemorySink();
      const logger = createLogger({
        sink,
        context: { surface: 'test', package: 'application', component: 'runtime' },
        traceId: 'tr_gemini_discovery_fallback',
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const models = await provider.discoverModels?.(config, logger);

      expect(models).toEqual(listLocalCatalogModels('gemini-generate-content').map((model) => ({
        ...model,
        remotelyAvailable: false,
      })));
      const summary = sink.records.find((record) => record.event === 'provider.gemini_generate_content.discover_models.summary');
      expect(summary?.attrs).toMatchObject({
        selectedEndpointId: 'primary',
        targetPath: '/models',
        sourceFormat: 'gemini-native',
        parsedModelCount: 0,
        returnedModelCount: 3,
        fallbackLocalCatalogUsed: true,
        remoteSelectableCount: 3,
        modelIds: [
          'gemini-3.1-flash-image',
          'gemini-3-pro-image',
          'gemini-3.1-flash-lite-image',
        ],
      });
      fetchSpy.mockRestore();
    }
  });

  it('measures Gemini endpoint reachability with HEAD base URL and no auth header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.measureEndpoints?.(config);

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: true,
      httpStatus: 401,
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe('HEAD');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toBeUndefined();
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
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/gateway/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
      authMode: 'bearer',
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

  it('reports successful Gemini connection tests using discovered model counts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-3.1-flash-image',
              supportedGenerationMethods: ['generateContent'],
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
        endpoints: [{ id: 'primary', url: 'https://generativelanguage.googleapis.com/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.testConnection?.(config);

    expect(result).toMatchObject({
      supported: true,
      reachable: true,
      modelCount: 1,
      models: [{ id: 'gemini-3.1-flash-image' }],
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
