import { describe, expect, it, vi } from 'vitest';
import {
  createImageEndpointProvider,
  imageEndpointDescriptor,
} from '../src/providers/image-endpoint/index.js';
import {
  buildEditMultipartBody,
  buildEditRequestBody,
  buildRequestBody,
} from '../src/transport/image-endpoint/build-request.js';
import { parseModelsResponse } from '../src/transport/image-endpoint/models.js';
import { parseResponse } from '../src/transport/image-endpoint/parse-response.js';

describe('image-endpoint provider', () => {
  it('exposes image endpoint descriptor and validates config', () => {
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      imageMaxSide: 2048,
    });

    expect(provider.id).toBe('image-endpoint');
    expect(provider.family).toBe('image-endpoint');
    expect(provider.describe()).toEqual(imageEndpointDescriptor);
    expect(config.family).toBe('image-endpoint');
  });

  it('builds generation body for /v1/images/generations', () => {
    const body = buildRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'a red square',
        output: { count: 2, width: 1024, height: 1024, quality: 'low' },
      },
      'dall-e-3',
    );

    expect(body).toMatchObject({
      model: 'dall-e-3',
      prompt: 'a red square',
      n: 2,
      size: '1024x1024',
      quality: 'low',
      response_format: 'url',
    });
  });

  it('maps semantic output settings to provider-owned image endpoint size and format', () => {
    const body = buildRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'a wide image',
        output: {
          count: 1,
          sizePreset: '4k',
          aspectRatio: '16:9',
          outputFormat: 'png',
        },
      },
      'gpt-image-2',
    );

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'a wide image',
      n: 1,
      size: '1536x864',
      output_format: 'png',
    });
    expect(body).not.toHaveProperty('aspect_ratio');
    expect(body).not.toHaveProperty('quality');
  });

  it('builds edit JSON body for URL images', () => {
    const body = buildEditRequestBody(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
        maskImage: { type: 'image', url: 'https://example.com/mask.png' },
      },
      'gpt-image-2',
    );

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'make it blue',
      images: [{ image_url: 'https://example.com/input.png' }],
      mask: { image_url: 'https://example.com/mask.png' },
    });
  });

  it('builds multipart edit body for inline image data', () => {
    const body = buildEditMultipartBody(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
      'gpt-image-2',
    );

    expect(body.kind).toBe('multipart');
    expect(body.contentType).toContain('multipart/form-data; boundary=');
    expect(body.body).toBeInstanceOf(Blob);
  });

  it('normalizes image endpoint responses', () => {
    const parsed = parseResponse({
      created: 1,
      output_format: 'png',
      data: [{ b64_json: 'abc' }],
      usage: {
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
      },
    });

    expect(parsed.assets).toEqual([{ type: 'image', name: 'generated-1.png', data: 'abc', mimeType: 'image/png' }]);
    expect(parsed.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it('discovers image models from /v1/models responses', () => {
    expect(
      parseModelsResponse({
        object: 'list',
        data: [{ id: 'gpt-image-2' }, { id: 'gpt-4.1' }, { id: 'dall-e-3' }],
      }).map((model) => model.id),
    ).toEqual(['gpt-image-2', 'dall-e-3']);
  });

  it('omits undefined AbortSignal from fetch options for UXP compatibility', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [{ id: 'gpt-image-2' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      imageMaxSide: 2048,
    });

    await provider.discoverModels(config);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(init, 'signal')).toBe(false);
    fetchSpy.mockRestore();
  });

  it('invokes generation endpoint through fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: 'https://example.com/out.png' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      imageMaxSide: 2048,
      defaultModel: 'dall-e-3',
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.example.com/v1/images/generations');
    fetchSpy.mockRestore();
  });
});
