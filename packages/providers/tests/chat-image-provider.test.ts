import { describe, expect, it, vi } from 'vitest';
import { createChatImageProvider, chatImageDescriptor } from '../src/providers/chat-image/index.js';
import { resolveImageModelRule } from '../src/contract/image-model-capability.js';
import { buildChatImageRequestBody } from '../src/transport/chat-image/build-request.js';
import { parseChatImageModelsResponse } from '../src/transport/chat-image/models.js';
import { parseChatImageResponse } from '../src/transport/chat-image/parse-response.js';

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const tinyPngDataUrl = `data:image/png;base64,${tinyPngBase64}`;
const tinyJpegBase64 = '/9j/2Q==';
const tinyJpegDataUrl = `data:image/jpeg;base64,${tinyJpegBase64}`;
const inlineUnavailable = '[Image unavailable]';

describe('chat-image provider', () => {
  it('exposes chat image descriptor and validates config', () => {
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    expect(provider.id).toBe('chat-image');
    expect(provider.family).toBe('chat-image');
    expect(provider.describe()).toEqual(chatImageDescriptor);
    expect(provider.describe().operations).toEqual(['text_to_image', 'image_edit']);
    expect(config.family).toBe('chat-image');
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
        failoverEnabled: false,
        preferredEndpointId: 'primary',
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
        failoverEnabled: false,
        preferredEndpointId: 'primary',
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
        failoverEnabled: false,
        preferredEndpointId: 'primary',
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
});
