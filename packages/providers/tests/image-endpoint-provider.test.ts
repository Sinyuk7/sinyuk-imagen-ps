import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import {
  createImageEndpointProvider,
  imageEndpointDescriptor,
} from '../src/providers/image-endpoint/index.js';
import {
  buildImageEditRequestBody,
  buildEditMultipartBody,
  buildEditMultipartBodyForCodec,
  buildEditRequestBody,
  buildRequestBody,
} from '../src/transport/image-endpoint/build-request.js';
import {
  resolveImageModelRule,
  summarizeImageModelCapabilities,
  validateImageModelCatalog,
} from '../src/contract/image-model-capability.js';
import { inspectModelsResponse, parseModelsResponse } from '../src/transport/image-endpoint/models.js';
import { parseResponse } from '../src/transport/image-endpoint/parse-response.js';
import { resetImageEditCompatibilityCacheForTesting } from '../src/transport/image-endpoint/wire-compatibility.js';
import { createCountingFetch } from './counting-transport.js';

function expectFormDataFile(
  value: FormDataEntryValue | null,
  expected: { readonly type: string; readonly name: string },
): void {
  expect(value).toBeInstanceOf(Blob);
  const file = value as Blob & { readonly name?: string };
  expect(file.type).toBe(expected.type);
  expect(file.name).toBe(expected.name);
}

