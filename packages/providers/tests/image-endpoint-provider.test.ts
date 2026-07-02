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
import {
  resolveImageModelRule,
  validateImageModelCatalog,
} from '../src/contract/image-model-capability.js';
import { parseModelsResponse } from '../src/transport/image-endpoint/models.js';
import { parseResponse } from '../src/transport/image-endpoint/parse-response.js';

describe('image-endpoint provider', () => {
  it('exposes image endpoint descriptor and validates config', () => {
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
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

  it('does not force a square output size for source-ratio image edits', () => {
    const body = buildEditRequestBody(
      {
        operation: 'image_edit',
        prompt: 'preserve source ratio',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
        output: {
          count: 1,
          sizePreset: '2k',
          aspectRatio: 'auto',
          outputFormat: 'png',
        },
      },
      'gpt-image-2',
    );

    expect(body).toMatchObject({
      n: 1,
      output_format: 'png',
    });
    expect(body).not.toHaveProperty('size');
    expect(body).not.toHaveProperty('aspect_ratio');
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

  it('builds multipart edit body for Uint8Array image data', () => {
    const body = buildEditMultipartBody(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [{ type: 'image', data: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png', name: 'input.png' }],
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
        data: [{ id: 'gpt-image-2' }, { id: 'gpt-4.1' }, { id: 'dall-e-3' }, { id: 'unsupported-image-x' }],
      }).map((model) => model.id),
    ).toEqual(['gpt-image-2', 'dall-e-3']);
  });

  it('keeps the shared image model catalog internally consistent', () => {
    expect(validateImageModelCatalog()).toEqual([]);
  });

  it('resolves rule identity separately from the concrete model id', () => {
    const resolved = resolveImageModelRule({
      providerId: 'image-endpoint',
      modelId: 'chatgpt-image-latest',
    });

    expect(resolved.ruleId).toBe('image-endpoint-gpt-image-2');
    expect(resolved.concreteModelId).toBe('chatgpt-image-latest');
    expect(resolved.matchKind).toBe('exact');
  });

  it('rejects unsupported gpt-image-1 semantic output locally before transport', () => {
    expect(() => buildRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'unsupported square',
        output: { sizePreset: '2k', aspectRatio: 'auto' },
      },
      'gpt-image-1',
    )).toThrow(/does not support preset "2k" with aspect ratio "auto"/);
  });

  it('rejects unsupported dall-e-3 semantic output locally before transport', () => {
    expect(() => buildRequestBody(
      {
        operation: 'text_to_image',
        prompt: 'unsupported square',
        output: { sizePreset: '2k', aspectRatio: 'auto' },
      },
      'dall-e-3',
    )).toThrow(/does not support preset "2k" with aspect ratio "auto"/);
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
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
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
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'dall-e-3',
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.example.com/v1/images/generations');
    fetchSpy.mockRestore();
  });

  it('invokes edit endpoint through multipart fetch for Uint8Array input', async () => {
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
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });
    const request = provider.validateRequest({
      operation: 'image_edit',
      prompt: 'test edit',
      images: [{ type: 'image', data: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png', name: 'input.png' }],
    });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.example.com/v1/images/edits');
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.body).toBeInstanceOf(Blob);
    expect(init?.headers).toMatchObject(expect.objectContaining({
      'Content-Type': expect.stringContaining('multipart/form-data; boundary='),
    }));
    fetchSpy.mockRestore();
  });
});
