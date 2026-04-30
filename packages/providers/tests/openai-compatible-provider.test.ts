import { afterEach, describe, expect, it, vi } from 'vitest';

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock('../src/transport/openai-compatible/http.js', () => ({
  httpRequest: httpRequestMock,
}));

import {
  createOpenAICompatibleProvider,
  openaiCompatibleDescriptor,
} from '../src/providers/openai-compatible/index.js';

function createProviderInvokeError(
  kind: string,
  message: string,
  options?: { statusCode?: number; details?: Record<string, unknown> },
): Error {
  const err = new Error(message) as Error & { kind: string; statusCode?: number; details?: Record<string, unknown> };
  err.name = 'ProviderInvokeError';
  (err as unknown as Record<string, unknown>).kind = kind;
  if (options?.statusCode) (err as unknown as Record<string, unknown>).statusCode = options.statusCode;
  if (options?.details) (err as unknown as Record<string, unknown>).details = options.details;
  return err;
}

function makeConfig() {
  const provider = createOpenAICompatibleProvider();
  return provider.validateConfig({
    providerId: 'relay-a',
    displayName: 'Relay A',
    family: 'openai-compatible',
    baseURL: 'https://relay.example',
    apiKey: 'secret',
    extraHeaders: { 'X-Custom': 'value' },
    timeoutMs: 5000,
  });
}

afterEach(() => {
  httpRequestMock.mockReset();
  vi.restoreAllMocks();
});

describe('openai-compatible provider', () => {
  it('declares generate and edit operations in its descriptor', () => {
    expect(openaiCompatibleDescriptor.operations).toEqual(['generate', 'edit']);
    expect(openaiCompatibleDescriptor.capabilities.imageEdit).toBe(true);
    expect(openaiCompatibleDescriptor.capabilities.imageGenerate).toBe(true);
    expect(openaiCompatibleDescriptor.capabilities.transparentBackground).toBe(true);
  });

  it('propagates transport diagnostics and normalizes assets', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          data: [
            {
              url: 'https://example.com/image.png',
            },
          ],
        },
      },
      diagnostics: [
        {
          code: 'retry',
          message: 'Retrying request after HTTP 429.',
          level: 'info',
          details: {
            attempt: 1,
            delayMs: 1000,
            statusCode: 429,
            kind: 'rate_limited',
          },
        },
      ],
    });

    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
    });
    const request = provider.validateRequest({
      operation: 'generate',
      prompt: 'a cat',
      output: {
        count: 1,
      },
    });

    const result = await provider.invoke({
      config,
      request,
    });

    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      type: 'image',
      url: 'https://example.com/image.png',
      mimeType: 'image/png',
      name: 'generated-1.png',
    });
    expect(result.diagnostics).toEqual([
      {
        code: 'retry',
        message: 'Retrying request after HTTP 429.',
        level: 'info',
        details: {
          attempt: 1,
          delayMs: 1000,
          statusCode: 429,
          kind: 'rate_limited',
        },
      },
    ]);
    expect(result.raw).toEqual({
      data: [
        {
          url: 'https://example.com/image.png',
        },
      ],
    });
  });

  it('routes edit invocations to images/edits with JSON image references', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          data: [
            {
              b64_json: 'edited-base64',
            },
          ],
        },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
      defaultModel: 'gpt-image-1.5',
    });
    const request = provider.validateRequest({
      operation: 'edit',
      prompt: 'make it green',
      inputAssets: [
        {
          type: 'image',
          url: 'https://example.com/source.png',
        },
        {
          type: 'image',
          data: 'iVBORw0KGgo=',
          mimeType: 'image/png',
        },
      ],
      maskAsset: {
        type: 'image',
        data: 'mask-base64',
        mimeType: 'image/png',
      },
      output: {
        count: 1,
        width: 1024,
        height: 1024,
        quality: 'high',
        outputFormat: 'png',
      },
    });

    const result = await provider.invoke({
      config,
      request,
    });

    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://relay.example/v1/images/edits',
        method: 'POST',
        body: expect.objectContaining({
          model: 'gpt-image-1.5',
          prompt: 'make it green',
          images: [
            { image_url: 'https://example.com/source.png' },
            { image_url: 'data:image/png;base64,iVBORw0KGgo=' },
          ],
          mask: { image_url: 'data:image/png;base64,mask-base64' },
          n: 1,
          size: '1024x1024',
          quality: 'high',
          output_format: 'png',
        }),
      }),
      undefined,
      undefined,
    );
    expect(result.assets).toEqual([
      {
        type: 'image',
        name: 'generated-1.png',
        data: 'edited-base64',
        mimeType: 'image/png',
      },
    ]);
  });

  it('routes edit invocations with fileId references', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: { data: [{ b64_json: 'edited' }] },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
      defaultModel: 'gpt-image-1.5',
    });
    const request = provider.validateRequest({
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', fileId: 'file-abc123' }],
      maskAsset: { type: 'image', fileId: 'file-mask-1' },
    });

    await provider.invoke({ config, request });

    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://relay.example/v1/images/edits',
        body: expect.objectContaining({
          images: [{ file_id: 'file-abc123' }],
          mask: { file_id: 'file-mask-1' },
        }),
      }),
      undefined,
      undefined,
    );
  });

  it('exposes created, usage, and metadata on ProviderInvokeResult', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          created: 1713833628,
          data: [{ b64_json: 'AAA' }],
          output_format: 'webp',
          quality: 'high',
          size: '1024x1024',
          background: 'transparent',
          usage: {
            input_tokens: 50,
            output_tokens: 50,
            total_tokens: 100,
            input_tokens_details: { image_tokens: 40, text_tokens: 10 },
          },
        },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
      defaultModel: 'gpt-image-1.5',
    });
    const request = provider.validateRequest({
      operation: 'generate',
      prompt: 'a cat',
    });

    const result = await provider.invoke({ config, request });

    expect(result.created).toBe(1713833628);
    expect(result.usage).toEqual({
      inputTokens: 50,
      outputTokens: 50,
      totalTokens: 100,
      inputTokensDetails: { imageTokens: 40, textTokens: 10 },
    });
    expect(result.metadata).toEqual({
      background: 'transparent',
      outputFormat: 'webp',
      quality: 'high',
      size: '1024x1024',
    });
    expect(result.assets[0]).toMatchObject({
      mimeType: 'image/webp',
      name: 'generated-1.webp',
    });
  });

  it('omits optional result fields when upstream does not provide them', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          data: [{ url: 'https://example.com/a.png' }],
        },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
    });
    const request = provider.validateRequest({ operation: 'generate', prompt: 'x' });

    const result = await provider.invoke({ config, request });

    expect('created' in result).toBe(false);
    expect('usage' in result).toBe(false);
    expect('metadata' in result).toBe(false);
    expect('diagnostics' in result).toBe(false);
  });
});

