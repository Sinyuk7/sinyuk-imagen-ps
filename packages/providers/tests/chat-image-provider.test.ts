import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import { createChatImageProvider, chatImageDescriptor } from '../src/providers/chat-image/index.js';
import { resolveImageModelRule } from '../src/contract/image-model-capability.js';
import { buildChatImageRequest, buildChatImageRequestBody } from '../src/transport/chat-image/build-request.js';
import { parseChatImageModelsResponse } from '../src/transport/chat-image/models.js';
import { parseChatImageResponse } from '../src/transport/chat-image/parse-response.js';
import { resolveChatImageWireCodec } from '../src/transport/chat-image/request-codec.js';

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const tinyPngDataUrl = `data:image/png;base64,${tinyPngBase64}`;
const tinyJpegBase64 = '/9j/2Q==';
const tinyJpegDataUrl = `data:image/jpeg;base64,${tinyJpegBase64}`;
const inlineUnavailable = '[Image unavailable]';

describe('chat-image provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes chat image descriptor and validates config', () => {
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    expect(provider.id).toBe('chat-image');
    expect(provider.family).toBe('chat-image');
    expect(provider.describe()).toEqual(chatImageDescriptor);
    expect(provider.describe().operations).toEqual(['text_to_image', 'image_edit']);
    expect(provider.describe().transport?.wire?.supportedImageRequestCodecs).toEqual(['chat-completions-image-legacy']);
    expect(provider.describe().transport?.wire?.defaultImageRequestCodec).toBe('chat-completions-image-legacy');
    expect(config.family).toBe('chat-image');
  });

  it('resolves the explicit legacy chat-image request codec from the descriptor', () => {
    const codec = resolveChatImageWireCodec(chatImageDescriptor);

    expect(codec.id).toBe('chat-completions-image-legacy');
    expect(codec.buildRequest(
      {
        operation: 'text_to_image',
        prompt: 'legacy request',
      },
      { defaultModel: 'google/gemini-2.5-flash-image-preview' },
    )).toMatchObject({
      method: 'POST',
      path: '/chat/completions',
      body: {
        model: 'google/gemini-2.5-flash-image-preview',
        modalities: ['image'],
      },
    });
  });

  it('queries new-api balance from origin root instead of inheriting invoke base path', async () => {
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/v1', enabled: true }],
      },
      apiKey: 'test-key',
      billing: {
        mode: 'new-api',
        userId: '322072',
        accessTokenSecretRef: 'billing-token',
      },
    });
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.n1n.ai/api/user/self');
      return new Response(JSON.stringify({
        success: true,
        data: {
          quota: 500000,
          used_quota: 120000,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const snapshot = await provider.queryBalance?.(config, {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual({
      primary: {
        kind: 'quota',
        remaining: '500000',
        unit: 'quota',
      },
      details: [{
        kind: 'quota',
        label: 'Used quota',
        value: '120000',
        unit: 'quota',
      }],
    });
  });

  it('builds text-to-image chat completion body', () => {
    const body = buildChatImageRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'a red square',
        output: { count: 1, width: 1024, height: 1024 },
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(body).toMatchObject({
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [{ role: 'user', content: 'a red square' }],
      modalities: ['image'],
      n: 1,
      image_config: { size: '1024x1024' },
    });
  });

  it('maps semantic output settings to chat image_config and downgrades 4K provider-side', () => {
    const body = buildChatImageRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'a portrait',
        output: {
          count: 1,
          sizePreset: '4k',
          aspectRatio: '9:16',
          outputFormat: 'png',
        },
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(body).toMatchObject({
      n: 1,
      image_config: {
        size: '2K',
        aspect_ratio: '9:16',
        output_format: 'png',
      },
    });
    expect(body.image_config).not.toHaveProperty('quality');
  });

  it('omits hard aspect ratio for source-ratio chat image edits', () => {
    const body = buildChatImageRequestBody(
      {
        operation: 'image_edit',
        prompt: 'preserve source ratio',
        images: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
        output: {
          count: 1,
          sizePreset: '2k',
          aspectRatio: 'source',
          outputFormat: 'png',
        },
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(body.image_config).toMatchObject({
      size: '2K',
      output_format: 'png',
    });
    expect(body.image_config).not.toHaveProperty('aspect_ratio');
  });

  it('builds edit chat completion body with image and mask content', () => {
    const body = buildChatImageRequestBody(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
        maskImage: { type: 'image', url: 'https://example.com/mask.png' },
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'make it blue' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      { type: 'text', text: 'Use the following image as the edit mask.' },
      { type: 'image_url', image_url: { url: 'https://example.com/mask.png' } },
    ]);
  });

  it('converts Uint8Array edit input to base64 data URL inside the chat request builder', () => {
    const body = buildChatImageRequestBody(
      {
        operation: 'image_edit',
        prompt: 'use bytes',
        images: [{ type: 'image', data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }],
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(body.messages[0].content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AQID' },
    });
  });

  it('keeps canonical image_config ownership and reports ignored provider options', () => {
    const built = buildChatImageRequest(
      {
        operation: 'text_to_image',
        prompt: 'preserve canonical semantics',
        output: {
          count: 1,
          aspectRatio: '1:1',
          outputFormat: 'png',
        },
        providerOptions: {
          image_config: { aspect_ratio: '9:16', quality: 'low' },
          modalities: ['text'],
          unsupported_flag: true,
          user: 'trace-user',
        },
      },
      'google/gemini-2.5-flash-image-preview',
    );

    expect(built.body).toMatchObject({
      model: 'google/gemini-2.5-flash-image-preview',
      modalities: ['image'],
      user: 'trace-user',
      image_config: {
        aspect_ratio: '1:1',
        output_format: 'png',
      },
    });
    expect(built.body.image_config).not.toHaveProperty('quality');
    expect(built.diagnostics).toEqual([
      expect.objectContaining({
        code: 'chat-image.request.provider-option-ignored',
        details: expect.objectContaining({
          key: 'modalities',
          reason: 'reserved',
        }),
      }),
      expect.objectContaining({
        code: 'chat-image.request.provider-option-ignored',
        details: expect.objectContaining({
          key: 'image_config',
          reason: 'reserved',
          ignoredPaths: ['image_config.aspect_ratio', 'image_config.quality'],
        }),
      }),
      expect.objectContaining({
        code: 'chat-image.request.provider-option-ignored',
        details: expect.objectContaining({
          key: 'unsupported_flag',
          reason: 'not-allowlisted',
        }),
      }),
    ]);
  });

  it('normalizes OpenRouter-style image response', () => {
    const parsed = parseChatImageResponse({
      created: 1,
      choices: [
        {
          message: {
            content: [{ type: 'text', text: 'provider text' }],
            images: [{ image_url: { url: tinyPngDataUrl } }],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.png', data: tinyPngBase64, mimeType: 'image/png' }]);
    expect(parsed.text).toBe('provider text');
    expect(parsed.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it('normalizes text-only chat responses as valid provider text', () => {
    const parsed = parseChatImageResponse({ choices: [{ message: { content: 'no image' } }] });
    expect(parsed.assets).toEqual([]);
    expect(parsed.text).toBe('no image');
    expect(parsed.raw).toEqual({ choices: [{ message: { content: 'no image' } }] });
  });

  it('extracts markdown data URL images from content into assets', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            content: `![image](${tinyJpegDataUrl})`,
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.jpg', data: tinyJpegBase64, mimeType: 'image/jpeg' }]);
    expect(parsed.text).toBeUndefined();
    expect(JSON.stringify(parsed.raw)).not.toContain('data:image');
  });

  it('keeps surrounding provider text when extracting markdown images from content', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            content: `done\n\n![image](${tinyPngDataUrl})\n\nnext step`,
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.png', data: tinyPngBase64, mimeType: 'image/png' }]);
    expect(parsed.text).toBe('done\n\nnext step');
    expect(JSON.stringify(parsed.raw)).not.toContain('data:image');
  });

  it('truncates oversized provider text content', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            content: `prefix-${'x'.repeat(5000)}`,
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([]);
    expect(parsed.text).toBeDefined();
    expect(parsed.text?.length).toBe(4096);
    expect(parsed.text?.endsWith('\n… [truncated]')).toBe(true);
  });

  it('does not truncate provider text at 4095 or 4096 chars, but truncates at 4097', () => {
    const almost = parseChatImageResponse({ choices: [{ message: { content: 'a'.repeat(4095) } }] });
    const exact = parseChatImageResponse({ choices: [{ message: { content: 'b'.repeat(4096) } }] });
    const over = parseChatImageResponse({ choices: [{ message: { content: 'c'.repeat(4097) } }] });

    expect(almost.text).toBe('a'.repeat(4095));
    expect(exact.text).toBe('b'.repeat(4096));
    expect(over.text?.length).toBe(4096);
    expect(over.text).not.toContain('data:image');
  });

  it('deduplicates repeated markdown and message.images assets while preserving order', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            images: [
              { image_url: { url: tinyPngDataUrl } },
              { image_url: { url: tinyPngDataUrl } },
            ],
            content: [
              {
                type: 'text',
                text: `lead\n![image](${tinyPngDataUrl})\n![other](https://example.com/a_(1).png "title")\n![other](https://example.com/a_(1).png "title")`,
              },
            ],
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([
      { type: 'image', name: 'generated-1.png', data: tinyPngBase64, mimeType: 'image/png' },
      { type: 'image', name: 'generated-2.png', url: 'https://example.com/a_(1).png', mimeType: 'image/png' },
    ]);
    expect(parsed.text).toBe('lead');
  });

  it('keeps successful images when one markdown data URL is invalid', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            images: [{ image_url: { url: tinyPngDataUrl } }],
            content: `ok\n![bad](data:image/png;base64,not-valid)\nnext`,
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.png', data: tinyPngBase64, mimeType: 'image/png' }]);
    expect(parsed.text).toBe(`ok\n${inlineUnavailable}\nnext`);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'chat-image.response.inline-image-invalid',
        details: expect.objectContaining({ source: 'content', reason: 'invalid_base64' }),
      }),
    ]);
  });

  it('rejects unsupported inline SVG images without leaking data URLs into text', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            content: 'before\n![svg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)\nafter',
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([]);
    expect(parsed.text).toBe(`before\n${inlineUnavailable}\nafter`);
    expect(parsed.text).not.toContain('data:image');
    expect(JSON.stringify(parsed.raw)).not.toContain('data:image');
  });

  it('does not extract escaped or inline-code image syntax', () => {
    const parsed = parseChatImageResponse({
      choices: [
        {
          message: {
            content: `\\![image](${tinyPngDataUrl}) \`![image](${tinyPngDataUrl})\``,
          },
        },
      ],
    });

    expect(parsed.assets).toEqual([]);
    expect(parsed.text).not.toContain('data:image');
    expect(parsed.text).toContain(inlineUnavailable);
  });

  it('returns undefined text for pure image markdown responses', () => {
    const parsed = parseChatImageResponse({
      choices: [{ message: { content: `![image](${tinyPngDataUrl})` } }],
    });

    expect(parsed.assets).toHaveLength(1);
    expect(parsed.text).toBeUndefined();
  });

  it('rejects chat responses without image URLs or text', () => {
    expect(() => parseChatImageResponse({ choices: [{ message: { content: '   ' } }] })).toThrow(
      'Chat image response did not contain image URLs or text content.',
    );
  });

  it('discovers image-capable chat models', () => {
    expect(
      parseChatImageModelsResponse({
        data: [
          { id: 'openai/gpt-4.1', architecture: { output_modalities: ['text'] } },
          { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini Image' },
          { id: 'google/gemini-3-pro-image', name: 'Nano Banana Pro' },
          { id: 'gemini-3.1-flash-image', architecture: { output_modalities: ['image', 'text'] } },
          { id: 'openai/gpt-image-2', architecture: { output_modalities: ['image', 'text'] } },
          { id: 'banana-preview-v2', architecture: { output_modalities: ['image'] } },
        ],
      }).map((model) => model.id),
    ).toEqual([
      'google/gemini-2.5-flash-image-preview',
      'gemini-3-pro-image',
      'gemini-3.1-flash-image',
      'openai/gpt-image-2',
    ]);
  });

  it('discovers chat models from the unfiltered /models endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'google/gemini-3-pro-image' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'google/gemini-3-pro-image',
    });

    const models = await provider.discoverModels?.(config);

    expect(models?.map((model) => model.id)).toEqual(['gemini-3-pro-image']);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/models');
    fetchSpy.mockRestore();
  });

  it('measures chat endpoint reachability with HEAD base URL and treats HTTP responses as reachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.measureEndpoints?.(config);

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: true,
      httpStatus: 503,
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe('HEAD');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it('maps timeout failures during chat endpoint reachability probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('Request timed out.'), {
      name: 'TimeoutError',
    }));
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.measureEndpoints?.(config, { timeoutMs: 25 });

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: false,
      failureKind: 'timeout',
      errorMessage: 'Request timed out.',
    });
    fetchSpy.mockRestore();
  });

  it('maps network failures during chat endpoint reachability probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.measureEndpoints?.(config);

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: false,
      failureKind: 'connect',
      errorMessage: 'socket hang up',
    });
    fetchSpy.mockRestore();
  });

  it('resolves prefixed Gemini 3 chat model ids onto the curated local rules', () => {
    const resolved = resolveImageModelRule({
      providerId: 'chat-image',
      modelId: 'google/gemini-3-pro-image',
    });

    expect(resolved.ruleId).toBe('chat-image-gemini-3-pro-image');
    expect(resolved.concreteModelId).toBe('google/gemini-3-pro-image');
    expect(resolved.matchKind).toBe('exact');
  });

  it('preserves base URL path when invoking OpenRouter-style endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
            choices: [{ message: { content: 'done', images: [{ image_url: { url: 'https://example.com/out.png' } }] } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'google/gemini-2.5-flash-image-preview',
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(result.text).toBe('done');
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/chat/completions');
    fetchSpy.mockRestore();
  });

  it('sanitizes raw payloads and strips markdown data URLs during invoke', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: `Generated successfully\n![image](${tinyPngDataUrl})`, images: [{ image_url: { url: tinyPngDataUrl } }] } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'google/gemini-2.5-flash-image-preview',
    });
    const request = provider.validateRequest({
      operation: 'text_to_image',
      prompt: 'test',
      output: { count: 1 },
    });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(result.text).toBe('Generated successfully');
    expect(JSON.stringify(result.raw)).not.toContain('data:image');
    expect(JSON.stringify(result.diagnostics ?? [])).not.toContain('data:image');
    fetchSpy.mockRestore();
  });

  it('logs request summaries, response summaries, and output-format mismatches without leaking image data', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_chat_image_logs',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: `done\n![image](${tinyJpegDataUrl})` } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gemini-3.1-flash-image',
    });
    const request = provider.validateRequest({
      operation: 'text_to_image',
      prompt: 'test',
      output: { count: 1, outputFormat: 'png' },
      providerOptions: { model: 'gemini-3.1-flash-image' },
    });

    await provider.invoke({ config, request, logger });

    const requestSummary = sink.records.find((record) => record.event === 'provider.chat_image.request_summary');
    expect(requestSummary?.attrs).toMatchObject({
      requestCodec: 'chat-completions-image-legacy',
      requestedOutputFormat: 'png',
      wireImageConfigOutputFormat: 'png',
      model: 'gemini-3.1-flash-image',
    });
    const responseSummary = sink.records.find((record) => record.event === 'provider.chat_image.response_summary');
    expect(responseSummary?.attrs).toMatchObject({
      requestCodec: 'chat-completions-image-legacy',
      assetCount: 1,
      assetMimeTypes: ['image/jpeg'],
      assetNames: ['generated-1.jpg'],
      assetSources: ['content'],
      assetReferenceKinds: ['data-url'],
      selectedEndpointId: 'primary',
    });
    const mismatch = sink.records.find((record) => record.event === 'provider.chat_image.response_format_mismatch');
    expect(mismatch).toMatchObject({
      level: 'warn',
      attrs: expect.objectContaining({
        requestCodec: 'chat-completions-image-legacy',
        requestedOutputFormat: 'png',
        expectedMimeType: 'image/png',
        actualMimeTypes: ['image/jpeg'],
      }),
    });
    expect(sink.records.some((record) => record.event === 'transport.request.start')).toBe(true);
    expect(JSON.stringify(sink.records)).not.toContain('data:image');
    expect(JSON.stringify(sink.records)).not.toContain(tinyJpegBase64);
    fetchSpy.mockRestore();
  });

  it('logs ignored reserved provider options during invoke without leaking raw image data', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_chat_image_reserved_options',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'done', images: [{ image_url: { url: 'https://example.com/out.png' } }] } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'google/gemini-2.5-flash-image-preview',
    });

    const result = await provider.invoke({
      config,
      logger,
      request: provider.validateRequest({
        operation: 'text_to_image',
        prompt: 'test',
        output: { count: 1, aspectRatio: '1:1' },
        providerOptions: {
          image_config: { aspect_ratio: '9:16' },
          unsupported_flag: true,
        },
      }),
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'chat-image.request.provider-option-ignored',
          details: expect.objectContaining({
            key: 'image_config',
            ignoredPaths: ['image_config.aspect_ratio'],
          }),
        }),
      ]),
    );
    expect(sink.records.filter((record) => record.event === 'provider.chat_image.request_option_ignored')).toEqual([
      expect.objectContaining({
        level: 'warn',
        attrs: expect.objectContaining({
          requestCodec: 'chat-completions-image-legacy',
          key: 'image_config',
          reason: 'reserved',
        }),
      }),
      expect.objectContaining({
        level: 'warn',
        attrs: expect.objectContaining({
          requestCodec: 'chat-completions-image-legacy',
          key: 'unsupported_flag',
          reason: 'not-allowlisted',
        }),
      }),
    ]);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.stringify(sink.records)).not.toContain(tinyPngBase64);
    fetchSpy.mockRestore();
  });
});
