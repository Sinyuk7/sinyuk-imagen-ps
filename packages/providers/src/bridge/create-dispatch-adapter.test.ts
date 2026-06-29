import { describe, expect, it, vi } from 'vitest';
import { createDispatchAdapter } from './create-dispatch-adapter.js';
import type { Provider } from '../contract/provider.js';
import type { ImageEndpointProviderConfig } from '../contract/config.js';
import type { CanonicalImageJobRequest } from '../contract/request.js';

describe('createDispatchAdapter', () => {
  it('passes dispatch context signal to provider.invoke', async () => {
    const abortController = new AbortController();
    const invoke = vi.fn(async () => ({
      assets: [],
    }));
    const provider: Provider<ImageEndpointProviderConfig, CanonicalImageJobRequest> = {
      id: 'mock-provider',
      family: 'image-endpoint',
      describe: () => ({
        id: 'mock-provider',
        family: 'image-endpoint',
        displayName: 'Mock Provider',
        operations: ['text_to_image'],
        invokeMode: 'sync',
      }),
      validateConfig: (input) => input as ImageEndpointProviderConfig,
      validateRequest: (input) => input as CanonicalImageJobRequest,
      invoke,
    };
    const adapter = createDispatchAdapter({
      provider,
      config: {
        providerId: 'mock-provider',
        displayName: 'Mock Provider',
        family: 'image-endpoint',
        baseURL: 'https://mock.local',
        apiKey: 'mock-key',
        imageMaxSide: 2048,
      },
    });

    await adapter.dispatch(
      { operation: 'text_to_image', prompt: 'hello' },
      { signal: abortController.signal },
    );

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      signal: abortController.signal,
    }));
  });
});
