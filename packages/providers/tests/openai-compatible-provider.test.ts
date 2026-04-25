import { afterEach, describe, expect, it, vi } from 'vitest';

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock('../src/transport/openai-compatible/http.js', () => ({
  httpRequest: httpRequestMock,
}));

import { createOpenAICompatibleProvider } from '../src/providers/openai-compatible/provider.js';

afterEach(() => {
  httpRequestMock.mockReset();
  vi.restoreAllMocks();
});

describe('openai-compatible provider', () => {
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

  it('rejects edit invocations before transport call', async () => {
    const provider = createOpenAICompatibleProvider();
    const config = provider.validateConfig({
      providerId: 'relay-a',
      displayName: 'Relay A',
      family: 'openai-compatible',
      baseURL: 'https://relay.example',
      apiKey: 'secret',
    });
    const request = provider.validateRequest({
      operation: 'edit',
      prompt: 'edit this',
    });

    await expect(
      provider.invoke({
        config,
        request,
      }),
    ).rejects.toMatchObject({
      name: 'ProviderValidationError',
    });
    expect(httpRequestMock).not.toHaveBeenCalled();
  });
});