describe('openai-compatible provider discoverModels', () => {
  it('returns image models on successful discovery', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          object: 'list',
          data: [
            { id: 'dall-e-3', object: 'model', created: 1699809600, owned_by: 'openai-dev' },
            { id: 'gpt-4', object: 'model', created: 1687882411, owned_by: 'openai' },
          ],
        },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    const models = await provider.discoverModels!(config);

    expect(models).toEqual([{ id: 'dall-e-3', displayName: 'Dall E 3' }]);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://relay.example/v1/models',
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'X-Custom': 'value',
        }),
        timeoutMs: 5000,
      }),
      undefined,
      undefined,
    );
  });

  it('returns empty array when no image models match', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: {
          object: 'list',
          data: [
            { id: 'gpt-4', object: 'model' },
            { id: 'text-embedding-ada-002', object: 'model' },
          ],
        },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    const models = await provider.discoverModels!(config);

    expect(models).toEqual([]);
  });

  it('propagates auth_failed error from httpRequest', async () => {
    const authError = createProviderInvokeError('auth_failed', 'Invalid API key', { statusCode: 401 });
    httpRequestMock.mockRejectedValue(authError);

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    await expect(provider.discoverModels!(config)).rejects.toMatchObject({
      message: 'Invalid API key',
    });
    await expect(provider.discoverModels!(config)).rejects.toHaveProperty('kind', 'auth_failed');
  });

  it('propagates timeout error from httpRequest', async () => {
    const timeoutError = createProviderInvokeError('timeout', 'Request timed out.');
    httpRequestMock.mockRejectedValue(timeoutError);

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    await expect(provider.discoverModels!(config)).rejects.toMatchObject({
      message: 'Request timed out.',
    });
    await expect(provider.discoverModels!(config)).rejects.toHaveProperty('kind', 'timeout');
  });

  it('throws invalid_response when response data is missing data field', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: { object: 'list' }, // missing "data" field
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    await expect(provider.discoverModels!(config)).rejects.toMatchObject({
      message: expect.stringContaining('"data" is not an array'),
    });
    await expect(provider.discoverModels!(config)).rejects.toHaveProperty('kind', 'invalid_response');
  });

  it('constructs correct HTTP request with URL, method, and headers', async () => {
    httpRequestMock.mockResolvedValue({
      response: {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        data: { object: 'list', data: [] },
      },
      diagnostics: [],
    });

    const provider = createOpenAICompatibleProvider();
    const config = makeConfig();

    await provider.discoverModels!(config);

    expect(httpRequestMock).toHaveBeenCalledWith(
      {
        url: 'https://relay.example/v1/models',
        method: 'GET',
        headers: {
          Authorization: 'Bearer secret',
          'X-Custom': 'value',
        },
        timeoutMs: 5000,
      },
      undefined,
      undefined,
    );
  });
});
