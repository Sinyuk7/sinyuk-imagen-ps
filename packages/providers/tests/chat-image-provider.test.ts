import { describe, expect, it, vi } from 'vitest';
import { createChatImageProvider, chatImageDescriptor } from '../src/providers/chat-image/index.js';
import { buildChatImageRequestBody } from '../src/transport/chat-image/build-request.js';
import { parseChatImageModelsResponse } from '../src/transport/chat-image/models.js';
import { parseChatImageResponse } from '../src/transport/chat-image/parse-response.js';

describe('chat-image provider', () => {
  it('exposes chat image descriptor and validates config', () => {
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      imageMaxSide: 2048,
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
            images: [{ image_url: { url: 'data:image/png;base64,abc' } }],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.png', data: 'abc', mimeType: 'image/png' }]);
    expect(parsed.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it('rejects chat responses without image URLs', () => {
    expect(() => parseChatImageResponse({ choices: [{ message: { content: 'no image' } }] })).toThrow(
      'Chat image response did not contain any image URLs.',
    );
  });

  it('discovers image-capable chat models', () => {
    expect(
      parseChatImageModelsResponse({
        data: [
          { id: 'openai/gpt-4.1', architecture: { output_modalities: ['text'] } },
          { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini Image' },
          { id: 'openai/gpt-image-2', architecture: { output_modalities: ['image', 'text'] } },
        ],
      }).map((model) => model.id),
    ).toEqual(['google/gemini-2.5-flash-image-preview', 'openai/gpt-image-2']);
  });

  it('preserves base URL path when invoking OpenRouter-style endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: 'https://example.com/out.png' } }] } }],
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
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      imageMaxSide: 2048,
      defaultModel: 'google/gemini-2.5-flash-image-preview',
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/chat/completions');
    fetchSpy.mockRestore();
  });
});