describe('image-endpoint provider', () => {
  beforeEach(() => {
    resetImageEditCompatibilityCacheForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes image endpoint descriptor and validates config', () => {
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    expect(provider.id).toBe('image-endpoint');
    expect(provider.family).toBe('image-endpoint');
    expect(provider.describe()).toEqual(imageEndpointDescriptor);
    expect(config.family).toBe('image-endpoint');
  });

  it('queries new-api balance from origin root instead of inheriting invoke base path', async () => {
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
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
          quota: 42,
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
        remaining: '42',
        unit: 'quota',
      },
    });
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

    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('prompt')).toBe('make it blue');
    const images = body.getAll('image[]');
    expect(images).toHaveLength(1);
    expectFormDataFile(images[0] ?? null, { type: 'image/png', name: 'image-1.png' });
    expect(body.has('mask')).toBe(false);
  });

  it('builds multipart edit body for Uint8Array image data', () => {
    const body = buildEditMultipartBody(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [
          { type: 'image', data: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png', name: 'input.png' },
          { type: 'image', data: new Uint8Array([5, 6, 7, 8]), mimeType: 'image/jpeg', name: 'second.jpg' },
        ],
        maskImage: { type: 'image', data: new Uint8Array([9, 10, 11]), mimeType: 'image/png', name: 'mask.png' },
        output: { count: 2, outputFormat: 'png' },
      },
      'gpt-image-2',
    );

    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('prompt')).toBe('make it blue');
    expect(body.get('n')).toBe('2');
    expect(body.get('output_format')).toBe('png');
    const images = body.getAll('image[]');
    expect(images).toHaveLength(2);
    expectFormDataFile(images[0] ?? null, { type: 'image/png', name: 'input.png' });
    expectFormDataFile(images[1] ?? null, { type: 'image/jpeg', name: 'second.jpg' });
    expectFormDataFile(body.get('mask'), { type: 'image/png', name: 'mask.png' });
  });

  it('builds multipart edit body with plain image field names when requested by codec', () => {
    const body = buildEditMultipartBodyForCodec(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [
          { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
          { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
        ],
      },
      'multipart-plain',
      'gpt-image-2',
    );

    expect(body.getAll('image')).toHaveLength(2);
    expect(body.getAll('image[]')).toHaveLength(0);
  });

  it('builds image edit request bodies through explicit codec selection', () => {
    const jsonBody = buildImageEditRequestBody(
      {
        operation: 'image_edit',
        prompt: 'json edit',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
      },
      'json-reference',
      'gpt-image-2',
    );
    const multipartBody = buildImageEditRequestBody(
      {
        operation: 'image_edit',
        prompt: 'multipart edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
      'multipart-bracket',
      'gpt-image-2',
    );

    expect(jsonBody).not.toBeInstanceOf(FormData);
    expect(jsonBody).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'json edit',
      images: [{ image_url: 'https://example.com/input.png' }],
    });
    expect(multipartBody).toBeInstanceOf(FormData);
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

  it('rejects empty image endpoint data arrays', () => {
    expect(() => parseResponse({ data: [] })).toThrow('Response "data" array is empty.');
  });

  it('discovers image models from /v1/models responses', () => {
    expect(
      parseModelsResponse({
        object: 'list',
        data: [
          { id: 'gpt-image-2' },
          { id: 'gpt-4.1' },
          { id: 'dall-e-3' },
          { id: 'grok-imagine-image-pro' },
          { id: 'grok-imagine-image' },
          { id: 'doubao-seedream-5-0-260128' },
          { id: 'qwen-image-2.0-2026-03-03' },
          { id: 'unsupported-image-x' },
        ],
      }).map((model) => model.id),
    ).toEqual([
      'gpt-image-2',
      'dall-e-3',
      'grok-imagine-image-pro',
      'grok-imagine-image',
      'doubao-seedream-5-0-260128',
      'qwen-image-2.0-2026-03-03',
    ]);
  });

  it('inspects model discovery payloads using only local catalog rules', () => {
    const inspected = inspectModelsResponse({
      object: 'list',
      data: [
        { id: 'gpt-image-1-mini' },
        { id: 'gpt-image-1-2025-04-15' },
        { id: 'dall-e-3' },
        { id: 'gpt-image-2' },
        { id: 'gpt-image-1.5' },
        { id: 'gpt-image-1' },
        { id: 'qwen-image-2.0-2026-03-03' },
      ],
    });

    expect(inspected.rawIds).toEqual([
      'gpt-image-1-mini',
      'gpt-image-1-2025-04-15',
      'dall-e-3',
      'gpt-image-2',
      'gpt-image-1.5',
      'gpt-image-1',
      'qwen-image-2.0-2026-03-03',
    ]);
    expect(inspected.catalogMatchedIds).toEqual([
      'dall-e-3',
      'gpt-image-2',
      'gpt-image-1',
      'qwen-image-2.0-2026-03-03',
    ]);
    expect(inspected.reconciledModels.map((model) => model.id)).toEqual([
      'gpt-image-2',
      'gpt-image-1',
      'dall-e-3',
      'qwen-image-2.0-2026-03-03',
    ]);
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

  it('maps grok quality ids onto the pro catalog rule', () => {
    const resolved = resolveImageModelRule({
      providerId: 'image-endpoint',
      modelId: 'grok-imagine-image-quality',
    });

    expect(resolved.ruleId).toBe('image-endpoint-grok-imagine-image-pro');
    expect(resolved.concreteModelId).toBe('grok-imagine-image-quality');
    expect(resolved.matchKind).toBe('exact');
  });

  it('summarizes gpt-image-1 text-to-image and image-edit capability separately from availability', () => {
    const summary = summarizeImageModelCapabilities({
      providerId: 'image-endpoint',
      modelId: 'gpt-image-1',
    });

    expect(summary.operations.textToImage).toMatchObject({
      support: 'supported',
      sizePresets: ['1k', '2k'],
    });
    expect(summary.operations.imageEdit).toMatchObject({
      support: 'unsupported',
      sizePresets: [],
      reason: 'operation-unsupported',
    });
  });

  it('summarizes dall-e-3 as text-to-image only with its own size limits', () => {
    const summary = summarizeImageModelCapabilities({
      providerId: 'image-endpoint',
      modelId: 'dall-e-3',
    });

    expect(summary.operations.textToImage).toMatchObject({
      support: 'supported',
      sizePresets: ['1k', '2k'],
    });
    expect(summary.operations.imageEdit).toMatchObject({
      support: 'unsupported',
      sizePresets: [],
      reason: 'operation-unsupported',
    });
  });

  it('keeps catalog-unknown models as unknown instead of unsupported', () => {
    const summary = summarizeImageModelCapabilities({
      providerId: 'image-endpoint',
      modelId: 'custom-image-model',
    });

    expect(summary.operations.textToImage).toMatchObject({
      support: 'unknown',
      sizePresets: 'unknown',
      reason: 'not-in-local-catalog',
    });
    expect(summary.operations.imageEdit).toMatchObject({
      support: 'unknown',
      sizePresets: 'unknown',
      reason: 'not-in-local-catalog',
    });
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
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    await provider.discoverModels(config);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(init, 'signal')).toBe(false);
    fetchSpy.mockRestore();
  });

  it('measures endpoint reachability with HEAD base URL and no auth header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
      extraHeaders: { 'X-Provider-Test': '1' },
    });

    const result = await provider.measureEndpoints?.(config);

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: true,
      httpStatus: 401,
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://api.example.com/v1');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe('HEAD');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it('maps timeout failures during endpoint reachability probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('Request timed out.'), {
      name: 'TimeoutError',
    }));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
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

  it('maps DNS-like network failures during endpoint reachability probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.example.com'));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
    });

    const result = await provider.measureEndpoints?.(config);

    expect(result?.results[0]).toMatchObject({
      endpointId: 'primary',
      reachable: false,
      failureKind: 'dns',
      errorMessage: 'getaddrinfo ENOTFOUND api.example.com',
    });
    fetchSpy.mockRestore();
  });

  it('invokes generation endpoint through fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ data: [{ url: 'https://example.com/out.png' }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'dall-e-3',
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.example.com/v1/images/generations');
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.headers).toMatchObject(expect.objectContaining({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key',
    }));
    fetchSpy.mockRestore();
  });

  it('invokes edit endpoint through multipart fetch for Uint8Array input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ data: [{ url: 'https://example.com/out.png' }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com/v1', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
      extraHeaders: {
        Accept: 'application/json',
        'X-Provider-Test': '1',
        'Content-Type': 'text/plain',
        'content-type': 'application/xml',
      },
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
    expect(init?.body).toBeInstanceOf(FormData);
    expect(init?.headers).toMatchObject(expect.objectContaining({
      Authorization: 'Bearer test-key',
      Accept: 'application/json',
      'X-Provider-Test': '1',
    }));
    expect(init?.headers).not.toHaveProperty('Content-Type');
    expect(init?.headers).not.toHaveProperty('content-type');
    fetchSpy.mockRestore();
  });

  it('replays image_edit once with an alternate codec after eligible 415 rejection', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { data: [{ url: 'https://example.com/out.png' }] } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    const result = await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'fallback edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      }),
    });

    expect(result.assets).toHaveLength(1);
    expect(counting.calls).toHaveLength(2);
    expect(counting.calls[0]?.body).toBeInstanceOf(FormData);
    expect(typeof counting.calls[1]?.body).toBe('string');
    expect(String(counting.calls[1]?.body)).toContain('"images"');
  });

  it('does not replay image_edit with an alternate codec after 500', async () => {
    const counting = createCountingFetch([
      { kind: 'response', status: 500, data: { error: { message: 'Internal Server Error' } } },
      { kind: 'response', status: 200, data: { data: [{ url: 'https://example.com/out.png' }] } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    await expect(provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'no fallback edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      }),
    })).rejects.toThrow('Internal Server Error');
    expect(counting.calls).toHaveLength(1);
  });

  it('suppresses unsafe multi-endpoint recovery on 415 and logs that decision', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_image_endpoint_multi_endpoint_fallback',
    });
    const counting = createCountingFetch([
      { kind: 'response', status: 415, data: { error: { message: 'Unsupported Media Type' } } },
      { kind: 'response', status: 200, data: { data: [{ url: 'https://example.com/out.png' }] } },
    ]);
    vi.stubGlobal('fetch', counting.fetch);

    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'auto',
        endpoints: [
          { id: 'primary', url: 'https://api.example.com', enabled: true },
          { id: 'secondary', url: 'https://api-2.example.com', enabled: true },
        ],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    await expect(provider.invoke({
      config,
      logger,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'multi endpoint edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      }),
    })).rejects.toThrow('Unsupported Media Type');

    expect(counting.calls).toHaveLength(1);
    const suppressionLogs = sink.records.filter((record) => record.event === 'image-edit.recovery_suppressed');
    expect(suppressionLogs).toHaveLength(1);
    expect(suppressionLogs[0]?.level).toBe('warn');
    expect(suppressionLogs[0]?.attrs).toMatchObject({
      endpointId: 'primary',
      codecId: 'multipart-bracket',
      reason: 'no_recovery_path',
      statusCode: 415,
    });
  });

  it('logs edit request body selection without leaking image payloads', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'application', component: 'runtime' },
      traceId: 'tr_image_endpoint_logs',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ data: [{ url: 'https://example.com/out.png' }] }),
      text: async () => JSON.stringify({ data: [{ url: 'https://example.com/out.png' }] }),
    } as Response));
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.example.com', enabled: true }],
      },
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
    });

    await provider.invoke({
      config,
      logger,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'url edit',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
        providerOptions: { model: 'qwen-image-2.0-2026-03-03' },
      }),
    });

    await provider.invoke({
      config,
      logger,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'inline edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
        providerOptions: { model: 'qwen-image-2.0-2026-03-03' },
      }),
    });

    const summaries = sink.records.filter((record) => record.event === 'provider.image_endpoint.edit_request_summary');
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.attrs).toMatchObject({
      codec: 'json-reference',
      source: 'descriptor-default',
      model: 'qwen-image-2.0-2026-03-03',
      imageCount: 1,
      imageReferenceKinds: ['url'],
      maskReferenceKind: 'missing',
    });
    expect(summaries[1]?.attrs).toMatchObject({
      codec: 'multipart-bracket',
      source: 'descriptor-default',
      model: 'qwen-image-2.0-2026-03-03',
      imageCount: 1,
      imageReferenceKinds: ['inline-data'],
      maskReferenceKind: 'missing',
    });
    expect(summaries[0]?.attrs?.compatibilityKey).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(summaries[1]?.attrs?.compatibilityKey).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(JSON.stringify(sink.records)).not.toContain('iVBORw0KGgo=');
    fetchSpy.mockRestore();
  });
});
