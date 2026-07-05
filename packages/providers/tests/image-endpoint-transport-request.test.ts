import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createImageEndpointProvider,
} from '../src/providers/image-endpoint/index.js';
import { imageEndpointModel } from './model-execution.js';

interface TransportCapture {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly bodyText: string;
  readonly bodyBytes: Uint8Array;
}

function installTransportCapture(responseBody: unknown = { data: [{ url: 'https://example.com/out.png' }] }): {
  readonly captures: TransportCapture[];
} {
  const captures: TransportCapture[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(typeof input === 'string' ? input : input.toString(), init);
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    captures.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      bodyText: new TextDecoder().decode(bodyBytes),
      bodyBytes,
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
  return { captures };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('image endpoint transport request characterization', () => {
  it('records the final generation transport request', async () => {
    const { captures } = installTransportCapture();
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
      extraHeaders: {
        Accept: 'application/json',
        'X-Trace': 'transport-test',
      },
      defaultModel: 'dall-e-3',
    });

    await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'text_to_image',
        prompt: 'transport generation',
        model: imageEndpointModel('dall-e-3', 'image-endpoint-variant'),
      }),
    });

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      url: 'https://api.example.com/v1/images/generations',
      method: 'POST',
    });
    expect(captures[0]?.headers.authorization).toBe('Bearer test-key');
    expect(captures[0]?.headers.accept).toBe('application/json');
    expect(captures[0]?.headers['x-trace']).toBe('transport-test');
    expect(captures[0]?.headers['content-type']).toContain('application/json');
    expect(captures[0]?.bodyText).toContain('"prompt":"transport generation"');
    expect(captures[0]?.bodyBytes.byteLength).toBeGreaterThan(0);
  });

  it('records the final multipart edit transport request bytes and auto content-type', async () => {
    const { captures } = installTransportCapture();
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
      extraHeaders: {
        Accept: 'application/json',
        'X-Trace': 'transport-test',
        'Content-Type': 'text/plain',
      },
      defaultModel: 'gpt-image-2',
    });

    await provider.invoke({
      config,
      request: provider.validateRequest({
        operation: 'image_edit',
        prompt: 'transport edit',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png', name: 'input.png' }],
        model: imageEndpointModel('gpt-image-2'),
      }),
    });

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      url: 'https://api.example.com/v1/images/edits',
      method: 'POST',
    });
    expect(captures[0]?.headers.authorization).toBe('Bearer test-key');
    expect(captures[0]?.headers.accept).toBe('application/json');
    expect(captures[0]?.headers['x-trace']).toBe('transport-test');
    expect(captures[0]?.headers['content-type']).toContain('multipart/form-data; boundary=');
    expect(captures[0]?.bodyBytes.byteLength).toBeGreaterThan(0);
    expect(captures[0]?.bodyText).toContain('name="image[]"');
    expect(captures[0]?.bodyText).toContain('filename="input.png"');
  });
});
